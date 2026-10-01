"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Search, X as XIcon, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchAllHearingsForCompare,
  unarchiveHearingByHearingId,
} from "@/app/(dashboard)/actions";

export interface CasewellEntry {
  claimant: string;
  ssn: string;
  claimType: string;
  hearingDate: string;
  city: string;
  state: string;
  assignedRepName: string;
  statusDate: string;
}

type CasewellCategory = "new" | "rescheduled" | "duplicate" | "archived";

// [HSLD-08] Parses a Casewell hearings export, maps its columns, categorizes
// each row against the live `hearings` table (New/Rescheduled/Duplicate/
// Archived) reusing the Chronicle check's matching approach minus the time
// dimension Casewell's export doesn't have, and imports confirmed-new rows
// via the same generic `/api/import/insert` endpoint the Chronicle check's
// own "vs Hearings (main)" flow uses. Rescheduled rows are surfaced but not
// auto-applied as a date update on the existing hearing; that is a separate,
// not-yet-requested piece of scope, left as a known gap rather than guessed.
export function CasewellCompareModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{
    msg: string;
    type: "loading" | "success" | "error";
  } | null>(null);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [results, setResults] = useState<
    (CasewellEntry & {
      _cat: CasewellCategory;
      prevDate?: string;
      prevClaimant?: string;
      archivedHearingId?: number;
    })[]
    | null
  >(null);
  const [activeTab, setActiveTab] = useState<CasewellCategory>("new");
  const [newSearch, setNewSearch] = useState("");
  const [reschedSearch, setReschedSearch] = useState("");
  const [dupSearch, setDupSearch] = useState("");
  const [archivedSearch, setArchivedSearch] = useState("");

  const normalizeDate = (d: string) => {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
    return d;
  };

  const parseCsvRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const US_STATE_ABBR = new Set([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "PR", "DC",
  ]);

  // "Hearing office" shows up in three shapes in a real export: "City, ST",
  // "City, ST (Suffix)", and a comma-less "CITY ST" (e.g. "LAS VEGAS NV",
  // "PHOENIX DOWNTOWN AZ"), plus bare city names with no state at all (e.g.
  // "Wichita"). Verified against Ems's actual export: 107 distinct offices
  // only matched the comma-less form, real enough to handle, not edge-case
  // noise. Only split off a state when it's confirmed against the US state
  // abbreviation list, never by position alone, otherwise keep the whole
  // string as the city rather than guessing, same "don't guess" approach the
  // Chronicle check already takes with its own location fields.
  const splitOffice = (office: string): { city: string; state: string } => {
    const commaMatch = office.match(/^(.*),\s*([A-Z]{2})(?:\s*\([^)]*\))?\s*$/);
    if (commaMatch && US_STATE_ABBR.has(commaMatch[2]))
      return { city: commaMatch[1].trim(), state: commaMatch[2] };
    const tokens = office.trim().split(/\s+/);
    const last = tokens[tokens.length - 1];
    if (tokens.length > 1 && US_STATE_ABBR.has(last))
      return { city: tokens.slice(0, -1).join(" "), state: last };
    return { city: office.trim(), state: "" };
  };

  // Same suffix-strip the Chronicle check applies to DB-side claimant names,
  // so a hearing previously imported as "Name (Rescheduled)" still matches
  // on name rather than falsely reading as a new person.
  const stripSuffix = (name: string) =>
    name.replace(/\s*\([^)]+\)\s*$/g, "").trim();

  const parseCasewellCsv = (text: string): CasewellEntry[] => {
    const lines = text.split(/\r?\n/);
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, ""));
    const headerLower = headers.map((h) => h.trim().toLowerCase());
    const findCol = (...candidates: string[]) => {
      for (const cand of candidates) {
        const idx = headerLower.indexOf(cand.toLowerCase());
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const idxFirst = findCol("First Name");
    const idxLast = findCol("Last Name");
    const idxSsn = findCol("SSN (Last 4)");
    const idxHearingDate = findCol("Hearing Date");
    const idxClaimType = findCol("Claim Type");
    const idxOffice = findCol("Hearing office");
    const idxAssignedTo = findCol("Assigned To");
    const idxStatusDate = findCol("Status Date");

    const cell = (row: string[], idx: number) =>
      idx >= 0 ? (row[idx] || "").trim().replace(/^"|"$/g, "") : "";

    const entries: CasewellEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const row = parseCsvRow(lines[i]);

      const firstName = cell(row, idxFirst);
      const lastName = cell(row, idxLast);
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) continue;

      const ssn = cell(row, idxSsn)
        .replace(/\D/g, "")
        .slice(-4)
        .padStart(4, "0");
      const hearingDate = normalizeDate(cell(row, idxHearingDate));

      // Casewell emits "T2", "T16", or "T2, T16"; same detection approach
      // the Chronicle check already uses for its own "TITLE 2"/"SSDI_T2"
      // style variants, normalized to the same stored claim_type values.
      let claimType = cell(row, idxClaimType);
      const ct = claimType.toUpperCase();
      const hasT2 = ct.includes("T2");
      const hasT16 = ct.includes("T16");
      if (hasT2 && hasT16) claimType = "Concurrent";
      else if (hasT2) claimType = "Title II";
      else if (hasT16) claimType = "Title XVI";

      const { city, state } = splitOffice(cell(row, idxOffice));

      entries.push({
        claimant: fullName,
        ssn,
        claimType,
        hearingDate,
        city,
        state,
        assignedRepName: cell(row, idxAssignedTo),
        statusDate: normalizeDate(cell(row, idxStatusDate)),
      });
    }
    return entries;
  };

  const handleCompare = async () => {
    if (!file) return;
    setStatus({ msg: "Loading hearings from database...", type: "loading" });
    setResults(null);
    setImportResult(null);

    try {
      const { hearings: dbHearings } =
        await fetchAllHearingsForCompare("hearings");
      setDbCount(dbHearings.length);

      // Casewell's export has no hearing time, so unlike the Chronicle check
      // there's only one active-hearing tier (name+SSN+date match), not a
      // separate exact-vs-date-only split driven by a time comparison.
      const dateMap = new Map<string, boolean>();
      const personMap = new Map<string, { date: string; claimant: string }[]>();
      const archivedDateMap = new Map<string, number>();
      const archivedPersonMap = new Map<string, number>();

      for (const h of dbHearings) {
        const base = stripSuffix(h.claimant || "").toLowerCase();
        const ssn = (h.ssn_last_4 || "").trim().padStart(4, "0");
        const date = h.hearing_date || "";
        if (!base || !ssn) continue;

        if (h.is_archived) {
          const hid = Number(h.id);
          archivedDateMap.set(`${base}|${ssn}|${date}`, hid);
          archivedPersonMap.set(`${base}|${ssn}`, hid);
        } else {
          dateMap.set(`${base}|${ssn}|${date}`, true);
          const pk = `${base}|${ssn}`;
          if (!personMap.has(pk)) personMap.set(pk, []);
          personMap.get(pk)!.push({ date, claimant: h.claimant });
        }
      }

      setStatus({ msg: "Parsing Casewell CSV...", type: "loading" });
      const text = await file.text();
      const entries = parseCasewellCsv(text);

      const categorized: (CasewellEntry & {
        _cat: CasewellCategory;
        prevDate?: string;
        prevClaimant?: string;
        archivedHearingId?: number;
      })[] = [];
      let newCount = 0,
        reschedCount = 0,
        dupCount = 0,
        archivedCount = 0;

      for (const entry of entries) {
        const nameLower = entry.claimant.toLowerCase();
        const pk = `${nameLower}|${entry.ssn}`;

        if (dateMap.has(`${pk}|${entry.hearingDate}`)) {
          categorized.push({ ...entry, _cat: "duplicate" });
          dupCount++;
          continue;
        }

        const archivedHid =
          archivedDateMap.get(`${pk}|${entry.hearingDate}`) ??
          archivedPersonMap.get(pk);
        if (archivedHid !== undefined) {
          categorized.push({
            ...entry,
            _cat: "archived",
            archivedHearingId: archivedHid,
          });
          archivedCount++;
          continue;
        }

        if (personMap.has(pk)) {
          const prev = personMap
            .get(pk)!
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          categorized.push({
            ...entry,
            _cat: "rescheduled",
            prevDate: prev.date,
            prevClaimant: prev.claimant,
          });
          reschedCount++;
          continue;
        }

        categorized.push({ ...entry, _cat: "new" });
        newCount++;
      }

      setResults(categorized);
      setStatus({
        msg: `Compared ${categorized.length} entries: ${newCount} new, ${reschedCount} rescheduled, ${dupCount} duplicates, ${archivedCount} archived`,
        type: "success",
      });
      setActiveTab(
        newCount > 0
          ? "new"
          : reschedCount > 0
            ? "rescheduled"
            : archivedCount > 0
              ? "archived"
              : "duplicate",
      );
    } catch (e: unknown) {
      setStatus({
        msg: e instanceof Error ? e.message : "Compare failed",
        type: "error",
      });
    }
  };

  // Field order doubles as the column mapping /api/import/insert expects
  // (field name -> column index). No "representative" key, deliberately:
  // Assigned To doesn't resolve to assigned_rep_id (see HSLD-08 tracker), so
  // it's left out of the mapping entirely rather than firing a lookup that
  // would match nothing.
  //
  // hearing_time and time_zone are both NOT NULL on `hearings` with no
  // default, discovered live when a real import attempt failed that
  // constraint on every row (Casewell's export carries neither). time_zone
  // gets Chronicle's own hardcoded "ET" regardless of source; hearing_time
  // has no real value to fall back to, so Casewell-imported rows get a fixed
  // "00:00" placeholder rather than a schema change to a column other
  // features depend on. This is a known, flagged approximation, not a
  // silent guess: staff should treat the hearing_date as authoritative and
  // the time as not yet known for any hearing imported through this check.
  const IMPORT_FIELDS = [
    "claimant",
    "ssn_last_4",
    "claim_type",
    "hearing_date",
    "hearing_time",
    "time_zone",
    "city",
    "state",
    "status_date",
  ] as const;
  const PLACEHOLDER_HEARING_TIME = "00:00";
  const PLACEHOLDER_TIME_ZONE = "ET";

  const handleImportNew = async () => {
    if (!results) return;
    const newEntries = results.filter((e) => e._cat === "new");
    if (newEntries.length === 0) return;
    setImporting(true);
    try {
      const mapping = Object.fromEntries(
        IMPORT_FIELDS.map((f, i) => [f, i]),
      );
      const records = newEntries.map((e, i) => ({
        data: [
          e.claimant,
          e.ssn,
          e.claimType,
          e.hearingDate,
          PLACEHOLDER_HEARING_TIME,
          PLACEHOLDER_TIME_ZONE,
          e.city,
          e.state,
          e.statusDate,
        ],
        rowIndex: i,
        row: i + 2,
      }));
      const res = await fetch("/api/import/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, mapping, hyperlinks: {}, comments: {} }),
      });
      const data = await res.json();
      setImportResult({
        imported: data.success ? data.imported : 0,
        skipped: data.success ? data.skipped || 0 : newEntries.length,
        errors: data.success ? data.errors || [] : [],
      });
    } catch {
      setImportResult({ imported: 0, skipped: newEntries.length, errors: [] });
    }
    setImporting(false);
  };

  const [unarchiving, setUnarchiving] = useState<number | null>(null);

  const handleUnarchive = async (entry: CasewellEntry & { archivedHearingId?: number }) => {
    if (!entry.archivedHearingId) return;
    setUnarchiving(entry.archivedHearingId);
    await unarchiveHearingByHearingId(entry.archivedHearingId);
    setResults(
      (prev) =>
        prev?.filter((e) => e.archivedHearingId !== entry.archivedHearingId) ??
        prev,
    );
    setUnarchiving(null);
  };

  const TAB_META: Record<
    CasewellCategory,
    { label: string; dotClass: string; activeClass: string; textClass: string }
  > = {
    new: {
      label: "New Entries",
      dotClass: "bg-emerald-500",
      activeClass:
        "border-emerald-400 ring-1 ring-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20",
      textClass: "text-emerald-700 dark:text-emerald-400",
    },
    rescheduled: {
      label: "Rescheduled",
      dotClass: "bg-blue-500",
      activeClass:
        "border-blue-400 ring-1 ring-blue-400 bg-blue-50/50 dark:bg-blue-950/20",
      textClass: "text-blue-700 dark:text-blue-400",
    },
    archived: {
      label: "Archived",
      dotClass: "bg-violet-500",
      activeClass:
        "border-violet-400 ring-1 ring-violet-400 bg-violet-50/50 dark:bg-violet-950/20",
      textClass: "text-violet-700 dark:text-violet-400",
    },
    duplicate: {
      label: "Duplicates",
      dotClass: "bg-amber-500",
      activeClass:
        "border-amber-400 ring-1 ring-amber-400 bg-amber-50/50 dark:bg-amber-950/20",
      textClass: "text-amber-700 dark:text-amber-400",
    },
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">
              📊 CSV Compare — Casewell
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload a Casewell hearings export to compare against{" "}
              {dbCount?.toLocaleString() ?? "..."} records in Hearings (main)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <span className="text-lg">📁</span>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {file ? file.name : "Choose Casewell CSV file"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : "Export from Casewell → Upload here"}
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResults(null);
                  setStatus(null);
                  setImportResult(null);
                }}
              />
            </label>
            <Button
              size="sm"
              disabled={!file || status?.type === "loading"}
              onClick={handleCompare}
              className="h-10 gap-1.5"
            >
              {status?.type === "loading" ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Compare
            </Button>
          </div>

          {status && (
            <div
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm",
                status.type === "loading" &&
                  "bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800",
                status.type === "success" &&
                  "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
                status.type === "error" &&
                  "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800",
              )}
            >
              {status.msg}
            </div>
          )}

          {results && results.length > 0 && (
            <>
              {(() => {
                const counts: Record<CasewellCategory, number> = {
                  new: 0,
                  rescheduled: 0,
                  duplicate: 0,
                  archived: 0,
                };
                for (const e of results) counts[e._cat]++;
                const order: CasewellCategory[] = [
                  "new",
                  "rescheduled",
                  "archived",
                  "duplicate",
                ];
                return (
                  <div className="grid grid-cols-4 gap-3">
                    {order.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setActiveTab(cat)}
                        className={cn(
                          "rounded-lg border p-3 text-center transition-all",
                          activeTab === cat
                            ? TAB_META[cat].activeClass
                            : "hover:bg-muted/40",
                        )}
                      >
                        <p
                          className={cn(
                            "text-2xl font-bold tabular-nums",
                            TAB_META[cat].textClass,
                          )}
                        >
                          {counts[cat]}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">
                          {TAB_META[cat].label}
                        </p>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {(() => {
                const searchByTab: Record<
                  CasewellCategory,
                  [string, (v: string) => void]
                > = {
                  new: [newSearch, setNewSearch],
                  rescheduled: [reschedSearch, setReschedSearch],
                  duplicate: [dupSearch, setDupSearch],
                  archived: [archivedSearch, setArchivedSearch],
                };
                const [search, setSearch] = searchByTab[activeTab];
                const rows = results.filter((e) => e._cat === activeTab);
                const q = search.toLowerCase();
                const filtered = q
                  ? rows.filter(
                      (e) =>
                        e.claimant.toLowerCase().includes(q) ||
                        (e.ssn || "").includes(q) ||
                        (e.city || "").toLowerCase().includes(q) ||
                        (e.hearingDate || "").includes(q),
                    )
                  : rows;
                const meta = TAB_META[activeTab];
                const showPrevDate = activeTab === "rescheduled";

                return (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                      <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />
                      <p className={cn("text-xs font-semibold", meta.textClass)}>
                        {meta.label} (
                        {search ? `${filtered.length}/${rows.length}` : rows.length}
                        )
                      </p>
                      <div className="ml-auto flex items-center gap-1.5">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-6 w-36 rounded border bg-background pl-6 pr-2 text-[10px] focus:outline-none focus:ring-1"
                          />
                        </div>
                        {activeTab === "new" &&
                          rows.length > 0 &&
                          !importResult?.imported && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] gap-1"
                              disabled={importing}
                              onClick={handleImportNew}
                            >
                              {importing
                                ? "Importing..."
                                : `Import ${rows.length} New`}
                            </Button>
                          )}
                      </div>
                    </div>
                    {filtered.length > 0 ? (
                      <div className="overflow-auto max-h-80">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-semibold">
                                Claimant
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold">
                                SSN
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold">
                                Claim Type
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold">
                                Hearing Date
                              </th>
                              {showPrevDate && (
                                <th className="px-3 py-1.5 text-left font-semibold">
                                  Prev Date
                                </th>
                              )}
                              <th className="px-3 py-1.5 text-left font-semibold">
                                City
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold">
                                State
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold">
                                Assigned To
                              </th>
                              {activeTab === "archived" && (
                                <th className="px-3 py-1.5 text-left font-semibold">
                                  &nbsp;
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {filtered.map((e) => (
                              <tr
                                key={`${e.claimant}|${e.ssn}|${e.hearingDate}`}
                                className="hover:bg-muted/30"
                              >
                                <td className="px-3 py-1.5">{e.claimant}</td>
                                <td className="px-3 py-1.5">{e.ssn}</td>
                                <td className="px-3 py-1.5">{e.claimType}</td>
                                <td className="px-3 py-1.5">{e.hearingDate}</td>
                                {showPrevDate && (
                                  <td className="px-3 py-1.5">{e.prevDate}</td>
                                )}
                                <td className="px-3 py-1.5">{e.city}</td>
                                <td className="px-3 py-1.5">{e.state}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  {e.assignedRepName || "—"}
                                </td>
                                {activeTab === "archived" && (
                                  <td className="px-3 py-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[10px] gap-1"
                                      disabled={unarchiving === e.archivedHearingId}
                                      onClick={() => handleUnarchive(e)}
                                    >
                                      <ArchiveRestore className="h-3 w-3" />
                                      {unarchiving === e.archivedHearingId
                                        ? "Restoring..."
                                        : "Unarchive"}
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                        No {meta.label.toLowerCase()} entries.
                      </p>
                    )}
                  </div>
                );
              })()}

              {importResult && (
                <div
                  className={cn(
                    "rounded-lg px-4 py-2.5 text-sm",
                    importResult.imported > 0
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800",
                  )}
                >
                  Imported {importResult.imported} new hearing
                  {importResult.imported === 1 ? "" : "s"}
                  {importResult.skipped > 0 &&
                    `, skipped ${importResult.skipped}`}
                  .
                  {importResult.errors.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 text-xs opacity-90">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
