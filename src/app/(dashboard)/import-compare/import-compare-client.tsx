"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/layout";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import type { UserRole } from "@/lib/roles";
import * as XLSX from "xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SheetData {
  name: string;
  headers: string[];
  rows: unknown[][];
  hyperlinks?: Record<string, string>;
  comments?: Record<string, string>;
}

interface FieldDiff {
  old: string;
  new: string;
}

interface CompareRecord {
  rowIndex: number; // row index in sheet
  row: number; // display row number (1-based)
  claimant: string;
  hearing_date: string;
  ssn: string | null;
  existing_id: number;
  field_diffs: Record<string, FieldDiff>; // field_name → { old, new }
  data?: unknown[];
}

interface CompareResult {
  matched: CompareRecord[];
  unmatched_sheet: { claimant: string; date: string; ssn: string }[];
  unmatched_db: { claimant: string; date: string; ssn: string; id: number }[];
}

interface UpdateResult {
  updated: number;
  errors: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_FIELDS: Record<string, string> = {
  claimant: "Claimant *",
  hearing_date: "Hearing Date *",
  ssn_last_4: "SSN (Last 4)",
  claim_type: "Claim Type",
  hearing_time: "Hearing Time",
  converted_time_est: "Converted Time in EST",
  time_zone: "Time Zone",
  city: "City",
  state: "State",
  claimant_location: "Claimant Location",
  representative_location: "Rep Location",
  alj: "ALJ",
  medical_expert: "Medical Expert",
  vocational_expert: "Vocational Expert",
  status_date: "Status Date",
  entered_hearing_level_date: "Entered Hearing Level",
  download_type: "Download Type",
  manner_of_appearance: "Manner of Appearance",
  hearing_decision_status: "Decision",
  phi_sheet_complete: "PHI",
  rep_docs_complete: "Rep Docs",
  fee_agreement_complete: "Fee Agmt",
  five_day_notice: "5-Day",
  rfc_status: "RFC",
  task_assigned: "Task",
  brief_assigned_to: "Brief",
  mr_team_id: "Medical Team",
  medical_record_status: "MR Status",
  medical_record_link: "MR Worksheet",
  claimant_link: "Claimant Link",
  post_hrg_deadline: "Post HRG Deadline",
  post_hrg_notes: "Post HRG Notes",
  representative: "Representative (lookup)",
  medical_record_source: "MR Worksheet Link (hyperlink only)",
};

const SORTED_FIELDS = Object.entries(DB_FIELDS).sort(([, a], [, b]) => {
  const aReq = a.includes("*");
  const bReq = b.includes("*");
  if (aReq && !bReq) return -1;
  if (!aReq && bReq) return 1;
  return a.localeCompare(b);
});

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DB_FIELDS).map(([k, v]) => [
    k,
    v.replace(/\s*\*\s*$/, "").replace(/\s*\(.*\)\s*$/, ""),
  ]),
);

const AUTO_MAP: Record<string, string[]> = {
  claimant: ["claimant", "claimant name", "name", "client name", "client"],
  ssn_last_4: ["ssn", "ssn last 4", "ssn_last_4", "last 4 ssn", "social"],
  claim_type: ["claim type", "claim_type", "type", "claimtype"],
  hearing_date: ["hearing date", "date", "hearing_date", "hrg date"],
  hearing_time: ["hearing time", "hearing_time", "hrg time", "time"],
  converted_time_est: [
    "converted time in est",
    "converted time",
    "converted_time_est",
    "est time",
    "time in est",
  ],
  time_zone: ["time zone", "timezone", "time_zone", "tz"],
  city: ["city", "hearing city"],
  state: ["state", "hearing state"],
  claimant_location: [
    "claimant location",
    "claimant_location",
    "clmt location",
  ],
  representative_location: [
    "representative location",
    "rep location",
    "representative_location",
  ],
  alj: ["alj", "judge", "administrative law judge"],
  medical_expert: ["medical expert", "medical_expert", "me"],
  vocational_expert: ["vocational expert", "vocational_expert", "ve"],
  status_date: ["status date", "status_date"],
  entered_hearing_level_date: [
    "entered hearing level",
    "hearing level date",
    "entered_hearing_level_date",
  ],
  download_type: [
    "download type",
    "download_type",
    "download",
    "assure downloaded",
  ],
  manner_of_appearance: [
    "rep manner of appearance",
    "manner of appearance",
    "manner_of_appearance",
    "moa",
    "appearance",
  ],
  hearing_decision_status: [
    "status",
    "decision",
    "hearing_decision_status",
    "decision status",
    "hrg decision",
  ],
  phi_sheet_complete: [
    "phi sheet",
    "phi",
    "phi_sheet_complete",
    "phi complete",
  ],
  rep_docs_complete: [
    "rep docs filed with oho",
    "rep docs",
    "rep_docs_complete",
    "rep documents",
  ],
  fee_agreement_complete: [
    "completed fee agreement",
    "fee agmt",
    "fee_agreement_complete",
    "fee agreement",
  ],
  five_day_notice: [
    "5-day letter sent",
    "5-day",
    "five_day_notice",
    "5 day",
    "five day",
    "5 day notice",
  ],
  rfc_status: ["rfc", "rfc_status", "rfc status"],
  task_assigned: ["task assigned", "task", "task_assigned"],
  brief_assigned_to: ["brief", "brief_assigned_to", "brief assigned"],
  representative: ["representative", "rep", "attorney", "assigned rep"],
  mr_team_id: [
    '"mr" specialist',
    "mr specialist",
    "medical team",
    "mr_team_id",
    "mr team",
  ],
  medical_record_status: [
    "medical records status",
    "medical_record_status",
    "mr status",
  ],
  medical_record_source: [
    "status of medical records",
    "mr worksheet link",
    "mr source",
  ],
  medical_record_link: ["mr worksheet", "medical_record_link", "mr link"],
  claimant_link: ["claimant link", "claimant_link", "client link"],
  post_hrg_deadline: [
    "post hrg review deadline",
    "post hrg review",
    "post hrg deadline",
    "post_hrg_deadline",
    "post hearing deadline",
    "phrg deadline",
  ],
  post_hrg_notes: [
    "post hrg notes",
    "post_hrg_notes",
    "post hearing notes",
    "phrg notes",
  ],
};

function autoMap(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const norm = headers.map((h) => h.toLowerCase().trim());
  for (const [field, aliases] of Object.entries(AUTO_MAP)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias);
      if (idx !== -1 && !Object.values(mapping).includes(idx)) {
        mapping[field] = idx;
        break;
      }
    }
  }
  return mapping;
}

// ─── Styling ────────────────────────────────────────────────────────────────

const STEP_LABELS = [
  { num: 1, label: "Upload & Select Sheet" },
  { num: 2, label: "Map Columns" },
  { num: 3, label: "Compare & Preview" },
  { num: 4, label: "Select & Update" },
];

const BTN =
  "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg border-none cursor-pointer transition-all duration-150";
const BTN_PRIMARY = cn(
  BTN,
  "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
);
const BTN_SECONDARY = cn(BTN, "bg-muted text-foreground hover:bg-muted/80");
const BTN_SUCCESS = cn(
  BTN,
  "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed",
);

const BTN_OUTLINE = cn(
  BTN,
  "bg-transparent border border-border text-foreground hover:bg-muted",
);
const CARD = "rounded-xl border bg-card p-6 shadow-sm";

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportCompareClient({ userRole }: { userRole: string }) {
  const [step, setStep] = useState(1);

  // Step 1: Upload & sheet selection
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<number>(-1);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2: Mapping
  const [mapping, setMapping] = useState<Record<string, number>>({});

  // Step 3: Compare
  const [comparing, setComparing] = useState(false);
  const [compareProgress, setCompareProgress] = useState(0);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(
    null,
  );

  // Step 4: Select columns & update
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  // Filter/search for the diff table
  const [diffFilter, setDiffFilter] = useState<"all" | "changed" | "unchanged">(
    "changed",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [viewTab, setViewTab] = useState<string>("_all");

  // ── Helpers ──

  const currentSheet = selectedSheet >= 0 ? sheets[selectedSheet] : null;

  const toast = useCallback(
    (msg: string, type: "success" | "error" = "error") => {
      const el = document.createElement("div");
      el.className = `fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-opacity ${type === "error" ? "bg-red-600" : "bg-emerald-600"}`;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
      }, 3000);
    },
    [],
  );

  // ── Step 1: File handling ──

  const handleFile = useCallback(
    (f: File) => {
      if (!f) return;
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext || "")) {
        toast("Only .xlsx, .xls, and .csv files are supported");
        return;
      }
      setFile(f);
      setParsing(true);
      setSheets([]);
      setSelectedSheet(-1);

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array", cellStyles: true });

          const parsed: SheetData[] = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const json = XLSX.utils.sheet_to_json<unknown[]>(ws, {
              header: 1,
              defval: "",
              raw: false,
            });
            const headers = (json[0] as string[]) || [];
            const rows = json
              .slice(1)
              .filter((r: unknown[]) => r.some((c) => c !== ""));
            // Extract hyperlinks
            const hyperlinks: Record<string, string> = {};
            const comments: Record<string, string> = {};
            for (const [cell, val] of Object.entries(ws)) {
              if (cell.startsWith("!")) continue;
              const v = val as {
                l?: { Target?: string };
                c?: { t?: string; a?: string }[];
              };
              if (v.l?.Target) hyperlinks[cell] = v.l.Target;
              if (v.c && Array.isArray(v.c) && v.c.length > 0) {
                const parts = v.c
                  .map((c) => {
                    const author = c.a || "";
                    const text = (c.t || "").trim();
                    if (!text) return "";
                    return author ? `[${author}] ${text}` : text;
                  })
                  .filter(Boolean);
                if (parts.length > 0) comments[cell] = parts.join("\n");
              }
            }
            return { name, headers, rows, hyperlinks, comments };
          });
          setSheets(parsed);
          if (parsed.length === 1) {
            setSelectedSheet(0);
            setMapping(autoMap(parsed[0].headers));
          }
          setParsing(false);
        } catch {
          toast("Failed to parse file");
          setParsing(false);
        }
      };
      reader.readAsArrayBuffer(f);
    },
    [toast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const selectSheet = useCallback(
    (idx: number) => {
      setSelectedSheet(idx);
      if (sheets[idx]) setMapping(autoMap(sheets[idx].headers));
    },
    [sheets],
  );

  const removeFile = useCallback(() => {
    setFile(null);
    setSheets([]);
    setSelectedSheet(-1);
    setMapping({});
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ── Step 2: Mapping ──

  const updateMapping = useCallback((field: string, colIdx: number | null) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (colIdx === null) {
        delete next[field];
      } else {
        next[field] = colIdx;
      }
      return next;
    });
  }, []);

  // ── Step 3: Compare with DB ──

  const runCompare = useCallback(async () => {
    if (!currentSheet) return;
    if (mapping.claimant === undefined || mapping.hearing_date === undefined) {
      toast("Please map at least Claimant and Hearing Date columns");
      return;
    }

    // Fields where we should normalize before comparing (booleans, case-insensitive, etc.)
    const BOOLEAN_FIELDS = new Set([
      "phi_sheet_complete",
      "rep_docs_complete",
      "fee_agreement_complete",
      "five_day_notice",
      "task_assigned",
    ]);
    const CASE_INSENSITIVE_FIELDS = new Set([
      "hearing_decision_status",
      "medical_record_status",
      "manner_of_appearance",
      "rfc_status",
      "download_type",
      "time_zone",
    ]);

    // Normalize a value for comparison purposes
    const normalizeForCompare = (field: string, val: string): string => {
      const s = String(val ?? "").trim();
      if (!s) return "";
      if (BOOLEAN_FIELDS.has(field)) {
        const lower = s.toLowerCase();
        if (["true", "yes", "1", "✓", "y"].includes(lower)) return "true";
        if (["false", "no", "0", "n", ""].includes(lower)) return "false";
        return lower;
      }
      if (CASE_INSENSITIVE_FIELDS.has(field)) {
        return s.toLowerCase();
      }
      return s;
    };

    // Clean field_diffs: remove entries where old and new are equivalent after normalization
    const cleanDiffs = (
      diffs: Record<string, FieldDiff>,
    ): Record<string, FieldDiff> => {
      const cleaned: Record<string, FieldDiff> = {};
      for (const [field, diff] of Object.entries(diffs)) {
        const normOld = normalizeForCompare(field, diff.old);
        const normNew = normalizeForCompare(field, diff.new);
        if (normOld !== normNew) {
          cleaned[field] = diff;
        }
      }
      return cleaned;
    };

    setStep(3);
    setComparing(true);
    setCompareResult(null);
    setCompareProgress(0);
    setSelectedFields(new Set());
    setUpdateResult(null);

    try {
      const sheet = currentSheet;
      const BATCH_SIZE = 2000;
      const allMatched: CompareRecord[] = [];
      const allUnmatchedSheet: CompareResult["unmatched_sheet"] = [];

      for (let i = 0; i < sheet.rows.length; i += BATCH_SIZE) {
        const batchRows = sheet.rows.slice(i, i + BATCH_SIZE);

        const res = await fetch("/api/import/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapping,
            headers: sheet.headers,
            rows: batchRows,
            crossSheetLookups: {},
            rowOffset: i,
            compare_fields_mode: true, // signal the API to return full field diffs
          }),
        });
        const result = await res.json();

        if (result.success) {
          // Matched records with field diffs (these are duplicate_records from the API)
          if (result.duplicate_records) {
            for (const rec of result.duplicate_records) {
              const cleaned = cleanDiffs(rec.field_diffs || {});
              allMatched.push({
                rowIndex: rec.rowIndex,
                row: rec.row,
                claimant: rec.claimant,
                hearing_date: rec.hearing_date,
                ssn: rec.ssn,
                existing_id: rec.existing_id,
                field_diffs: cleaned,
                data: rec.data,
              });
            }
          }
          // New records = in sheet but not in DB
          if (result.new_records) {
            for (const rec of result.new_records) {
              allUnmatchedSheet.push({
                claimant: rec.claimant,
                date: rec.hearing_date,
                ssn: rec.ssn || "",
              });
            }
          }
        } else {
          toast(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${result.message || "Unknown error"}`,
          );
        }

        setCompareProgress(
          Math.min(
            100,
            Math.round(((i + batchRows.length) / sheet.rows.length) * 100),
          ),
        );
      }

      // Fetch DB records not in sheet
      const dbRes = await fetch("/api/import/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping, rows: [], compare_mode: true }),
      });
      const dbData = await dbRes.json();

      // Build sheet keys for matching
      const parseD = (raw: string): string => {
        if (!raw) return "";
        const s = String(raw).trim();
        const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slash) {
          const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
          return `${y}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const n = Number(s);
        if (!isNaN(n) && n > 40000 && n < 60000) {
          return new Date((n - 25569) * 86400000).toISOString().split("T")[0];
        }
        return s;
      };

      const sheetKeys = new Set<string>();
      for (const row of sheet.rows) {
        const r = row as string[];
        const claimant = String(r[mapping.claimant] || "")
          .trim()
          .toLowerCase();
        const date = parseD(String(r[mapping.hearing_date] || ""));
        if (claimant && date) sheetKeys.add(`${claimant}|${date}`);
      }

      const unmatchedDb: CompareResult["unmatched_db"] = [];
      if (dbData.all_hearings) {
        for (const h of dbData.all_hearings) {
          const c = (h.claimant || "").trim();
          const d = h.hearing_date || "";
          const key = `${c.toLowerCase()}|${d}`;
          if (!sheetKeys.has(key)) {
            unmatchedDb.push({
              claimant: c,
              date: d,
              ssn: h.ssn_last_4 || "",
              id: h.id,
            });
          }
        }
      }

      setCompareResult({
        matched: allMatched,
        unmatched_sheet: allUnmatchedSheet,
        unmatched_db: unmatchedDb,
      });
    } catch (e) {
      toast(
        "Compare failed: " + (e instanceof Error ? e.message : "Unknown error"),
      );
      console.error(e);
    }
    setComparing(false);
  }, [mapping, currentSheet, toast]);

  // ── Derived data: which fields have changes ──

  const changedFieldsSummary = useMemo(() => {
    if (!compareResult) return {};
    const summary: Record<string, number> = {};
    for (const rec of compareResult.matched) {
      for (const field of Object.keys(rec.field_diffs)) {
        summary[field] = (summary[field] || 0) + 1;
      }
    }
    return summary;
  }, [compareResult]);

  const allChangedFields = useMemo(() => {
    return Object.keys(changedFieldsSummary).sort((a, b) => {
      return (changedFieldsSummary[b] || 0) - (changedFieldsSummary[a] || 0);
    });
  }, [changedFieldsSummary]);

  // Dynamic view tabs — built from whichever fields actually have changes
  const fieldViewTabs = useMemo(() => {
    const tabs: { key: string; label: string }[] = [
      { key: "_all", label: "All Changes" },
    ];
    for (const field of allChangedFields) {
      tabs.push({
        key: field,
        label: FIELD_LABELS[field] || field,
      });
    }
    return tabs;
  }, [allChangedFields]);

  const recordsWithChanges = useMemo(() => {
    if (!compareResult) return [];
    return compareResult.matched.filter(
      (r) => Object.keys(r.field_diffs).length > 0,
    );
  }, [compareResult]);

  const recordsWithoutChanges = useMemo(() => {
    if (!compareResult) return [];
    return compareResult.matched.filter(
      (r) => Object.keys(r.field_diffs).length === 0,
    );
  }, [compareResult]);

  // Filtered records for the preview table
  const filteredRecords = useMemo(() => {
    let records =
      diffFilter === "changed"
        ? recordsWithChanges
        : diffFilter === "unchanged"
          ? recordsWithoutChanges
          : compareResult?.matched || [];

    // If a specific field view tab is active, filter to records that have a diff for that field
    if (viewTab !== "_all") {
      records = records.filter((r) => viewTab in r.field_diffs);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      records = records.filter(
        (r) =>
          r.claimant.toLowerCase().includes(term) ||
          (r.ssn && r.ssn.includes(term)) ||
          r.hearing_date.includes(term),
      );
    }
    return records;
  }, [
    compareResult,
    diffFilter,
    searchTerm,
    recordsWithChanges,
    recordsWithoutChanges,
    viewTab,
  ]);

  // Counts per view tab (for badge numbers)
  const viewTabCounts = useMemo(() => {
    if (!compareResult) return {} as Record<string, number>;
    const counts: Record<string, number> = { _all: recordsWithChanges.length };
    for (const tab of fieldViewTabs) {
      if (tab.key === "_all") continue;
      counts[tab.key] = compareResult.matched.filter(
        (r) => tab.key in r.field_diffs,
      ).length;
    }
    return counts;
  }, [compareResult, recordsWithChanges, fieldViewTabs]);

  // ── Step 4: Toggle field selection ──

  const toggleField = useCallback((field: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);

  const selectAllFields = useCallback(() => {
    setSelectedFields(new Set(allChangedFields));
  }, [allChangedFields]);

  const deselectAllFields = useCallback(() => {
    setSelectedFields(new Set());
  }, []);

  // Records that will actually be updated (have diffs in selected fields)
  const recordsToUpdate = useMemo(() => {
    if (!compareResult || selectedFields.size === 0) return [];
    return compareResult.matched.filter((r) => {
      return Object.keys(r.field_diffs).some((f) => selectedFields.has(f));
    });
  }, [compareResult, selectedFields]);

  // ── Apply updates ──

  const applyUpdates = useCallback(async () => {
    if (recordsToUpdate.length === 0 || selectedFields.size === 0) return;

    const fieldList = Array.from(selectedFields);
    const confirmMsg = `Update ${recordsToUpdate.length} record(s) across ${fieldList.length} field(s)?\n\nFields: ${fieldList.map((f) => FIELD_LABELS[f] || f).join(", ")}`;
    if (!confirm(confirmMsg)) return;

    setUpdating(true);
    setUpdateProgress(0);
    setUpdateStatus("Preparing updates...");

    const BATCH = 250;
    let updated = 0;
    const errors: string[] = [];

    // Build update payloads: for each record, only include selected field diffs
    const updateRecords = recordsToUpdate.map((rec) => ({
      existing_id: rec.existing_id,
      rowIndex: rec.rowIndex,
      row: rec.row,
      claimant: rec.claimant,
      hearing_date: rec.hearing_date,
      ssn: rec.ssn,
      data: rec.data || currentSheet?.rows[rec.rowIndex],
      selected_fields: fieldList,
      field_diffs: Object.fromEntries(
        Object.entries(rec.field_diffs).filter(([k]) => selectedFields.has(k)),
      ),
    }));

    for (let i = 0; i < updateRecords.length; i += BATCH) {
      const batch = updateRecords.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/import/update-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: batch,
            mapping,
            headers: currentSheet!.headers,
            hyperlinks: currentSheet!.hyperlinks || {},
            comments: currentSheet!.comments || {},
            preserveExisting: false, // we're doing selective updates, don't preserve
            selectedFields: fieldList, // pass along so server only updates these
          }),
        });
        const result = await res.json();
        if (result.success) {
          updated += result.updated;
        } else {
          errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${result.message}`);
        }
      } catch {
        errors.push(`Batch ${Math.floor(i / BATCH) + 1}: Network error`);
      }
      setUpdateProgress(
        Math.min(
          100,
          Math.round(((i + batch.length) / updateRecords.length) * 100),
        ),
      );
      setUpdateStatus(
        `Updated ${updated} of ${updateRecords.length} records...`,
      );
    }

    setUpdating(false);
    setUpdateResult({ updated, errors });
    toast(
      `Updated ${updated} record(s)${errors.length > 0 ? ` with ${errors.length} error(s)` : ""}`,
      errors.length > 0 ? "error" : "success",
    );
  }, [recordsToUpdate, selectedFields, mapping, currentSheet, toast]);

  // ── Reset ──

  const resetAll = useCallback(() => {
    setStep(1);
    setFile(null);
    setSheets([]);
    setSelectedSheet(-1);
    setMapping({});
    setCompareResult(null);
    setSelectedFields(new Set());
    setUpdateResult(null);
    setUpdateProgress(0);
    setSearchTerm("");
    setDiffFilter("changed");
    setViewTab("_all");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const mappedCount = Object.keys(mapping).length;
  const canProceedToMap =
    selectedSheet >= 0 && currentSheet && currentSheet.rows.length > 0;

  return (
    <>
      <AppHeader
        title="Compare & Update Hearings"
        subtitle="Compare spreadsheet data against the database and selectively update fields"
      />
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <DashboardNav userRole={userRole as UserRole} />

        {/* ── Step Indicator ── */}
        <div className="flex flex-col sm:flex-row gap-2">
          {STEP_LABELS.map((s) => (
            <div
              key={s.num}
              className={cn(
                "flex-1 rounded-lg px-4 py-3 text-center font-medium text-sm transition-all",
                step === s.num
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : step > s.num
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <span className="font-bold mr-1.5">Step {s.num}</span>
              {s.label}
            </div>
          ))}
        </div>

        {/* ════════════════ STEP 1: Upload & Select Sheet ════════════════ */}
        {step === 1 && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-1">
              📁 Upload Spreadsheet
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your XLSX file and select the sheet tab to compare against
              the hearings database.
            </p>

            {/* Upload zone */}
            {!file && (
              <div
                className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="text-4xl mb-3">📄</div>
                <div className="text-base font-medium text-foreground">
                  Drag & drop your file here, or click to browse
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Supports .xlsx, .xls, and .csv files
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) =>
                    e.target.files?.[0] && handleFile(e.target.files[0])
                  }
                />
              </div>
            )}

            {/* File info */}
            {file && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 mb-4">
                <span className="text-2xl">📊</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {file.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  className="text-muted-foreground hover:text-destructive text-lg"
                  onClick={removeFile}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Parsing spinner */}
            {parsing && (
              <div className="flex items-center justify-center gap-3 py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  Reading file...
                </span>
              </div>
            )}

            {/* Sheet selection */}
            {sheets.length > 0 && (
              <div className="mb-4 space-y-2">
                <label className="text-sm font-medium">
                  📑 Select Sheet to Compare:
                </label>
                <select
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={selectedSheet}
                  onChange={(e) => selectSheet(Number(e.target.value))}
                >
                  {sheets.length > 1 && (
                    <option value={-1}>-- Select a sheet --</option>
                  )}
                  {sheets.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name} ({s.rows.length} rows)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sheet info */}
            {currentSheet && (
              <div className="mb-4 text-sm text-muted-foreground">
                Sheet <strong>&apos;{currentSheet.name}&apos;</strong>:{" "}
                {currentSheet.headers.length} columns,{" "}
                {currentSheet.rows.length} rows
              </div>
            )}

            {/* Bottom actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Link href="/import" className={BTN_OUTLINE}>
                ← Back to Import
              </Link>
              <button
                className={BTN_PRIMARY}
                disabled={!canProceedToMap}
                onClick={() => setStep(2)}
              >
                Next: Map Columns →
              </button>
            </div>
          </div>
        )}

        {/* ════════════════ STEP 2: Map Columns ════════════════ */}
        {step === 2 && currentSheet && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-1">
              🔗 Map Columns to Fields
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Match your spreadsheet columns to database fields. Fields marked
              with <span className="text-destructive font-bold">*</span> are
              required for matching.
              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                {mappedCount} fields mapped
              </span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SORTED_FIELDS.map(([field, label]) => (
                <div key={field} className="space-y-1">
                  <label
                    className={cn(
                      "text-sm font-medium",
                      label.includes("*") && "text-destructive",
                    )}
                  >
                    {label}
                  </label>
                  <select
                    className={cn(
                      "w-full rounded-lg border bg-background px-3 py-2 text-sm",
                      mapping[field] !== undefined &&
                        "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                    )}
                    value={mapping[field] ?? ""}
                    onChange={(e) =>
                      updateMapping(
                        field,
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">-- Don&apos;t import --</option>
                    {currentSheet.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button className={BTN_SECONDARY} onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className={BTN_PRIMARY} onClick={runCompare}>
                Next: Compare with DB →
              </button>
            </div>
          </div>
        )}

        {/* ════════════════ STEP 3: Compare & Preview ════════════════ */}
        {step === 3 && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-1">🔍 Compare Results</h2>

            {/* Loading */}
            {comparing && (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  Comparing spreadsheet against database...
                </span>
                {compareProgress > 0 && (
                  <div className="w-full max-w-md space-y-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${compareProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-center text-muted-foreground">
                      {compareProgress}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {compareResult && (
              <>
                {/* ── Summary cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-2xl font-bold">
                      {compareResult.matched.length}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Matched Records
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {recordsWithChanges.length}
                    </div>
                    <div className="text-xs text-amber-600 dark:text-amber-500">
                      With Differences
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {compareResult.unmatched_sheet.length}
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-500">
                      In Sheet Only
                    </div>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-center">
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                      {compareResult.unmatched_db.length}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-500">
                      In DB Only
                    </div>
                  </div>
                </div>

                {/* ── Field-level change summary ── */}
                {allChangedFields.length > 0 && (
                  <div className="mb-5 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold mb-3">
                      📊 Fields with Changes — Select columns to update
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        className={cn(
                          BTN,
                          "text-xs px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20",
                        )}
                        onClick={selectAllFields}
                      >
                        Select All
                      </button>
                      <button
                        className={cn(
                          BTN,
                          "text-xs px-3 py-1.5 bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                        onClick={deselectAllFields}
                      >
                        Deselect All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {allChangedFields.map((field) => {
                        const isSelected = selectedFields.has(field);
                        return (
                          <button
                            key={field}
                            onClick={() => toggleField(field)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer border",
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-4 w-4 rounded-sm border text-[10px]",
                                isSelected
                                  ? "bg-white/20 border-white/30 text-primary-foreground"
                                  : "border-border",
                              )}
                            >
                              {isSelected ? "✓" : ""}
                            </span>
                            {FIELD_LABELS[field] || field}
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                isSelected
                                  ? "bg-white/20 text-primary-foreground"
                                  : "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400",
                              )}
                            >
                              {changedFieldsSummary[field]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedFields.size > 0 && (
                      <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                        ✅ {selectedFields.size} field(s) selected —{" "}
                        {recordsToUpdate.length} record(s) will be updated
                      </div>
                    )}
                  </div>
                )}

                {/* ── Field View Tabs ── */}
                <div className="mb-3 overflow-x-auto">
                  <div className="flex gap-1 border-b pb-0">
                    {fieldViewTabs.map((tab) => {
                      const count = viewTabCounts[tab.key] || 0;
                      const isActive = viewTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => {
                            setViewTab(tab.key);
                            // Auto-switch to "changed" filter when selecting a specific field
                            if (
                              tab.key !== "_all" &&
                              diffFilter === "unchanged"
                            ) {
                              setDiffFilter("changed");
                            }
                          }}
                          className={cn(
                            "relative px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-lg transition-colors",
                            isActive
                              ? "bg-card text-foreground border border-b-0 border-border -mb-px z-10"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            tab.key !== "_all" && count === 0 && "opacity-40",
                          )}
                        >
                          {tab.label}
                          {count > 0 && (
                            <span
                              className={cn(
                                "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                isActive
                                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Filter & search ── */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="flex gap-1.5">
                    {(["changed", "all", "unchanged"] as const).map((f) => (
                      <button
                        key={f}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          diffFilter === f
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                        onClick={() => setDiffFilter(f)}
                      >
                        {f === "changed"
                          ? `Changed (${recordsWithChanges.length})`
                          : f === "unchanged"
                            ? `Unchanged (${recordsWithoutChanges.length})`
                            : `All (${compareResult.matched.length})`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Search by claimant, SSN, date..."
                    className="flex-1 min-w-48 rounded-lg border bg-background px-3 py-2 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* ── Diff preview table ── */}
                <div className="max-h-125 overflow-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          Row
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          Claimant
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          Hearing Date
                        </th>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          SSN
                        </th>
                        {viewTab !== "_all" ? (
                          <>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                              Current (DB)
                            </th>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                              New (Sheet)
                            </th>
                          </>
                        ) : (
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap min-w-64">
                            Field Changes
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((rec, i) => {
                        const diffs = Object.entries(rec.field_diffs);
                        const hasChanges = diffs.length > 0;

                        // For specific field tab, show that field's old/new in dedicated columns
                        if (viewTab !== "_all") {
                          const diff = rec.field_diffs[viewTab];
                          return (
                            <tr
                              key={i}
                              className="border-t hover:bg-muted/50 bg-amber-50/50 dark:bg-amber-950/10"
                            >
                              <td className="px-3 py-2 text-muted-foreground">
                                {rec.row}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {rec.claimant}
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                {rec.hearing_date}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground tabular-nums">
                                {rec.ssn || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {diff ? (
                                  <span className="text-red-600 dark:text-red-400">
                                    {diff.old || "(empty)"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {diff ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    {diff.new || "(empty)"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        // "All Changes" tab — show all diffs inline
                        return (
                          <tr
                            key={i}
                            className={cn(
                              "border-t hover:bg-muted/50",
                              hasChanges &&
                                "bg-amber-50/50 dark:bg-amber-950/10",
                            )}
                          >
                            <td className="px-3 py-2 text-muted-foreground">
                              {rec.row}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {rec.claimant}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {rec.hearing_date}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">
                              {rec.ssn || "—"}
                            </td>
                            <td className="px-3 py-2">
                              {hasChanges ? (
                                <div className="space-y-1">
                                  {diffs.map(([field, diff]) => {
                                    const label = FIELD_LABELS[field] || field;
                                    const isFieldSelected =
                                      selectedFields.has(field);
                                    return (
                                      <div
                                        key={field}
                                        className={cn(
                                          "flex items-center gap-1.5 text-[11px]",
                                          isFieldSelected && "font-semibold",
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "shrink-0 font-semibold",
                                            isFieldSelected
                                              ? "text-primary"
                                              : "text-amber-700 dark:text-amber-400",
                                          )}
                                        >
                                          {isFieldSelected ? "✓ " : ""}
                                          {label}:
                                        </span>
                                        <span
                                          className="text-red-500 dark:text-red-400 line-through truncate max-w-24"
                                          title={diff.old}
                                        >
                                          {diff.old || "(empty)"}
                                        </span>
                                        <span className="text-muted-foreground shrink-0">
                                          →
                                        </span>
                                        <span
                                          className="text-emerald-600 dark:text-emerald-400 truncate max-w-24"
                                          title={diff.new}
                                        >
                                          {diff.new || "(empty)"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  No changes
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredRecords.length === 0 && (
                        <tr>
                          <td
                            colSpan={viewTab !== "_all" ? 6 : 5}
                            className="px-3 py-8 text-center text-muted-foreground"
                          >
                            {viewTab !== "_all"
                              ? `No changes found for ${fieldViewTabs.find((t) => t.key === viewTab)?.label || viewTab}`
                              : "No records match the current filter"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ── Unmatched records (collapsible) ── */}
                {(compareResult.unmatched_sheet.length > 0 ||
                  compareResult.unmatched_db.length > 0) && (
                  <details className="mt-4 rounded-lg border">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/50">
                      📋 Unmatched Records (
                      {compareResult.unmatched_sheet.length} in sheet only,{" "}
                      {compareResult.unmatched_db.length} in DB only)
                    </summary>
                    <div className="p-4 space-y-4 border-t">
                      {compareResult.unmatched_sheet.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                            In Sheet, Not in DB (
                            {compareResult.unmatched_sheet.length})
                          </h4>
                          <div className="max-h-40 overflow-auto rounded border">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-muted">
                                <tr>
                                  <th className="px-2 py-1 text-left">#</th>
                                  <th className="px-2 py-1 text-left">
                                    Claimant
                                  </th>
                                  <th className="px-2 py-1 text-left">Date</th>
                                  <th className="px-2 py-1 text-left">SSN</th>
                                </tr>
                              </thead>
                              <tbody>
                                {compareResult.unmatched_sheet.map((r, i) => (
                                  <tr
                                    key={i}
                                    className="border-t hover:bg-muted/30"
                                  >
                                    <td className="px-2 py-1 text-muted-foreground">
                                      {i + 1}
                                    </td>
                                    <td className="px-2 py-1">{r.claimant}</td>
                                    <td className="px-2 py-1 tabular-nums">
                                      {r.date}
                                    </td>
                                    <td className="px-2 py-1 text-muted-foreground">
                                      {r.ssn || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {compareResult.unmatched_db.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">
                            In DB, Not in Sheet (
                            {compareResult.unmatched_db.length})
                          </h4>
                          <div className="max-h-40 overflow-auto rounded border">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-muted">
                                <tr>
                                  <th className="px-2 py-1 text-left">ID</th>
                                  <th className="px-2 py-1 text-left">
                                    Claimant
                                  </th>
                                  <th className="px-2 py-1 text-left">Date</th>
                                  <th className="px-2 py-1 text-left">SSN</th>
                                </tr>
                              </thead>
                              <tbody>
                                {compareResult.unmatched_db.map((r, i) => (
                                  <tr
                                    key={i}
                                    className="border-t hover:bg-muted/30"
                                  >
                                    <td className="px-2 py-1 text-muted-foreground">
                                      {r.id}
                                    </td>
                                    <td className="px-2 py-1">{r.claimant}</td>
                                    <td className="px-2 py-1 tabular-nums">
                                      {r.date}
                                    </td>
                                    <td className="px-2 py-1 text-muted-foreground">
                                      {r.ssn || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* ── Bottom actions ── */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <button className={BTN_SECONDARY} onClick={() => setStep(2)}>
                    ← Back to Mapping
                  </button>
                  <div className="flex flex-wrap gap-3">
                    {allChangedFields.length === 0 && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        ✅ No differences found — database is in sync
                      </div>
                    )}
                    {selectedFields.size > 0 && recordsToUpdate.length > 0 && (
                      <button
                        className={BTN_SUCCESS}
                        onClick={() => setStep(4)}
                      >
                        Review & Update {recordsToUpdate.length} Records →
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════ STEP 4: Confirm & Update ════════════════ */}
        {step === 4 && compareResult && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-1">
              ✅ Review & Apply Updates
            </h2>

            {!updateResult && !updating && (
              <>
                <p className="text-sm text-muted-foreground mb-5">
                  Review the changes below before applying. Only the selected
                  fields will be updated in the hearings table.
                </p>

                {/* Update summary */}
                <div className="mb-5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                        Records to Update
                      </div>
                      <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">
                        {recordsToUpdate.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                        Fields Being Updated
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Array.from(selectedFields).map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:text-blue-300"
                          >
                            {FIELD_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview of what will change — only selected fields */}
                <div className="max-h-96 overflow-auto rounded-lg border mb-5">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Claimant
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Date
                        </th>
                        {Array.from(selectedFields).map((f) => (
                          <th
                            key={f}
                            className="px-3 py-2 text-left font-medium whitespace-nowrap"
                          >
                            {FIELD_LABELS[f] || f}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recordsToUpdate.map((rec, i) => (
                        <tr key={i} className="border-t hover:bg-muted/50">
                          <td className="px-3 py-2 font-medium">
                            {rec.claimant}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {rec.hearing_date}
                          </td>
                          {Array.from(selectedFields).map((f) => {
                            const diff = rec.field_diffs[f];
                            if (!diff) {
                              return (
                                <td
                                  key={f}
                                  className="px-3 py-2 text-muted-foreground"
                                >
                                  —
                                </td>
                              );
                            }
                            return (
                              <td key={f} className="px-3 py-2">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-red-500 dark:text-red-400 line-through text-[10px]">
                                    {diff.old || "(empty)"}
                                  </span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    {diff.new || "(empty)"}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-3">
                  <button className={BTN_SECONDARY} onClick={() => setStep(3)}>
                    ← Back to Preview
                  </button>
                  <button className={BTN_SUCCESS} onClick={applyUpdates}>
                    🚀 Apply {recordsToUpdate.length} Updates
                  </button>
                </div>
              </>
            )}

            {/* Progress */}
            {updating && (
              <div className="py-8 space-y-4">
                <div className="h-4 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${updateProgress}%` }}
                  />
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    {updateProgress}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {updateStatus}
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              </div>
            )}

            {/* Results */}
            {updateResult && !updating && (
              <div className="py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                    <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                      {updateResult.updated}
                    </div>
                    <div className="text-sm text-emerald-600 dark:text-emerald-500">
                      Records Updated
                    </div>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-center">
                    <div className="text-3xl font-bold text-red-700 dark:text-red-400">
                      {updateResult.errors.length}
                    </div>
                    <div className="text-sm text-red-600 dark:text-red-500">
                      Errors
                    </div>
                  </div>
                </div>

                {updateResult.errors.length > 0 && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3 max-h-32 overflow-auto">
                    <h4 className="font-medium text-sm mb-2 text-red-800 dark:text-red-300">
                      ⚠️ Errors:
                    </h4>
                    <ul className="space-y-1">
                      {updateResult.errors.map((e, i) => (
                        <li
                          key={i}
                          className="text-xs text-red-700 dark:text-red-400"
                        >
                          • {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Link href="/" className={BTN_PRIMARY}>
                    ← Back to Dashboard
                  </Link>
                  <button className={BTN_SECONDARY} onClick={resetAll}>
                    Compare Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
