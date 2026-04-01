"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X as XIcon,
  Archive,
  ArchiveRestore,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchAllHearingsForCompare,
  importChronicleEntries,
  archiveChronicleEntries,
  getArchivedChronicles,
  getArchivedChronicleKeys,
  unarchiveChronicleEntry,
} from "@/app/(dashboard)/actions";

interface ChronicleEntry {
  claimant: string;
  ssn: string;
  claimType: string;
  hearingDate: string;
  time: string;
  timeZone: string;
  claimantLocation: string;
  repLocation: string;
  alj: string;
  medExpert: string;
  vocExpert: string;
  statusDate: string;
  enteredDate: string;
}

type CompareCategory = "new" | "rescheduled" | "duplicate";

export function CsvCompareModal({
  onClose,
  userName,
}: {
  onClose: () => void;
  userName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [compareTarget, setCompareTarget] = useState<
    "raw_hearings" | "hearings"
  >("hearings");
  const [status, setStatus] = useState<{
    msg: string;
    type: "loading" | "success" | "error";
  } | null>(null);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [results, setResults] = useState<{
    newEntries: (ChronicleEntry & { _cat: "new" })[];
    rescheduled: (ChronicleEntry & {
      _cat: "rescheduled";
      prevDate: string;
      prevTime: string;
      prevClaimant: string;
    })[];
    duplicates: (ChronicleEntry & { _cat: "duplicate" })[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<CompareCategory>("new");
  const [newSearch, setNewSearch] = useState("");
  const [importing, setImporting] = useState(false);

  const [archiveSelected, setArchiveSelected] = useState<Set<number>>(
    new Set(),
  ); // indices into results.newEntries
  const [reschedArchiveSelected, setReschedArchiveSelected] = useState<
    Set<number>
  >(new Set()); // indices into results.rescheduled
  const [reschedSearch, setReschedSearch] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archivedEntries, setArchivedEntries] = useState<
    {
      id: number;
      claimant: string;
      ssn_last_4: string;
      claim_type: string;
      hearing_date: string;
      hearing_time: string;
      alj: string;
      reason: string;
      archived_by: string;
      archived_at: string;
    }[]
  >([]);
  const [archivedKeys, setArchivedKeys] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [importingNew, setImportingNew] = useState(false);
  const [importingResched, setImportingResched] = useState(false);
  const [hearingsImportResult, setHearingsImportResult] = useState<{
    newImported: number;
    newSkipped: number;
    reschedUpdated: number;
    reschedSkipped: number;
  } | null>(null);
  // Editable dates for skipped records (rowIndex → date string)
  const [skippedDates, setSkippedDates] = useState<Record<number, string>>({});
  // Holds check-duplicates result when importing to hearings
  const [hearingsCheckResult, setHearingsCheckResult] = useState<{
    newRecords: {
      rowIndex: number;
      row: number;
      claimant: string;
      hearing_date: string;
      ssn: string;
    }[];
    rescheduledRecords: {
      rowIndex: number;
      row: number;
      original_id: number;
      claimant: string;
      hearing_date: string;
      ssn: string;
      base_name: string;
      original_claimant: string;
      original_date: string;
      original_time: string;
    }[];
    duplicateRecords: {
      rowIndex: number;
      claimant: string;
      hearing_date: string;
      ssn: string;
    }[];
    skippedRecords: {
      rowIndex: number;
      claimant: string;
      hearing_date: string | null;
      reason: string;
    }[];
    syntheticRows: string[][];
    mapping: Record<string, number>;
  } | null>(null);

  // Load DB count on mount and when target changes
  useEffect(() => {
    fetchAllHearingsForCompare(compareTarget).then((d) =>
      setDbCount(d.totalCount),
    );
  }, [compareTarget]);

  // Load archived keys for filtering
  useEffect(() => {
    getArchivedChronicleKeys().then((keys) => {
      const set = new Set<string>();
      for (const k of keys) set.add(`${k.claimant_lower}|${k.ssn}|${k.hdate}`);
      setArchivedKeys(set);
    });
  }, []);

  // Auto-check against hearings DB when target is "hearings" and compare results exist
  useEffect(() => {
    if (
      compareTarget === "hearings" &&
      results &&
      !hearingsCheckResult &&
      !importing
    ) {
      handleCheckHearings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareTarget, results]);

  const isArchived = (entry: ChronicleEntry) => {
    const key = `${entry.claimant.toLowerCase()}|${(entry.ssn || "").padStart(4, "0")}|${entry.hearingDate || ""}`;
    return archivedKeys.has(key);
  };

  const handleArchiveSelected = async (
    entries: ChronicleEntry[],
    indices: Set<number>,
  ) => {
    if (indices.size === 0) return;
    setArchiving(true);
    const toArchive = Array.from(indices)
      .map((i) => entries[i])
      .filter(Boolean)
      .map((e) => ({
        claimant: e.claimant,
        ssn_last_4: e.ssn,
        claim_type: e.claimType,
        hearing_date: e.hearingDate,
        hearing_time: e.time,
        time_zone: e.timeZone,
        claimant_location: e.claimantLocation,
        representative_location: e.repLocation,
        alj: e.alj,
        medical_expert: e.medExpert,
        vocational_expert: e.vocExpert,
        status_date: e.statusDate,
        entered_hearing_level_date: e.enteredDate,
        reason: "withdrawn",
      }));
    await archiveChronicleEntries(toArchive, userName);
    // Refresh archived keys and entries list
    const keys = await getArchivedChronicleKeys();
    const set = new Set<string>();
    for (const k of keys) set.add(`${k.claimant_lower}|${k.ssn}|${k.hdate}`);
    setArchivedKeys(set);
    const refreshedEntries = await getArchivedChronicles();
    setArchivedEntries(refreshedEntries);
    setArchiveSelected(new Set());
    setReschedArchiveSelected(new Set());
    setArchiving(false);
    // Re-run hearings check so skipped/new/rescheduled counts update
    setHearingsImportResult(null);
    handleCheckHearings(set);
  };

  const handleShowArchive = async () => {
    const entries = await getArchivedChronicles();
    setArchivedEntries(entries);
    setShowArchiveModal(true);
  };

  const handleUnarchive = async (id: number) => {
    await unarchiveChronicleEntry(id);
    setArchivedEntries((prev) => prev.filter((e) => e.id !== id));
    // Refresh keys
    const keys = await getArchivedChronicleKeys();
    const set = new Set<string>();
    for (const k of keys) set.add(`${k.claimant_lower}|${k.ssn}|${k.hdate}`);
    setArchivedKeys(set);
    // Re-run hearings check so counts update
    setHearingsImportResult(null);
    handleCheckHearings(set);
  };

  const stripSuffix = (name: string) =>
    name.replace(/\s*\([^)]+\)\s*$/g, "").trim();

  const normalizeTime = (t: string) => {
    if (!t) return "";
    const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
    if (!m) return t.toLowerCase().replace(/\s+/g, "");
    let h = parseInt(m[1], 10);
    const ampm = (m[3] || "").toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };

  const normalizeDate = (d: string) => {
    if (!d) return "";
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // MM/DD/YYYY
    const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
    return d;
  };

  const parseChronicleDateTime = (dt: string) => {
    if (!dt) return { date: "", time: "" };
    const parts = dt.trim().split(/\s+/);
    const datePart = normalizeDate(parts[0] || "");
    const timePart = parts.slice(1).join(" ");
    return { date: datePart, time: timePart };
  };

  const handleCompare = async () => {
    if (!file) return;
    setStatus({ msg: "Loading hearings from database...", type: "loading" });
    setResults(null);
    setImportResult(null);

    try {
      const { hearings: dbHearings } =
        await fetchAllHearingsForCompare(compareTarget);
      setDbCount(dbHearings.length);

      // Build lookup maps from DB
      const exactMap = new Map<string, boolean>();
      const dateMap = new Map<string, boolean>(); // name+ssn+date (ignoring time)
      const personMap = new Map<
        string,
        { date: string; time: string; claimant: string }[]
      >();

      for (const h of dbHearings) {
        const base = stripSuffix(h.claimant || "").toLowerCase();
        const ssn = (h.ssn_last_4 || "").trim().padStart(4, "0");
        const date = h.hearing_date || "";
        const time = normalizeTime(h.hearing_time || h.converted_time || "");

        if (base && ssn) {
          exactMap.set(`${base}|${ssn}|${date}|${time}`, true);
          dateMap.set(`${base}|${ssn}|${date}`, true); // date-only key
          const pk = `${base}|${ssn}`;
          if (!personMap.has(pk)) personMap.set(pk, []);
          personMap.get(pk)!.push({ date, time, claimant: h.claimant });
        }
      }

      setStatus({ msg: "Parsing Chronicle CSV...", type: "loading" });

      // Parse CSV
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));

      // Proper CSV row parser that handles quoted fields with commas
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

      const col = (row: string[], name: string) => {
        const idx = headers.findIndex((h) =>
          h.toLowerCase().includes(name.toLowerCase()),
        );
        return idx >= 0 ? (row[idx] || "").trim().replace(/^"|"$/g, "") : "";
      };

      const newEntries: (ChronicleEntry & { _cat: "new" })[] = [];
      const rescheduled: (ChronicleEntry & {
        _cat: "rescheduled";
        prevDate: string;
        prevTime: string;
        prevClaimant: string;
      })[] = [];
      const duplicates: (ChronicleEntry & { _cat: "duplicate" })[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCsvRow(lines[i]);

        const firstName = col(row, "client_firstName");
        const lastName = col(row, "client_lastName");
        const fullName = `${firstName} ${lastName}`.trim();
        if (!fullName || fullName === " ") continue;
        const ssn = col(row, "client_last4Ssn")
          .replace(/\D/g, "")
          .slice(-4)
          .padStart(4, "0");
        const { date: hDate, time: hTime } = parseChronicleDateTime(
          col(row, "hearingScheduledDatetime"),
        );

        let claimType = col(row, "claimType");
        if (claimType.includes("TITLE 2") && claimType.includes("TITLE 16"))
          claimType = "Concurrent";
        else if (claimType.includes("TITLE 2")) claimType = "Title II";
        else if (claimType.includes("TITLE 16")) claimType = "Title XVI";

        const entry: ChronicleEntry = {
          claimant: fullName,
          ssn,
          claimType,
          hearingDate: hDate,
          time: hTime,
          timeZone: "ET",
          claimantLocation: col(row, "aljLocation") || "By Phone",
          repLocation: col(row, "aljLocation") || "By Phone",
          alj: col(row, "aljFullName"),
          medExpert: col(row, "medicalExpert"),
          vocExpert: col(row, "vocationalExpert"),
          statusDate: col(row, "statusDate"),
          enteredDate: col(row, "hearingRequestDate"),
        };

        const nameLower = fullName.toLowerCase();
        const normTime = normalizeTime(hTime);
        const normDate = normalizeDate(hDate);

        // Exact duplicate? (name + ssn + date + time all match)
        if (exactMap.has(`${nameLower}|${ssn}|${normDate}|${normTime}`)) {
          duplicates.push({ ...entry, _cat: "duplicate" });
          continue;
        }

        // Same date, different time? Still a duplicate (time mismatch in DB, e.g. 11:30 vs 23:30)
        if (dateMap.has(`${nameLower}|${ssn}|${normDate}`)) {
          duplicates.push({ ...entry, _cat: "duplicate" });
          continue;
        }

        // Rescheduled? (same person + SSN, completely different date)
        const pk = `${nameLower}|${ssn}`;
        if (personMap.has(pk)) {
          const prev = personMap
            .get(pk)!
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          rescheduled.push({
            ...entry,
            _cat: "rescheduled",
            prevDate: prev.date,
            prevTime: prev.time,
            prevClaimant: prev.claimant,
          });
          continue;
        }

        newEntries.push({ ...entry, _cat: "new" });
      }

      setResults({ newEntries, rescheduled, duplicates });
      const total = newEntries.length + rescheduled.length + duplicates.length;
      setStatus({
        msg: `Compared ${total} entries: ${newEntries.length} new, ${rescheduled.length} rescheduled, ${duplicates.length} duplicates`,
        type: "success",
      });
      setActiveTab(
        newEntries.length > 0
          ? "new"
          : rescheduled.length > 0
            ? "rescheduled"
            : "duplicate",
      );
    } catch (e: unknown) {
      setStatus({
        msg: e instanceof Error ? e.message : "Compare failed",
        type: "error",
      });
    }
  };

  // Build synthetic rows from Chronicle entries for the import APIs
  const buildSyntheticData = (keysOverride?: Set<string>) => {
    if (!results) return null;
    // Send ALL entries to the server for checking — let the server do the matching
    // Filter out archived entries so they don't appear in hearings check results
    const checkArchived = keysOverride
      ? (entry: ChronicleEntry) => {
          const key = `${entry.claimant.toLowerCase()}|${(entry.ssn || "").padStart(4, "0")}|${entry.hearingDate || ""}`;
          return keysOverride.has(key);
        }
      : isArchived;
    const entries = [
      ...results.newEntries,
      ...results.rescheduled,
      ...results.duplicates,
    ].filter((e) => !checkArchived(e));
    const FIELDS = [
      "claimant",
      "ssn_last_4",
      "claim_type",
      "hearing_date",
      "hearing_time",
      "time_zone",
      "claimant_location",
      "representative_location",
      "alj",
      "medical_expert",
      "vocational_expert",
      "status_date",
      "entered_hearing_level_date",
    ];
    const mapping: Record<string, number> = {};
    FIELDS.forEach((f, i) => {
      mapping[f] = i;
    });
    const rows: string[][] = entries.map((e) => [
      e._cat === "rescheduled" ? `${e.claimant} (Rescheduled)` : e.claimant,
      e.ssn,
      e.claimType,
      e.hearingDate,
      e.time,
      e.timeZone,
      e.claimantLocation,
      e.repLocation,
      e.alj,
      e.medExpert,
      e.vocExpert,
      e.statusDate,
      e.enteredDate,
    ]);
    return { rows, mapping };
  };

  // Check duplicates against hearings table before importing
  const handleCheckHearings = async (keysOverride?: Set<string>) => {
    const data = buildSyntheticData(keysOverride);
    if (!data) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping: data.mapping,
          rows: data.rows,
          rowOffset: 0,
          fuzzy_name_match: true,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message || "Check failed");
      // Compute correct rescheduled names (Rescheduled 2, 3, etc.)
      const reschedRecords = result.rescheduled_records || [];
      const updatedRows = [...data.rows];
      for (const rec of reschedRecords) {
        const origName = rec.original_claimant || "";
        const baseName =
          rec.base_name ||
          origName.replace(/\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i, "").trim();
        // Check what number we need: if original is "John Doe (Rescheduled)", next is 2
        // If original is "John Doe (Rescheduled 2)", next is 3, etc.
        const existingMatch = origName.match(
          /\(Rescheduled(?:\s+(\d+))?\)\s*$/i,
        );
        let nextNum = 1;
        if (existingMatch) {
          nextNum = existingMatch[1] ? parseInt(existingMatch[1]) + 1 : 2;
        }
        const newName =
          nextNum === 1
            ? `${baseName} (Rescheduled)`
            : `${baseName} (Rescheduled ${nextNum})`;
        // Update the synthetic row and the record's claimant
        if (rec.rowIndex !== undefined && updatedRows[rec.rowIndex]) {
          updatedRows[rec.rowIndex][data.mapping.claimant] = newName;
        }
        rec.claimant = newName;
      }

      setHearingsCheckResult({
        newRecords: result.new_records || [],
        rescheduledRecords: reschedRecords,
        duplicateRecords: result.duplicate_records || [],
        skippedRecords: result.skipped_records || [],
        syntheticRows: updatedRows,
        mapping: data.mapping,
      });
      setSkippedDates({});
    } catch {
      /* error */
    }
    setImporting(false);
  };

  // Import new records to hearings
  // Re-check skipped records that now have dates filled in
  const handleRecheckSkipped = async () => {
    if (!hearingsCheckResult) return;
    const filledEntries = Object.entries(skippedDates).filter(([, date]) =>
      date.trim(),
    );
    if (filledEntries.length === 0) return;

    // Build new rows from skipped records with filled dates
    const { mapping } = hearingsCheckResult;
    const dateColIdx = mapping.hearing_date;
    const additionalRows: string[][] = [];

    for (const [idxStr, date] of filledEntries) {
      const idx = parseInt(idxStr);
      const skipped = hearingsCheckResult.skippedRecords[idx];
      if (!skipped || !skipped.claimant) continue;
      // Find original synthetic row by matching claimant
      const origRow = hearingsCheckResult.syntheticRows.find(
        (r) =>
          r[mapping.claimant] === skipped.claimant ||
          r[mapping.claimant] === `${skipped.claimant} (Rescheduled)`,
      );
      if (origRow) {
        const newRow = [...origRow];
        newRow[dateColIdx] = date;
        additionalRows.push(newRow);
      }
    }

    if (additionalRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping,
          rows: additionalRows,
          rowOffset: 0,
          fuzzy_name_match: true,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message || "Re-check failed");

      // Merge new results: add to existing new/rescheduled/duplicate, remove from skipped
      const filledIndices = new Set(filledEntries.map(([i]) => parseInt(i)));
      setHearingsCheckResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          newRecords: [...prev.newRecords, ...(result.new_records || [])],
          rescheduledRecords: [
            ...prev.rescheduledRecords,
            ...(result.rescheduled_records || []),
          ],
          duplicateRecords: [
            ...prev.duplicateRecords,
            ...(result.duplicate_records || []),
          ],
          skippedRecords: prev.skippedRecords.filter(
            (_, i) => !filledIndices.has(i),
          ),
          syntheticRows: [...prev.syntheticRows, ...additionalRows],
        };
      });
      setSkippedDates({});
    } catch {
      /* error */
    }
    setImporting(false);
  };

  const handleImportNewToHearings = async () => {
    if (!hearingsCheckResult || hearingsCheckResult.newRecords.length === 0)
      return;
    setImportingNew(true);
    try {
      const records = hearingsCheckResult.newRecords.map((r) => ({
        data: hearingsCheckResult.syntheticRows[r.rowIndex],
        rowIndex: r.rowIndex,
        row: r.row,
      }));
      const res = await fetch("/api/import/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records,
          mapping: hearingsCheckResult.mapping,
          hyperlinks: {},
          comments: {},
        }),
      });
      const data = await res.json();
      setHearingsImportResult((prev) => ({
        newImported: data.success ? data.imported : 0,
        newSkipped: data.success ? data.skipped || 0 : records.length,
        reschedUpdated: prev?.reschedUpdated || 0,
        reschedSkipped: prev?.reschedSkipped || 0,
      }));
    } catch {
      setHearingsImportResult((prev) => ({
        newImported: 0,
        newSkipped: hearingsCheckResult.newRecords.length,
        reschedUpdated: prev?.reschedUpdated || 0,
        reschedSkipped: prev?.reschedSkipped || 0,
      }));
    }
    setImportingNew(false);
  };

  // Process rescheduled records in hearings
  const handleImportReschedToHearings = async () => {
    if (
      !hearingsCheckResult ||
      hearingsCheckResult.rescheduledRecords.length === 0
    )
      return;
    setImportingResched(true);
    try {
      const records = hearingsCheckResult.rescheduledRecords.map((r) => {
        const row = hearingsCheckResult.syntheticRows[r.rowIndex];
        const m = hearingsCheckResult.mapping;
        return {
          data: row,
          rowIndex: r.rowIndex,
          row: r.row,
          original_id: r.original_id,
          claimant: r.claimant,
          ssn: r.ssn,
          claimantLocation: row?.[m.claimant_location] || "",
          repLocation: row?.[m.representative_location] || "",
          downloadType: "",
          statusDate: row?.[m.status_date] || "",
        };
      });
      const res = await fetch("/api/import/process-rescheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records,
          mapping: hearingsCheckResult.mapping,
          hyperlinks: {},
        }),
      });
      const data = await res.json();
      setHearingsImportResult((prev) => ({
        newImported: prev?.newImported || 0,
        newSkipped: prev?.newSkipped || 0,
        reschedUpdated: data.success ? data.updated : 0,
        reschedSkipped: data.success ? 0 : records.length,
      }));
    } catch {
      setHearingsImportResult((prev) => ({
        newImported: prev?.newImported || 0,
        newSkipped: prev?.newSkipped || 0,
        reschedUpdated: 0,
        reschedSkipped: hearingsCheckResult.rescheduledRecords.length,
      }));
    }
    setImportingResched(false);
  };

  // Export records as CSV download — enriches from syntheticRows via mapping
  const exportHearingsCsv = (
    filename: string,
    records: { rowIndex: number; [key: string]: unknown }[],
    extraColumns?: { key: string; label: string }[],
  ) => {
    if (!hearingsCheckResult) return;
    const { syntheticRows, mapping: m } = hearingsCheckResult;
    const baseHeaders = [
      "Claimant",
      "SSN",
      "Claim Type",
      "Hearing Date",
      "Time",
      "Time Zone",
      "ALJ",
      "Claimant Location",
      "Rep Location",
      "Medical Expert",
      "Vocational Expert",
      "Status Date",
      "Entered Hearing Level Date",
    ];
    const extraHeaders = extraColumns?.map((c) => c.label) || [];
    const headers = [...baseHeaders, ...extraHeaders];

    const rows = records.map((r) => {
      const row = syntheticRows[r.rowIndex] || [];
      const base = [
        row[m.claimant] || r.claimant || "",
        row[m.ssn_last_4] || r.ssn || "",
        row[m.claim_type] || "",
        row[m.hearing_date] || r.hearing_date || "",
        row[m.hearing_time] || "",
        row[m.time_zone] || "",
        row[m.alj] || "",
        row[m.claimant_location] || "",
        row[m.representative_location] || "",
        row[m.medical_expert] || "",
        row[m.vocational_expert] || "",
        row[m.status_date] || "",
        row[m.entered_hearing_level_date] || "",
      ];
      const extra = extraColumns?.map((c) => String(r[c.key] || "")) || [];
      return [...base, ...extra]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportNew = () => {
    if (!hearingsCheckResult) return;
    exportHearingsCsv("new_hearings.csv", hearingsCheckResult.newRecords);
  };

  const handleExportRescheduled = () => {
    if (!hearingsCheckResult) return;
    exportHearingsCsv(
      "rescheduled_hearings.csv",
      hearingsCheckResult.rescheduledRecords,
      [
        { key: "original_claimant", label: "Original Claimant" },
        { key: "original_date", label: "Original Date" },
        { key: "original_time", label: "Original Time" },
      ],
    );
  };

  const handleExportSkipped = () => {
    if (!hearingsCheckResult) return;
    exportHearingsCsv(
      "skipped_hearings.csv",
      hearingsCheckResult.skippedRecords,
      [{ key: "reason", label: "Reason" }],
    );
  };

  // Import to raw_hearings (simple)
  const handleImportToRaw = async () => {
    if (!results) return;
    const entries = [...results.newEntries, ...results.rescheduled].filter(
      (e) => !isArchived(e),
    );
    const toImport = entries.map((e) => ({
      claimant:
        e._cat === "rescheduled" ? `${e.claimant} (Rescheduled)` : e.claimant,
      ssn_last_4: e.ssn,
      claim_type: e.claimType,
      hearing_date: e.hearingDate,
      hearing_time: e.time,
      time_zone: e.timeZone,
      claimant_location: e.claimantLocation,
      representative_location: e.repLocation,
      alj: e.alj,
      medical_expert: e.medExpert,
      vocational_expert: e.vocExpert,
      status_date: e.statusDate,
      entered_hearing_level_date: e.enteredDate,
    }));
    if (!toImport.length) return;
    setImporting(true);
    try {
      const result = await importChronicleEntries(toImport);
      setImportResult(result);
    } catch {
      setImportResult({ imported: 0, skipped: toImport.length });
    }
    setImporting(false);
  };

  const migrateCount = results
    ? results.newEntries.length + results.rescheduled.length
    : 0;

  return (
    <>
      {[
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
          >
            <div
              className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
                <div>
                  <h2 className="text-sm font-semibold">
                    📊 CSV Compare — Chronicle Legal
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload a Chronicle CSV export to compare against{" "}
                    {dbCount?.toLocaleString() ?? "..."} records in{" "}
                    {compareTarget === "hearings"
                      ? "Hearings (main)"
                      : "Raw Hearings"}
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
                {/* Compare target + Upload */}
                <div className="flex items-center gap-3">
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-xs shrink-0"
                    value={compareTarget}
                    onChange={(e) => {
                      setCompareTarget(
                        e.target.value as "raw_hearings" | "hearings",
                      );
                      setResults(null);
                      setImportResult(null);
                    }}
                  >
                    <option value="raw_hearings">vs Raw Hearings</option>
                    <option value="hearings">vs Hearings (main)</option>
                  </select>
                  <label className="flex-1 flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <span className="text-lg">📁</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {file ? file.name : "Choose Chronicle CSV file"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file
                          ? `${(file.size / 1024).toFixed(1)} KB`
                          : "Export from Chronicle Legal → Upload here"}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] || null);
                        setResults(null);
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

                {/* Status */}
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

                {/* Results */}
                {results && (
                  <>
                    {/* Summary stats — clickable to jump to section */}
                    {(() => {
                      const visibleNew = results.newEntries.filter(
                        (e) => !isArchived(e),
                      ).length;
                      const visibleResched = results.rescheduled.filter(
                        (e) => !isArchived(e),
                      ).length;
                      const visibleDupes = results.duplicates.length;
                      return (
                        <div className="grid grid-cols-3 gap-3">
                          <button
                            onClick={() => setActiveTab("new")}
                            className={cn(
                              "rounded-lg border p-3 text-center transition-all",
                              activeTab === "new"
                                ? "border-emerald-400 ring-1 ring-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                                : "hover:bg-muted/40",
                            )}
                          >
                            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                              {visibleNew}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              New Entries
                            </p>
                          </button>
                          <button
                            onClick={() => setActiveTab("rescheduled")}
                            className={cn(
                              "rounded-lg border p-3 text-center transition-all",
                              activeTab === "rescheduled"
                                ? "border-blue-400 ring-1 ring-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                                : "hover:bg-muted/40",
                            )}
                          >
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                              {visibleResched}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              Rescheduled
                            </p>
                          </button>
                          <button
                            onClick={() => setActiveTab("duplicate")}
                            className={cn(
                              "rounded-lg border p-3 text-center transition-all",
                              activeTab === "duplicate"
                                ? "border-amber-400 ring-1 ring-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
                                : "hover:bg-muted/40",
                            )}
                          >
                            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                              {visibleDupes}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              Duplicates
                            </p>
                          </button>
                        </div>
                      );
                    })()}

                    {/* New Entries */}
                    {(activeTab === "new" || activeTab === null) &&
                      results.newEntries.length > 0 &&
                      (() => {
                        const visible = results.newEntries.filter(
                          (e) => !isArchived(e),
                        );
                        const archivedCount =
                          results.newEntries.length - visible.length;
                        const q = newSearch.toLowerCase();
                        const filtered = q
                          ? visible.filter(
                              (e) =>
                                e.claimant.toLowerCase().includes(q) ||
                                (e.ssn || "").includes(q) ||
                                (e.alj || "").toLowerCase().includes(q) ||
                                (e.hearingDate || "").includes(q),
                            )
                          : visible;
                        return (
                          <div className="rounded-lg border overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-b">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                New Entries (
                                {newSearch
                                  ? `${filtered.length}/${visible.length}`
                                  : visible.length}
                                )
                                {archivedCount > 0 && (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    • {archivedCount} archived
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                — Not found in RAW hearings database
                              </p>
                              <div className="ml-auto flex items-center gap-1.5">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                  <input
                                    type="text"
                                    placeholder="Search..."
                                    value={newSearch}
                                    onChange={(e) =>
                                      setNewSearch(e.target.value)
                                    }
                                    className="h-6 w-36 rounded border bg-background pl-6 pr-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                  />
                                </div>
                                {archiveSelected.size > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] gap-1"
                                    disabled={archiving}
                                    onClick={() =>
                                      handleArchiveSelected(
                                        results.newEntries,
                                        archiveSelected,
                                      )
                                    }
                                  >
                                    <Archive className="h-3 w-3" />
                                    {archiving
                                      ? "Archiving..."
                                      : `Archive ${archiveSelected.size} Selected`}
                                  </Button>
                                )}
                              </div>
                            </div>
                            {filtered.length > 0 ? (
                              <div className="overflow-auto max-h-50">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                    <tr>
                                      <th className="px-2 py-1.5 w-8">
                                        <input
                                          type="checkbox"
                                          checked={
                                            archiveSelected.size > 0 &&
                                            filtered.every((_, i) =>
                                              archiveSelected.has(
                                                results.newEntries.indexOf(
                                                  filtered[i],
                                                ),
                                              ),
                                            )
                                          }
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setArchiveSelected(
                                                new Set(
                                                  filtered.map((v) =>
                                                    results.newEntries.indexOf(
                                                      v,
                                                    ),
                                                  ),
                                                ),
                                              );
                                            } else {
                                              setArchiveSelected(new Set());
                                            }
                                          }}
                                          className="accent-primary"
                                        />
                                      </th>
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        Claimant
                                      </th>
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        SSN
                                      </th>
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        Claim Type
                                      </th>
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        Hearing Date
                                      </th>
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        Time
                                      </th>
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        ALJ
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {filtered.map((e, vi) => {
                                      const realIdx =
                                        results.newEntries.indexOf(e);
                                      return (
                                        <tr
                                          key={vi}
                                          className="hover:bg-muted/30"
                                        >
                                          <td className="px-2 py-1.5">
                                            <input
                                              type="checkbox"
                                              checked={archiveSelected.has(
                                                realIdx,
                                              )}
                                              onChange={(ev) => {
                                                const next = new Set(
                                                  archiveSelected,
                                                );

                                                if (ev.target.checked) {
                                                  next.add(realIdx);
                                                } else {
                                                  next.delete(realIdx);
                                                }

                                                setArchiveSelected(next);
                                              }}
                                              className="accent-primary"
                                            />
                                          </td>
                                          <td className="px-2 py-1.5 font-medium">
                                            {e.claimant}
                                          </td>
                                          <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                            {e.ssn || "—"}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {e.claimType || "—"}
                                          </td>
                                          <td className="px-2 py-1.5 tabular-nums">
                                            {e.hearingDate}
                                          </td>
                                          <td className="px-2 py-1.5 tabular-nums">
                                            {e.time || "—"}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {e.alj || "—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="py-3 text-center text-xs text-muted-foreground">
                                {newSearch
                                  ? `No results for "${newSearch}"`
                                  : "All new entries are archived"}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                    {/* Rescheduled */}
                    {(activeTab === "rescheduled" || activeTab === null) &&
                      results.rescheduled.length > 0 &&
                      (() => {
                        const visibleResched = results.rescheduled.filter(
                          (e) => !isArchived(e),
                        );
                        const archivedReschedCount =
                          results.rescheduled.length - visibleResched.length;
                        const rq = reschedSearch.toLowerCase();
                        const filteredResched = rq
                          ? visibleResched.filter(
                              (e) =>
                                e.claimant.toLowerCase().includes(rq) ||
                                (e.ssn || "").includes(rq) ||
                                (e.alj || "").toLowerCase().includes(rq) ||
                                (e.hearingDate || "").includes(rq),
                            )
                          : visibleResched;
                        return (
                          <div className="rounded-lg border overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border-b">
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                                Rescheduled (
                                {reschedSearch
                                  ? `${filteredResched.length}/${visibleResched.length}`
                                  : visibleResched.length}
                                )
                                {archivedReschedCount > 0 && (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    • {archivedReschedCount} archived
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-blue-600 dark:text-blue-400">
                                — Same person + SSN, different hearing date
                              </p>
                              <div className="ml-auto flex items-center gap-1.5">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                  <input
                                    type="text"
                                    placeholder="Search..."
                                    value={reschedSearch}
                                    onChange={(e) =>
                                      setReschedSearch(e.target.value)
                                    }
                                    className="h-6 w-36 rounded border bg-background pl-6 pr-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                </div>
                                {reschedArchiveSelected.size > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] gap-1"
                                    disabled={archiving}
                                    onClick={() =>
                                      handleArchiveSelected(
                                        results.rescheduled,
                                        reschedArchiveSelected,
                                      )
                                    }
                                  >
                                    <Archive className="h-3 w-3" />
                                    {archiving
                                      ? "Archiving..."
                                      : `Archive ${reschedArchiveSelected.size} Selected`}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="overflow-auto max-h-50">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                  <tr>
                                    <th className="px-2 py-1.5 w-8">
                                      <input
                                        type="checkbox"
                                        checked={
                                          reschedArchiveSelected.size > 0 &&
                                          filteredResched.every((_, i) =>
                                            reschedArchiveSelected.has(
                                              results.rescheduled.indexOf(
                                                filteredResched[i],
                                              ),
                                            ),
                                          )
                                        }
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setReschedArchiveSelected(
                                              new Set(
                                                filteredResched.map((v) =>
                                                  results.rescheduled.indexOf(
                                                    v,
                                                  ),
                                                ),
                                              ),
                                            );
                                          } else {
                                            setReschedArchiveSelected(
                                              new Set(),
                                            );
                                          }
                                        }}
                                        className="accent-primary"
                                      />
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      Claimant
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      SSN
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      Claim Type
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      New Date
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      Time
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      Previous Date
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      Previous Time
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-semibold">
                                      ALJ
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {filteredResched.map((e, vi) => {
                                    const realIdx =
                                      results.rescheduled.indexOf(e);
                                    return (
                                      <tr
                                        key={vi}
                                        className="hover:bg-muted/30"
                                      >
                                        <td className="px-2 py-1.5">
                                          <input
                                            type="checkbox"
                                            checked={reschedArchiveSelected.has(
                                              realIdx,
                                            )}
                                            onChange={(ev) => {
                                              const next = new Set(
                                                reschedArchiveSelected,
                                              );
                                              if (ev.target.checked) {
                                                next.add(realIdx);
                                              } else {
                                                next.delete(realIdx);
                                              }
                                              setReschedArchiveSelected(next);
                                            }}
                                            className="accent-primary"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5 font-medium">
                                          {e.claimant}
                                        </td>
                                        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                          {e.ssn || "—"}
                                        </td>
                                        <td className="px-2 py-1.5">
                                          {e.claimType || "—"}
                                        </td>
                                        <td className="px-2 py-1.5 tabular-nums font-medium text-blue-700 dark:text-blue-400">
                                          {e.hearingDate}
                                        </td>
                                        <td className="px-2 py-1.5 tabular-nums">
                                          {e.time || "—"}
                                        </td>
                                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground line-through">
                                          {e.prevDate}
                                        </td>
                                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground line-through">
                                          {e.prevTime || "—"}
                                        </td>
                                        <td className="px-2 py-1.5">
                                          {e.alj || "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                    {/* Duplicates */}
                    {(activeTab === "duplicate" || activeTab === null) &&
                      results.duplicates.length > 0 && (
                        <div className="rounded-lg border overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-b">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                              Duplicates ({results.duplicates.length})
                            </p>
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">
                              — Already in RAW hearings (name + SSN + date +
                              time match)
                            </p>
                          </div>
                          <div className="overflow-auto max-h-50">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-semibold">
                                    Claimant
                                  </th>
                                  <th className="px-2 py-1.5 text-left font-semibold">
                                    SSN
                                  </th>
                                  <th className="px-2 py-1.5 text-left font-semibold">
                                    Claim Type
                                  </th>
                                  <th className="px-2 py-1.5 text-left font-semibold">
                                    Hearing Date
                                  </th>
                                  <th className="px-2 py-1.5 text-left font-semibold">
                                    Time
                                  </th>
                                  <th className="px-2 py-1.5 text-left font-semibold">
                                    ALJ
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {results.duplicates.map((e, i) => (
                                  <tr
                                    key={i}
                                    className="hover:bg-muted/30 opacity-50"
                                  >
                                    <td className="px-2 py-1.5 font-medium">
                                      {e.claimant}
                                    </td>
                                    <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                      {e.ssn || "—"}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      {e.claimType || "—"}
                                    </td>
                                    <td className="px-2 py-1.5 tabular-nums">
                                      {e.hearingDate}
                                    </td>
                                    <td className="px-2 py-1.5 tabular-nums">
                                      {e.time || "—"}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      {e.alj || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    {/* All empty */}
                    {results.newEntries.length === 0 &&
                      results.rescheduled.length === 0 &&
                      results.duplicates.length === 0 && (
                        <div className="rounded-lg border p-8 text-center text-muted-foreground">
                          No entries found in the Chronicles CSV.
                        </div>
                      )}

                    {/* Import result */}
                    {importResult && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                        ✅ Imported {importResult.imported} hearings to RAW
                        {importResult.skipped > 0 &&
                          ` (${importResult.skipped} skipped)`}
                      </div>
                    )}

                    {/* Hearings DB check detail view */}
                    {hearingsCheckResult &&
                      compareTarget === "hearings" &&
                      (() => {
                        const m = hearingsCheckResult.mapping;
                        const rows = hearingsCheckResult.syntheticRows;
                        // Filter archived from hearings check results
                        const isCheckArchived = (r: { rowIndex: number }) => {
                          const row = rows[r.rowIndex];
                          if (!row) return false;
                          const key = `${(row[m.claimant] || "")
                            .toLowerCase()
                            .replace(/\s*\(rescheduled(?:\s+\d+)?\)\s*$/i, "")
                            .trim()}|${(row[m.ssn_last_4] || "").padStart(4, "0")}|${row[m.hearing_date] || ""}`;
                          return archivedKeys.has(key);
                        };
                        const filteredNew =
                          hearingsCheckResult.newRecords.filter(
                            (r) => !isCheckArchived(r),
                          );
                        const filteredResched =
                          hearingsCheckResult.rescheduledRecords.filter(
                            (r) => !isCheckArchived(r),
                          );

                        return (
                          <div className="space-y-3 mt-4 pt-4 border-t">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Hearings DB Check Results
                            </h3>

                            {/* Summary cards */}
                            <div
                              className={`grid gap-2 ${hearingsCheckResult.skippedRecords.length > 0 ? "grid-cols-4" : "grid-cols-3"}`}
                            >
                              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/30 p-2 text-center">
                                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                                  {filteredNew.length}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  New
                                </p>
                              </div>
                              <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/30 p-2 text-center">
                                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                                  {filteredResched.length}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  Rescheduled
                                </p>
                              </div>
                              <div className="rounded-lg border bg-muted/50 p-2 text-center">
                                <p className="text-lg font-bold text-muted-foreground">
                                  {hearingsCheckResult.duplicateRecords.length}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  Duplicates
                                </p>
                              </div>
                              {hearingsCheckResult.skippedRecords.length >
                                0 && (
                                <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/30 p-2 text-center">
                                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                                    {hearingsCheckResult.skippedRecords.length}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Skipped
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* New Records */}
                            {filteredNew.length > 0 && (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border-b">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                      New — Not in Hearings DB (
                                      {filteredNew.length})
                                    </p>
                                  </div>
                                  <button
                                    onClick={handleExportNew}
                                    className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                                    title="Export New as CSV"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="overflow-auto max-h-45">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          #
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Claimant
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          SSN
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Date
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Time
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          ALJ
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {filteredNew.slice(0, 100).map((r, i) => {
                                        const row =
                                          hearingsCheckResult.syntheticRows[
                                            r.rowIndex
                                          ];
                                        const mp = hearingsCheckResult.mapping;
                                        return (
                                          <tr
                                            key={i}
                                            className="hover:bg-muted/30"
                                          >
                                            <td className="px-2 py-1 text-muted-foreground">
                                              {i + 1}
                                            </td>
                                            <td className="px-2 py-1 font-medium">
                                              {r.claimant}
                                            </td>
                                            <td className="px-2 py-1 text-muted-foreground tabular-nums">
                                              {r.ssn || "—"}
                                            </td>
                                            <td className="px-2 py-1 tabular-nums">
                                              {r.hearing_date || "—"}
                                            </td>
                                            <td className="px-2 py-1 tabular-nums">
                                              {row?.[mp.hearing_time] || "—"}
                                            </td>
                                            <td className="px-2 py-1">
                                              {row?.[mp.alj] || "—"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Rescheduled Records */}
                            {filteredResched.length > 0 && (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 border-b">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                                      Rescheduled — Will update original (
                                      {filteredResched.length})
                                    </p>
                                  </div>
                                  <button
                                    onClick={handleExportRescheduled}
                                    className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-400"
                                    title="Export Rescheduled as CSV"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="overflow-auto max-h-45">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          #
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Claimant
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          SSN
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          New Date
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Time
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          ALJ
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Original
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Old Date
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Old Time
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {filteredResched
                                        .slice(0, 100)
                                        .map((r, i) => {
                                          const row =
                                            hearingsCheckResult.syntheticRows[
                                              r.rowIndex
                                            ];
                                          const mp =
                                            hearingsCheckResult.mapping;
                                          return (
                                            <tr
                                              key={i}
                                              className="hover:bg-muted/30"
                                            >
                                              <td className="px-2 py-1 text-muted-foreground">
                                                {i + 1}
                                              </td>
                                              <td className="px-2 py-1 font-medium">
                                                {r.claimant}
                                              </td>
                                              <td className="px-2 py-1 text-muted-foreground tabular-nums">
                                                {r.ssn || "—"}
                                              </td>
                                              <td className="px-2 py-1 tabular-nums">
                                                {r.hearing_date || "—"}
                                              </td>
                                              <td className="px-2 py-1 tabular-nums">
                                                {row?.[mp.hearing_time] || "—"}
                                              </td>
                                              <td className="px-2 py-1">
                                                {row?.[mp.alj] || "—"}
                                              </td>
                                              <td className="px-2 py-1 text-muted-foreground">
                                                {r.original_claimant || "—"}
                                              </td>
                                              <td className="px-2 py-1 tabular-nums text-muted-foreground">
                                                {r.original_date || "—"}
                                              </td>
                                              <td className="px-2 py-1 tabular-nums text-muted-foreground">
                                                {r.original_time || "—"}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Duplicates */}
                            {hearingsCheckResult.duplicateRecords.length >
                              0 && (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b">
                                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                                  <p className="text-xs font-semibold text-muted-foreground">
                                    Duplicates — Already in Hearings (
                                    {
                                      hearingsCheckResult.duplicateRecords
                                        .length
                                    }
                                    )
                                  </p>
                                </div>
                                <div className="overflow-auto max-h-45">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          #
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Claimant
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          SSN
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Date
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {hearingsCheckResult.duplicateRecords
                                        .slice(0, 100)
                                        .map((r, i) => (
                                          <tr
                                            key={i}
                                            className="hover:bg-muted/30"
                                          >
                                            <td className="px-2 py-1 text-muted-foreground">
                                              {i + 1}
                                            </td>
                                            <td className="px-2 py-1">
                                              {r.claimant}
                                            </td>
                                            <td className="px-2 py-1 text-muted-foreground tabular-nums">
                                              {r.ssn || "—"}
                                            </td>
                                            <td className="px-2 py-1 tabular-nums">
                                              {r.hearing_date || "—"}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Skipped Records */}
                            {hearingsCheckResult.skippedRecords.length > 0 && (
                              <div className="rounded-lg border overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border-b">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                      Skipped (
                                      {
                                        hearingsCheckResult.skippedRecords
                                          .length
                                      }
                                      )
                                    </p>
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                      — Fill in missing dates to include them
                                    </p>
                                  </div>
                                  {Object.values(skippedDates).some((d) =>
                                    d.trim(),
                                  ) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] gap-1"
                                      disabled={importing}
                                      onClick={handleRecheckSkipped}
                                    >
                                      {importing ? (
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                      ) : (
                                        "🔄"
                                      )}
                                      Re-check{" "}
                                      {
                                        Object.values(skippedDates).filter(
                                          (d) => d.trim(),
                                        ).length
                                      }{" "}
                                      with dates
                                    </Button>
                                  )}
                                  <button
                                    onClick={handleExportSkipped}
                                    className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800/40 text-amber-700 dark:text-amber-400"
                                    title="Export Skipped as CSV"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="overflow-auto max-h-45">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          #
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Claimant
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Hearing Date
                                        </th>
                                        <th className="px-2 py-1 text-left font-semibold">
                                          Reason
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {hearingsCheckResult.skippedRecords
                                        .slice(0, 100)
                                        .map((r, i) => (
                                          <tr
                                            key={i}
                                            className="hover:bg-muted/30"
                                          >
                                            <td className="px-2 py-1 text-muted-foreground">
                                              {i + 1}
                                            </td>
                                            <td className="px-2 py-1 font-medium">
                                              {r.claimant || "(empty)"}
                                            </td>
                                            <td className="px-2 py-1">
                                              {r.reason ===
                                              "Missing hearing date" ? (
                                                <input
                                                  type="date"
                                                  value={skippedDates[i] || ""}
                                                  onChange={(e) =>
                                                    setSkippedDates((prev) => ({
                                                      ...prev,
                                                      [i]: e.target.value,
                                                    }))
                                                  }
                                                  className="h-6 rounded border bg-background px-1.5 text-xs w-32"
                                                />
                                              ) : (
                                                <span className="tabular-nums">
                                                  {r.hearing_date || "—"}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-2 py-1 text-amber-600 dark:text-amber-400">
                                              {r.reason}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Hearings import result */}
                            {hearingsImportResult && (
                              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                                ✅{" "}
                                {hearingsImportResult.newImported > 0
                                  ? `${hearingsImportResult.newImported} inserted`
                                  : ""}
                                {hearingsImportResult.newImported > 0 &&
                                hearingsImportResult.reschedUpdated > 0
                                  ? " • "
                                  : ""}
                                {hearingsImportResult.reschedUpdated > 0
                                  ? `${hearingsImportResult.reschedUpdated} rescheduled updated`
                                  : ""}
                                {!hearingsImportResult.newImported &&
                                !hearingsImportResult.reschedUpdated
                                  ? "No changes"
                                  : ""}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t px-5 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={handleShowArchive}
                  >
                    <Archive className="h-3.5 w-3.5" /> View Archive (
                    {archivedKeys.size})
                  </Button>
                </div>
                {results &&
                  !importResult &&
                  (results.newEntries.length > 0 ||
                    results.rescheduled.length > 0 ||
                    compareTarget === "hearings") && (
                    <div className="flex items-center gap-2">
                      {compareTarget === "raw_hearings" ? (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={importing}
                          onClick={handleImportToRaw}
                        >
                          {importing ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            "🚀"
                          )}
                          Import {migrateCount} to RAW Hearings
                        </Button>
                      ) : !hearingsCheckResult ? (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={importing}
                          onClick={() => handleCheckHearings()}
                        >
                          {importing ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            "🔍"
                          )}
                          Check against Hearings DB
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {hearingsCheckResult.newRecords.length} new •{" "}
                            {hearingsCheckResult.rescheduledRecords.length}{" "}
                            rescheduled •{" "}
                            {hearingsCheckResult.duplicateRecords.length} dupes
                            {hearingsCheckResult.skippedRecords.length > 0 &&
                              ` • ${hearingsCheckResult.skippedRecords.length} skipped`}
                          </span>
                          {hearingsCheckResult.newRecords.length > 0 &&
                            !hearingsImportResult?.newImported && (
                              <Button
                                size="sm"
                                variant="default"
                                className="gap-1 text-xs h-7"
                                disabled={importingNew}
                                onClick={handleImportNewToHearings}
                              >
                                {importingNew ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  "🟢"
                                )}
                                Insert {hearingsCheckResult.newRecords.length}{" "}
                                New
                              </Button>
                            )}
                          {hearingsCheckResult.rescheduledRecords.length > 0 &&
                            !hearingsImportResult?.reschedUpdated && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="gap-1 text-xs h-7"
                                disabled={importingResched}
                                onClick={handleImportReschedToHearings}
                              >
                                {importingResched ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  "🔄"
                                )}
                                Update{" "}
                                {hearingsCheckResult.rescheduledRecords.length}{" "}
                                Rescheduled
                              </Button>
                            )}
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>,
          document.body,
        ),
        showArchiveModal &&
          createPortal(
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setShowArchiveModal(false)}
            >
              <div
                className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
                  <div>
                    <h2 className="text-sm font-semibold">
                      📦 Archived Chronicle Entries
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {archivedEntries.length} entries archived
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search archive..."
                        value={archiveSearch}
                        onChange={(e) => setArchiveSearch(e.target.value)}
                        className="h-7 w-44 rounded border bg-background pl-6 pr-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <button
                      onClick={() => setShowArchiveModal(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {(() => {
                    const aq = archiveSearch.toLowerCase();
                    const filteredArchive = aq
                      ? archivedEntries.filter(
                          (e) =>
                            e.claimant.toLowerCase().includes(aq) ||
                            (e.ssn_last_4 || "").includes(aq) ||
                            (e.alj || "").toLowerCase().includes(aq) ||
                            (e.hearing_date || "").includes(aq) ||
                            (e.reason || "").toLowerCase().includes(aq),
                        )
                      : archivedEntries;
                    return filteredArchive.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {archiveSearch
                          ? `No results for "${archiveSearch}"`
                          : "No archived entries"}
                      </p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              Claimant
                            </th>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              SSN
                            </th>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              Date
                            </th>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              ALJ
                            </th>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              Reason
                            </th>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              Archived By
                            </th>
                            <th className="px-2 py-1.5 text-left font-semibold">
                              Date
                            </th>
                            <th className="px-2 py-1.5 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredArchive.map((e) => (
                            <tr key={e.id} className="hover:bg-muted/30">
                              <td className="px-2 py-1.5 font-medium">
                                {e.claimant}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                                {e.ssn_last_4 || "—"}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {e.hearing_date || "—"}
                              </td>
                              <td className="px-2 py-1.5">{e.alj || "—"}</td>
                              <td className="px-2 py-1.5 text-amber-600 dark:text-amber-400">
                                {e.reason}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {e.archived_by}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                                {e.archived_at
                                  ? new Date(e.archived_at).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                <button
                                  onClick={() => handleUnarchive(e.id)}
                                  className="rounded p-1 text-muted-foreground hover:text-blue-600 hover:bg-muted"
                                  title="Unarchive"
                                >
                                  <ArchiveRestore className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
                <div className="flex justify-end border-t px-5 py-3 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowArchiveModal(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          ),
      ].filter(Boolean)}
    </>
  );
}
