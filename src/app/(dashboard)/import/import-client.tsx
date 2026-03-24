"use client";

import { useState, useRef, useCallback } from "react";
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
}

interface DuplicateResult {
  row: number;
  rowIndex: number;
  claimant: string;
  hearing_date: string;
  ssn: string | null;
  claim_type: string;
  claimantLocation: string;
  repLocation: string;
  downloadType: string;
  statusDate: string;
  data?: unknown[];
  field_diffs?: Record<string, { old: string; new: string }>;
  existing_id?: number;
  reason?: string;
  // Rescheduled fields
  is_rescheduled?: boolean;
  original_id?: number;
  base_name?: string;
  original_claimant?: string;
  original_date?: string;
  // Diff fields
  changed_fields?: string[];
  has_changes?: boolean;
}

interface CheckResult {
  newRecords: DuplicateResult[];
  duplicateRecords: DuplicateResult[];
  skippedRecords: DuplicateResult[];
  rescheduledRecords: DuplicateResult[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  importedIds: number[];
}

interface LookupConfig {
  enabled: boolean;
  sheetIndex: number | null;
  ssnCol: string;
  claimantLocationCol: string;
  repLocationCol: string;
  downloadTypeCol: string;
  statusDateCol: string;
  claimantCol: string;
  dateCol: string;
  claimTypeCol: string;
  useClaimTypeMatch: boolean;
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

// Sort: required fields first, then alphabetical
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

const STEP_LABELS = [
  { num: 1, label: "Upload File" },
  { num: 2, label: "Map Columns" },
  { num: 3, label: "Check Duplicates" },
  { num: 4, label: "Import" },
  { num: 5, label: "Results" },
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
const BTN_WARNING = cn(
  BTN,
  "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed",
);
const BTN_OUTLINE = cn(
  BTN,
  "bg-transparent border border-border text-foreground hover:bg-muted",
);
const CARD = "rounded-xl border bg-card p-6 shadow-sm";

// ─── Auto-map logic ─────────────────────────────────────────────────────────

const AUTO_MAP: Record<string, string[]> = {
  claimant: ["claimant", "claimant name", "name", "client name", "client"],
  ssn_last_4: ["ssn", "ssn last 4", "ssn_last_4", "last 4 ssn", "social"],
  hearing_date: ["hearing date", "date", "hearing_date", "hrg date"],
  hearing_time: ["hearing time", "hearing_time", "hrg time"],
  converted_time_est: [
    "converted time in est",
    "converted time",
    "converted_time_est",
    "est time",
    "time in est",
    "time",
  ],
  time_zone: ["time zone", "timezone", "time_zone", "tz"],
  city: ["city", "hearing city"],
  state: ["state", "hearing state"],
  alj: ["alj", "judge", "administrative law judge"],
  claim_type: ["claim type", "claim_type", "type"],
  claimant_location: ["claimant location", "claimant_location", "cl location"],
  representative_location: [
    "rep location",
    "representative_location",
    "representative location",
  ],
  manner_of_appearance: ["manner of appearance", "moa", "appearance"],
  medical_expert: ["medical expert", "me"],
  vocational_expert: ["vocational expert", "ve"],
  status_date: ["status date", "status_date"],
  download_type: ["download type", "download_type"],
  entered_hearing_level_date: ["entered hearing level", "ehl", "ehl date"],
  hearing_decision_status: ["decision", "decision status"],
  representative: ["representative", "rep", "rep name", "attorney"],
  medical_record_link: ["mr worksheet", "mr link", "medical record link"],
  medical_record_source: ["mr worksheet link", "mr source"],
  claimant_link: ["claimant link", "client link"],
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

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportClient({ userRole }: { userRole: string }) {
  const [step, setStep] = useState(1);

  // DB Compare
  const [showCompare, setShowCompare] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<{
    inSheetNotDb: { claimant: string; date: string; ssn: string }[];
    inDbNotSheet: { claimant: string; date: string; ssn: string }[];
  } | null>(null);

  // Step 1: Upload
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<number>(-1);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cross-sheet lookup
  const [lookup, setLookup] = useState<LookupConfig>({
    enabled: false,
    sheetIndex: null,
    ssnCol: "",
    claimantLocationCol: "",
    repLocationCol: "",
    downloadTypeCol: "",
    statusDateCol: "",
    claimantCol: "",
    dateCol: "",
    claimTypeCol: "",
    useClaimTypeMatch: false,
  });
  const [lookupBuilt, setLookupBuilt] = useState(false);
  const [lookupTable, setLookupTable] = useState<
    Map<string, Record<string, string>>
  >(new Map());

  // Step 2: Mapping
  const [mapping, setMapping] = useState<Record<string, number>>({});

  // Step 3: Duplicates
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [dupTab, setDupTab] = useState<
    "new" | "duplicate" | "update-preview" | "rescheduled" | "skipped"
  >("new");
  const [updateDuplicates, setUpdateDuplicates] = useState(false);
  const [preserveExisting, setPreserveExisting] = useState(true);
  const [fieldChangeSummary, setFieldChangeSummary] = useState<
    Record<string, number>
  >({});

  // Step 4: Import progress
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");

  // Step 5: Results
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Helpers ──

  const currentSheet = selectedSheet >= 0 ? sheets[selectedSheet] : null;
  const lookupSheet =
    lookup.sheetIndex !== null && lookup.sheetIndex >= 0
      ? sheets[lookup.sheetIndex]
      : null;

  const toast = useCallback(
    (msg: string, type: "success" | "error" = "error") => {
      // Simple toast — could be replaced with a toast library
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
      setLookup((p) => ({ ...p, enabled: false, sheetIndex: null }));
      setLookupBuilt(false);

      const reader = new FileReader();
      reader.onload = (e) => {
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
            for (const [cell, val] of Object.entries(ws)) {
              if (cell.startsWith("!")) continue;
              const v = val as { l?: { Target?: string } };
              if (v.l?.Target) hyperlinks[cell] = v.l.Target;
            }
            return { name, headers, rows, hyperlinks };
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
    setLookup((p) => ({ ...p, enabled: false, sheetIndex: null }));
    setLookupBuilt(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ── Cross-sheet lookup ──

  const buildLookupTable = useCallback(() => {
    if (!lookupSheet || !lookup.claimantCol || !lookup.dateCol) {
      toast("Please configure the Claimant and Hearing Date match columns");
      return;
    }
    if (
      !lookup.ssnCol &&
      !lookup.claimantLocationCol &&
      !lookup.repLocationCol &&
      !lookup.downloadTypeCol &&
      !lookup.statusDateCol
    ) {
      toast(
        "Please select at least one data column to pull (SSN, Location, etc.)",
      );
      return;
    }
    const headers = lookupSheet.headers;
    const ci = headers.indexOf(lookup.claimantCol);
    const di = headers.indexOf(lookup.dateCol);
    const si = lookup.ssnCol ? headers.indexOf(lookup.ssnCol) : -1;
    const cli = lookup.claimantLocationCol
      ? headers.indexOf(lookup.claimantLocationCol)
      : -1;
    const rli = lookup.repLocationCol
      ? headers.indexOf(lookup.repLocationCol)
      : -1;
    const dti = lookup.downloadTypeCol
      ? headers.indexOf(lookup.downloadTypeCol)
      : -1;
    const sdi = lookup.statusDateCol
      ? headers.indexOf(lookup.statusDateCol)
      : -1;
    const cti =
      lookup.useClaimTypeMatch && lookup.claimTypeCol
        ? headers.indexOf(lookup.claimTypeCol)
        : -1;

    const table = new Map<string, Record<string, string>>();
    for (const row of lookupSheet.rows) {
      const r = row as string[];
      const claimant = String(r[ci] || "")
        .trim()
        .toLowerCase();
      const date = String(r[di] || "").trim();
      if (!claimant || !date) continue;
      const key =
        cti >= 0
          ? `${claimant}|${date}|${String(r[cti] || "")
              .trim()
              .toLowerCase()}`
          : `${claimant}|${date}`;
      const entry: Record<string, string> = {};
      if (si >= 0 && r[si]) entry.ssn = String(r[si]);
      if (cli >= 0 && r[cli]) entry.claimantLocation = String(r[cli]);
      if (rli >= 0 && r[rli]) entry.repLocation = String(r[rli]);
      if (dti >= 0 && r[dti]) entry.downloadType = String(r[dti]);
      if (sdi >= 0 && r[sdi]) entry.statusDate = String(r[sdi]);
      table.set(key, entry);
    }
    setLookupTable(table);
    setLookupBuilt(true);
    toast(`Lookup table built: ${table.size} entries`, "success");
  }, [lookupSheet, lookup, toast]);

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

  // ── Step 3: Check duplicates (batched for large datasets) ──

  const [checkProgress, setCheckProgress] = useState(0);

  const goToCheckDuplicates = useCallback(async () => {
    if (mapping.claimant === undefined) {
      toast("Please map the Claimant Name field");
      return;
    }
    if (mapping.hearing_date === undefined) {
      toast("Please map the Hearing Date field");
      return;
    }
    setStep(3);
    setChecking(true);
    setCheckResult(null);
    setCheckProgress(0);
    setDupTab("new");

    try {
      const sheet = currentSheet!;
      // Build cross-sheet lookups
      const RESCHED_MAIN = /\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i;
      const crossSheetLookups: Record<number, Record<string, string>> = {};
      if (lookup.enabled && lookupBuilt && lookupTable.size > 0) {
        const ci = mapping.claimant;
        const di = mapping.hearing_date;
        const cti = mapping.claim_type;
        sheet.rows.forEach((row, j) => {
          const r = row as string[];
          const claimant = String(r[ci] || "")
            .trim()
            .toLowerCase();
          const date = String(r[di] || "").trim();
          const claimType =
            cti !== undefined
              ? String(r[cti] || "")
                  .trim()
                  .toLowerCase()
              : "";
          if (!claimant || !date) return;
          const key = lookup.useClaimTypeMatch
            ? `${claimant}|${date}|${claimType}`
            : `${claimant}|${date}`;
          let data = lookupTable.get(key);
          // If no match and name has (Rescheduled), try base name
          if (!data && RESCHED_MAIN.test(claimant)) {
            const baseName = claimant.replace(RESCHED_MAIN, "").trim();
            const baseKey = lookup.useClaimTypeMatch
              ? `${baseName}|${date}|${claimType}`
              : `${baseName}|${date}`;
            data = lookupTable.get(baseKey);
            // Also try base name with any date (rescheduled has new date, lookup has old)
            if (!data) {
              for (const [k, v] of lookupTable) {
                if (k.startsWith(baseName + "|") && v.ssn) {
                  data = v;
                  break;
                }
              }
            }
          }
          if (data && Object.keys(data).length > 0) crossSheetLookups[j] = data;
        });
      }

      // Batch rows — 500 per request to avoid payload/timeout issues
      const BATCH_SIZE = 2000;
      const allNew: DuplicateResult[] = [];
      const allDup: DuplicateResult[] = [];
      const allSkip: DuplicateResult[] = [];
      const allResched: DuplicateResult[] = [];
      const allFieldChanges: Record<string, number> = {};

      for (let i = 0; i < sheet.rows.length; i += BATCH_SIZE) {
        const batchRows = sheet.rows.slice(i, i + BATCH_SIZE);
        // Build cross-sheet lookups for this batch (re-index to batch-local indices)
        const batchLookups: Record<number, Record<string, string>> = {};
        for (let j = 0; j < batchRows.length; j++) {
          const globalIdx = i + j;
          if (crossSheetLookups[globalIdx])
            batchLookups[j] = crossSheetLookups[globalIdx];
        }

        const res = await fetch("/api/import/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapping,
            headers: sheet.headers,
            rows: batchRows,
            crossSheetLookups: batchLookups,
            rowOffset: i, // server uses this to compute correct row numbers
          }),
        });
        const result = await res.json();
        if (result.success) {
          allNew.push(...result.new_records);
          allDup.push(...result.duplicate_records);
          allSkip.push(...result.skipped_records);
          if (result.rescheduled_records)
            allResched.push(...result.rescheduled_records);
          if (result.debug_rescheduled?.length > 0) {
            console.log("🔍 Rescheduled debug:", result.debug_rescheduled);
          }
          if (result.field_change_summary) {
            for (const [f, c] of Object.entries(
              result.field_change_summary as Record<string, number>,
            )) {
              allFieldChanges[f] = (allFieldChanges[f] || 0) + c;
            }
          }
        } else {
          toast(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${result.message || "Unknown error"}`,
          );
        }

        setCheckProgress(
          Math.min(
            100,
            Math.round(((i + batchRows.length) / sheet.rows.length) * 100),
          ),
        );
      }

      setCheckResult({
        newRecords: allNew,
        duplicateRecords: allDup,
        skippedRecords: allSkip,
        rescheduledRecords: allResched,
      });
      setFieldChangeSummary(allFieldChanges);
    } catch (e) {
      toast("Error checking duplicates");
      console.error(e);
    }
    setChecking(false);
  }, [mapping, currentSheet, lookup, lookupBuilt, lookupTable, toast]);

  // ── Step 4: Import ──

  // ── DB Compare: find mismatches between sheet and DB ──
  const compareWithDb = useCallback(async () => {
    if (!currentSheet || Object.keys(mapping).length === 0) {
      toast("Please map columns first (at least Claimant and Hearing Date)");
      return;
    }
    if (mapping.claimant === undefined || mapping.hearing_date === undefined) {
      toast("Map at least Claimant and Hearing Date columns first");
      return;
    }
    setComparing(true);
    setCompareResult(null);
    try {
      // Build cross-sheet lookups if enabled
      const RESCHED_RE = /\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i;
      const stripResched = (name: string) =>
        name.replace(RESCHED_RE, "").trim();
      const csLookups: Record<number, Record<string, string>> = {};
      if (lookup.enabled && lookupBuilt && lookupTable.size > 0) {
        currentSheet.rows.forEach((row, j) => {
          const claimant = String(row[mapping.claimant] || "").trim();
          if (!claimant) return;
          const claimType =
            mapping.claim_type !== undefined
              ? String(row[mapping.claim_type] || "").trim()
              : "";
          const date =
            mapping.hearing_date !== undefined
              ? String(row[mapping.hearing_date] || "").trim()
              : "";
          const key = lookup.useClaimTypeMatch
            ? `${claimant}|${date}|${claimType}`
            : `${claimant}|${date}`;
          let data = lookupTable.get(key);
          // If no match and name has (Rescheduled), try base name
          if (!data && RESCHED_RE.test(claimant)) {
            const baseName = stripResched(claimant);
            const baseKey = lookup.useClaimTypeMatch
              ? `${baseName}|${date}|${claimType}`
              : `${baseName}|${date}`;
            data = lookupTable.get(baseKey);
            // Also try base name with any date in the lookup (rescheduled has new date)
            if (!data) {
              for (const [k, v] of lookupTable) {
                if (k.startsWith(baseName.toLowerCase() + "|") && v.ssn) {
                  data = v;
                  break;
                }
              }
            }
          }
          if (data && Object.keys(data).length > 0) csLookups[j] = data;
        });
      }

      // Parse date helper
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

      // Build sheet keys: claimant|ssn|date (primary) and claimant|date (fallback)
      const sheetByFull = new Map<
        string,
        { claimant: string; date: string; ssn: string }
      >();
      const sheetByNameDate = new Map<
        string,
        { claimant: string; date: string; ssn: string }
      >();
      for (let i = 0; i < currentSheet.rows.length; i++) {
        const row = currentSheet.rows[i];
        const claimant = String(row[mapping.claimant] || "").trim();
        if (!claimant) continue;
        const date = parseD(String(row[mapping.hearing_date] || ""));
        if (!date) continue;

        // SSN from sheet or cross-sheet lookup
        let ssn =
          mapping.ssn_last_4 !== undefined
            ? String(row[mapping.ssn_last_4] || "")
                .replace(/\D/g, "")
                .slice(-4)
            : "";
        if (!ssn && csLookups[i]?.ssn)
          ssn = csLookups[i].ssn.replace(/\D/g, "").slice(-4);

        const entry = { claimant, date, ssn };
        const nameDate = `${claimant.toLowerCase()}|${date}`;
        if (!sheetByNameDate.has(nameDate))
          sheetByNameDate.set(nameDate, entry);
        if (ssn) {
          const full = `${claimant.toLowerCase()}|${ssn}|${date}`;
          if (!sheetByFull.has(full)) sheetByFull.set(full, entry);
        }
      }

      // Fetch DB keys
      const res = await fetch("/api/import/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping, rows: [], compare_mode: true }),
      });
      const data = await res.json();

      const dbByFull = new Map<
        string,
        { claimant: string; date: string; ssn: string }
      >();
      const dbByNameDate = new Map<
        string,
        { claimant: string; date: string; ssn: string }
      >();
      if (data.all_hearings) {
        for (const h of data.all_hearings) {
          const c = (h.claimant || "").trim();
          const d = h.hearing_date || "";
          const s = h.ssn_last_4 || "";
          const entry = { claimant: c, date: d, ssn: s };
          const nameDate = `${c.toLowerCase()}|${d}`;
          if (!dbByNameDate.has(nameDate)) dbByNameDate.set(nameDate, entry);
          if (s) {
            const full = `${c.toLowerCase()}|${s}|${d}`;
            if (!dbByFull.has(full)) dbByFull.set(full, entry);
          }
        }
      }

      // Find mismatches — match by name+ssn+date first, then name+date fallback
      // Also handle rescheduled: "John Smith (Rescheduled)" matches "John Smith" by person

      // Build person-level sets (base name + ssn) for rescheduled matching
      const sheetPersons = new Set<string>();
      for (const [, val] of sheetByNameDate) {
        const base = stripResched(val.claimant).toLowerCase();
        if (val.ssn) sheetPersons.add(`${base}|${val.ssn}`);
        sheetPersons.add(base); // fallback without SSN
      }
      const dbPersons = new Set<string>();
      for (const [, val] of dbByNameDate) {
        const base = stripResched(val.claimant).toLowerCase();
        if (val.ssn) dbPersons.add(`${base}|${val.ssn}`);
        dbPersons.add(base);
      }

      const inSheetNotDb: { claimant: string; date: string; ssn: string }[] =
        [];
      const inDbNotSheet: { claimant: string; date: string; ssn: string }[] =
        [];

      for (const [, val] of sheetByNameDate) {
        const nameDate = `${val.claimant.toLowerCase()}|${val.date}`;
        const full = val.ssn
          ? `${val.claimant.toLowerCase()}|${val.ssn}|${val.date}`
          : "";
        const matchFull = full && dbByFull.has(full);
        const matchNameDate = dbByNameDate.has(nameDate);
        if (matchFull || matchNameDate) continue;
        // Check rescheduled: does the base person exist in DB?
        const base = stripResched(val.claimant).toLowerCase();
        const matchPerson =
          (val.ssn && dbPersons.has(`${base}|${val.ssn}`)) ||
          dbPersons.has(base);
        if (RESCHED_RE.test(val.claimant) && matchPerson) continue; // rescheduled person exists in DB — not truly "new"
        inSheetNotDb.push(val);
      }
      for (const [, val] of dbByNameDate) {
        const nameDate = `${val.claimant.toLowerCase()}|${val.date}`;
        const full = val.ssn
          ? `${val.claimant.toLowerCase()}|${val.ssn}|${val.date}`
          : "";
        const matchFull = full && sheetByFull.has(full);
        const matchNameDate = sheetByNameDate.has(nameDate);
        if (matchFull || matchNameDate) continue;
        // Check rescheduled: does the base person exist in sheet (possibly with Rescheduled suffix)?
        const base = stripResched(val.claimant).toLowerCase();
        const matchPerson =
          (val.ssn && sheetPersons.has(`${base}|${val.ssn}`)) ||
          sheetPersons.has(base);
        if (matchPerson) continue; // person exists in sheet (rescheduled) — not truly "missing"
        inDbNotSheet.push(val);
      }

      setCompareResult({ inSheetNotDb, inDbNotSheet });
      setShowCompare(true);
    } catch (e) {
      toast(
        "Compare failed: " + (e instanceof Error ? e.message : "Unknown error"),
      );
    }
    setComparing(false);
  }, [currentSheet, mapping, lookup, lookupBuilt, lookupTable, toast]);

  const importRecords = useCallback(async () => {
    if (!checkResult) return;
    setStep(4);
    setImporting(true);
    setImportProgress(0);
    setImportStatus("Starting import...");

    const records = checkResult.newRecords.map((r) => ({
      ...r,
      data: currentSheet!.rows[r.rowIndex],
    }));
    const BATCH = 250;
    const PARALLEL = 3; // send 3 batches concurrently
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const importedIds: number[] = [];

    // Build all batches
    const batches: DuplicateResult[][] = [];
    for (let i = 0; i < records.length; i += BATCH) {
      batches.push(records.slice(i, i + BATCH));
    }

    // Process batches in parallel groups
    for (let g = 0; g < batches.length; g += PARALLEL) {
      const group = batches.slice(g, g + PARALLEL);
      const results = await Promise.allSettled(
        group.map((batch) =>
          fetch("/api/import/insert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              records: batch,
              mapping,
              hyperlinks: currentSheet!.hyperlinks || {},
            }),
          }).then((r) => r.json()),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) {
          imported += r.value.imported;
          skipped += r.value.skipped;
          if (r.value.errors) errors.push(...r.value.errors);
          if (r.value.importedIds) importedIds.push(...r.value.importedIds);
        } else {
          const msg =
            r.status === "rejected"
              ? "Network error"
              : r.value?.message || "Unknown error";
          errors.push(`Batch failed: ${msg}`);
        }
      }
      const done = Math.min((g + PARALLEL) * BATCH, records.length);
      setImportProgress(
        Math.min(100, Math.round((done / records.length) * 100)),
      );
      setImportStatus(`Imported ${imported} of ${records.length} records...`);
    }

    setImporting(false);
    setImportResult({ imported, skipped, errors, importedIds });
    setStep(5);
  }, [checkResult, mapping, currentSheet]);

  // ── Update duplicates ──

  const updateDuplicateRecords = useCallback(async () => {
    if (!checkResult || checkResult.duplicateRecords.length === 0) return;
    setStep(4);
    setImporting(true);
    setImportProgress(0);
    setImportStatus("Updating existing records...");

    const records = checkResult.duplicateRecords
      .filter((r) => r.has_changes)
      .map((r) => ({ ...r, data: currentSheet!.rows[r.rowIndex] }));
    const BATCH = 250;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/import/update-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: batch,
            mapping,
            headers: currentSheet!.headers,
            hyperlinks: currentSheet!.hyperlinks || {},
            preserveExisting,
          }),
        });
        const result = await res.json();
        if (result.success) updated += result.updated;
        else
          errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${result.message}`);
      } catch {
        errors.push(`Batch ${Math.floor(i / BATCH) + 1}: Network error`);
      }
      setImportProgress(
        Math.min(100, Math.round(((i + batch.length) / records.length) * 100)),
      );
      setImportStatus(`Updated ${updated} of ${records.length} records...`);
    }

    setImporting(false);
    toast(`Updated ${updated} existing records`, "success");
    // Go back to step 3 to continue with new records import
    setStep(3);
  }, [checkResult, mapping, currentSheet, toast, preserveExisting]);

  // ── Process rescheduled ──

  const processRescheduled = useCallback(async () => {
    if (!checkResult || checkResult.rescheduledRecords.length === 0) return;
    if (
      !confirm(
        `Update ${checkResult.rescheduledRecords.length} rescheduled hearing(s)?\n\nThis will update original records with the new hearing data (date, rep, etc.) and rename them with the "(Rescheduled)" tag.`,
      )
    )
      return;

    setStep(4);
    setImporting(true);
    setImportProgress(0);
    setImportStatus("Processing rescheduled hearings...");

    const records = checkResult.rescheduledRecords.map((r) => ({
      ...r,
      data: currentSheet!.rows[r.rowIndex],
    }));
    const BATCH = 250;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/import/process-rescheduled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: batch,
            mapping,
            hyperlinks: currentSheet!.hyperlinks || {},
            preserveExisting,
          }),
        });
        const result = await res.json();
        if (result.success) updated += result.updated;
        else
          errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${result.message}`);
      } catch {
        errors.push(`Batch ${Math.floor(i / BATCH) + 1}: Network error`);
      }
      setImportProgress(
        Math.min(100, Math.round(((i + batch.length) / records.length) * 100)),
      );
      setImportStatus(
        `Updated ${updated} of ${records.length} rescheduled records...`,
      );
    }

    setImporting(false);
    toast(
      `Updated ${updated} rescheduled hearing(s)${errors.length > 0 ? ` (${errors.length} errors)` : ""}`,
      errors.length > 0 ? "error" : "success",
    );
    // Clear rescheduled from results and go back to step 3
    setCheckResult((prev) =>
      prev ? { ...prev, rescheduledRecords: [] } : prev,
    );
    setStep(3);
  }, [checkResult, mapping, currentSheet, toast, preserveExisting]);

  // ── Download template ──

  const downloadTemplate = useCallback(() => {
    const headers = SORTED_FIELDS.map(([, label]) => label.replace(" *", ""));
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "hearing_import_template.xlsx");
  }, []);

  // ── Download imported records ──

  const downloadImported = useCallback(async () => {
    if (!importResult || importResult.importedIds.length === 0) return;
    try {
      const res = await fetch("/api/import/download-imported", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: importResult.importedIds }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "imported_hearings.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Failed to download");
    }
  }, [importResult, toast]);

  // ── Reset ──

  const resetImport = useCallback(() => {
    setStep(1);
    setFile(null);
    setSheets([]);
    setSelectedSheet(-1);
    setMapping({});
    setLookup({
      enabled: false,
      sheetIndex: null,
      ssnCol: "",
      claimantLocationCol: "",
      repLocationCol: "",
      downloadTypeCol: "",
      statusDateCol: "",
      claimantCol: "",
      dateCol: "",
      claimTypeCol: "",
      useClaimTypeMatch: false,
    });
    setLookupBuilt(false);
    setLookupTable(new Map());
    setCheckResult(null);
    setImportResult(null);
    setImportProgress(0);
    setUpdateDuplicates(false);
    setPreserveExisting(true);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const mappedCount = Object.keys(mapping).length;
  const canProceedToMap =
    selectedSheet >= 0 && currentSheet && currentSheet.rows.length > 0;

  return (
    <>
      <AppHeader
        title="Import Hearings"
        subtitle="Upload and import hearing data from spreadsheets"
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

        {/* ════════════════ STEP 1: Upload ════════════════ */}
        {step === 1 && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-1">
              📁 Upload Spreadsheet
            </h2>

            {/* CSV notice */}
            {file && (
              <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                <strong>✅ Client-Side Parsing:</strong> XLSX files are parsed
                in your browser using SheetJS. Hyperlinks will be automatically
                extracted!
              </div>
            )}

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
            {sheets.length > 1 && (
              <div className="mb-4 space-y-2">
                <label className="text-sm font-medium">
                  📑 Select Sheet to Import:
                </label>
                <select
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={selectedSheet}
                  onChange={(e) => selectSheet(Number(e.target.value))}
                >
                  <option value={-1}>-- Select a sheet --</option>
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
                Sheet <strong>&qout;{currentSheet.name}&qout;</strong>:{" "}
                {currentSheet.headers.length} columns,{" "}
                {currentSheet.rows.length} rows
              </div>
            )}

            {/* Cross-sheet lookup */}
            {sheets.length > 1 && selectedSheet >= 0 && (
              <div className="mb-4 rounded-lg border p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lookup.enabled}
                    onChange={(e) => {
                      setLookup((p) => ({ ...p, enabled: e.target.checked }));
                      setLookupBuilt(false);
                    }}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="font-medium text-sm">
                      🔗 Enable Cross-Sheet Lookup
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Pull SSN, Locations, Download Type, and Status Date from
                      another sheet by matching Claimant + Hearing Date
                    </div>
                  </div>
                </label>

                {lookup.enabled && (
                  <div className="space-y-3 pl-7">
                    <div>
                      <label className="text-xs font-medium">
                        Lookup Sheet (contains SSN/Locations):
                      </label>
                      <select
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"
                        value={lookup.sheetIndex ?? ""}
                        onChange={(e) => {
                          const idx = e.target.value
                            ? Number(e.target.value)
                            : null;
                          if (idx !== null && sheets[idx]) {
                            const h = sheets[idx].headers.map((s) =>
                              s.toLowerCase().trim(),
                            );
                            const find = (aliases: string[]) => {
                              for (const a of aliases) {
                                const i = h.indexOf(a);
                                if (i >= 0) return sheets[idx].headers[i];
                              }
                              return "";
                            };
                            setLookup((p) => ({
                              ...p,
                              sheetIndex: idx,
                              ssnCol: find([
                                "ssn",
                                "ssn last 4",
                                "ssn_last_4",
                                "last 4 ssn",
                                "social",
                              ]),
                              claimantLocationCol: find([
                                "claimant location",
                                "claimant_location",
                                "cl location",
                              ]),
                              repLocationCol: find([
                                "rep location",
                                "representative location",
                                "representative_location",
                              ]),
                              downloadTypeCol: find([
                                "download type",
                                "download_type",
                              ]),
                              statusDateCol: find([
                                "status date",
                                "status_date",
                              ]),
                              claimantCol: find([
                                "claimant",
                                "claimant name",
                                "name",
                                "client name",
                              ]),
                              dateCol: find([
                                "hearing date",
                                "date",
                                "hearing_date",
                                "hrg date",
                              ]),
                              claimTypeCol: find([
                                "claim type",
                                "claim_type",
                                "type",
                              ]),
                            }));
                          } else {
                            setLookup((p) => ({ ...p, sheetIndex: idx }));
                          }
                          setLookupBuilt(false);
                        }}
                      >
                        <option value="">-- Select sheet --</option>
                        {sheets.map(
                          (s, i) =>
                            i !== selectedSheet && (
                              <option key={i} value={i}>
                                {s.name} ({s.rows.length} rows)
                              </option>
                            ),
                        )}
                      </select>
                    </div>

                    {lookupSheet && (
                      <>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {[
                            { key: "ssnCol" as const, label: "SSN Column" },
                            {
                              key: "claimantLocationCol" as const,
                              label: "Claimant Location (optional)",
                            },
                            {
                              key: "repLocationCol" as const,
                              label: "Rep Location (optional)",
                            },
                            {
                              key: "downloadTypeCol" as const,
                              label: "Download Type (optional)",
                            },
                            {
                              key: "statusDateCol" as const,
                              label: "Status Date (optional)",
                            },
                          ].map((f) => (
                            <div key={f.key}>
                              <label className="text-xs font-medium">
                                {f.label}:
                              </label>
                              <select
                                className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"
                                value={lookup[f.key]}
                                onChange={(e) =>
                                  setLookup((p) => ({
                                    ...p,
                                    [f.key]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">
                                  --{" "}
                                  {f.label.includes("optional")
                                    ? "Don't import"
                                    : "Select column"}{" "}
                                  --
                                </option>
                                {lookupSheet.headers.map((h, i) => (
                                  <option key={i} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">
                              Claimant Column (in lookup sheet):
                            </label>
                            <select
                              className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"
                              value={lookup.claimantCol}
                              onChange={(e) =>
                                setLookup((p) => ({
                                  ...p,
                                  claimantCol: e.target.value,
                                }))
                              }
                            >
                              <option value="">-- Select column --</option>
                              {lookupSheet.headers.map((h, i) => (
                                <option key={i} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium">
                              Hearing Date Column (in lookup sheet):
                            </label>
                            <select
                              className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"
                              value={lookup.dateCol}
                              onChange={(e) =>
                                setLookup((p) => ({
                                  ...p,
                                  dateCol: e.target.value,
                                }))
                              }
                            >
                              <option value="">-- Select column --</option>
                              {lookupSheet.headers.map((h, i) => (
                                <option key={i} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={lookup.useClaimTypeMatch}
                            onChange={(e) =>
                              setLookup((p) => ({
                                ...p,
                                useClaimTypeMatch: e.target.checked,
                              }))
                            }
                            className="accent-primary"
                          />
                          Also match by Claim Type (for duplicate claimants with
                          same date)
                        </label>
                        {lookup.useClaimTypeMatch && (
                          <div>
                            <label className="text-xs font-medium">
                              Claim Type Column:
                            </label>
                            <select
                              className="w-full rounded-lg border bg-background px-3 py-2 text-sm mt-1"
                              value={lookup.claimTypeCol}
                              onChange={(e) =>
                                setLookup((p) => ({
                                  ...p,
                                  claimTypeCol: e.target.value,
                                }))
                              }
                            >
                              <option value="">-- Select column --</option>
                              {lookupSheet.headers.map((h, i) => (
                                <option key={i} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {lookupBuilt && (
                          <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                            ✅ Lookup table built: {lookupTable.size} entries
                          </div>
                        )}

                        <button
                          className={BTN_SECONDARY}
                          onClick={buildLookupTable}
                        >
                          🔍 Build Lookup Table
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button className={BTN_OUTLINE} onClick={downloadTemplate}>
                📥 Download Template
              </button>
              <button
                className={BTN_OUTLINE}
                disabled={
                  comparing ||
                  !currentSheet ||
                  mapping.claimant === undefined ||
                  mapping.hearing_date === undefined
                }
                onClick={compareWithDb}
              >
                {comparing ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent inline-block mr-1" />{" "}
                    Comparing...
                  </>
                ) : (
                  "🔍 Compare with DB"
                )}
              </button>
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
              Match your spreadsheet columns to the hearing database fields.
              Fields marked with{" "}
              <span className="text-destructive font-bold">*</span> are
              required.
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
              <button className={BTN_PRIMARY} onClick={goToCheckDuplicates}>
                Next: Check Duplicates →
              </button>
            </div>
          </div>
        )}

        {/* ════════════════ STEP 3: Check Duplicates ════════════════ */}
        {step === 3 && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-1">
              🔍 Check for Duplicates
            </h2>

            {checking && (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  Checking database for existing records...
                </span>
                {checkProgress > 0 && (
                  <div className="w-full max-w-md space-y-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${checkProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-center text-muted-foreground">
                      {checkProgress}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {checkResult && (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-2xl font-bold">
                      {checkResult.newRecords.length +
                        checkResult.duplicateRecords.length +
                        checkResult.rescheduledRecords.length +
                        checkResult.skippedRecords.length}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total Rows
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {checkResult.newRecords.length}
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-500">
                      New Records
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {checkResult.duplicateRecords.length}
                    </div>
                    <div className="text-xs text-amber-600 dark:text-amber-500">
                      Duplicates
                      {checkResult.duplicateRecords.filter((r) => r.has_changes)
                        .length > 0 && (
                        <span className="block text-amber-800 dark:text-amber-300 font-semibold">
                          {
                            checkResult.duplicateRecords.filter(
                              (r) => r.has_changes,
                            ).length
                          }{" "}
                          with changes
                        </span>
                      )}
                    </div>
                  </div>
                  {checkResult.rescheduledRecords.length > 0 && (
                    <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-3 text-center">
                      <div className="text-2xl font-bold text-violet-700 dark:text-violet-400">
                        {checkResult.rescheduledRecords.length}
                      </div>
                      <div className="text-xs text-violet-600 dark:text-violet-500">
                        🔄 Rescheduled
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-900/30 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                      {checkResult.skippedRecords.length}
                    </div>
                    <div className="text-xs text-gray-500">Skipped</div>
                  </div>
                </div>

                {/* Debug: Field change breakdown — shows which fields are triggering "with changes" */}
                {Object.keys(fieldChangeSummary).length > 0 &&
                  checkResult.duplicateRecords.filter((r) => r.has_changes)
                    .length > 0 && (
                    <div className="mb-4 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 px-4 py-3">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        📊 Fields triggering changes in duplicates:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(fieldChangeSummary)
                          .sort(([, a], [, b]) => b - a)
                          .map(([field, count]) => (
                            <span
                              key={field}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs text-slate-700 dark:text-slate-300"
                            >
                              {DB_FIELDS[field] || field}:{" "}
                              <strong>{count}</strong>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                {/* Update duplicates option */}
                {checkResult.duplicateRecords.length > 0 && (
                  <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-4 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={updateDuplicates}
                        onChange={(e) => setUpdateDuplicates(e.target.checked)}
                        className="mt-0.5 accent-amber-600"
                      />
                      <div>
                        <div className="font-medium text-sm text-amber-900 dark:text-amber-200">
                          🔄 Update existing records with new data
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          When enabled, duplicate records will be updated with
                          new values from the import file. Only fields that have
                          values in the import will be updated; existing data
                          won&apos;t be cleared.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Preserve existing assignments option — shown when updates or rescheduled exist */}
                {(checkResult.duplicateRecords.length > 0 ||
                  checkResult.rescheduledRecords.length > 0) && (
                  <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preserveExisting}
                        onChange={(e) => setPreserveExisting(e.target.checked)}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div>
                        <div className="font-medium text-sm text-blue-900 dark:text-blue-200">
                          🛡️ Preserve existing assignments
                        </div>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                          When enabled, fields that already have values in the
                          database (Rep, MR Team, MR Status, Brief, Decision,
                          etc.) will NOT be overwritten by the import — even if
                          the import file has different values. Only empty/unset
                          fields in the DB will be filled in. Turn off to allow
                          the import to overwrite everything.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      dupTab === "new"
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                    onClick={() => setDupTab("new")}
                  >
                    ✅ New Records ({checkResult.newRecords.length})
                  </button>
                  <button
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      dupTab === "duplicate"
                        ? "bg-amber-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                    onClick={() => setDupTab("duplicate")}
                  >
                    ⚠️ Duplicates ({checkResult.duplicateRecords.length})
                  </button>
                  {updateDuplicates &&
                    checkResult.duplicateRecords.length > 0 && (
                      <button
                        className={cn(
                          "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                          dupTab === "update-preview"
                            ? "bg-blue-600 text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                        onClick={() => setDupTab("update-preview")}
                      >
                        🔄 Update Preview ({checkResult.duplicateRecords.length}
                        )
                      </button>
                    )}
                  {checkResult.rescheduledRecords.length > 0 && (
                    <button
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        dupTab === "rescheduled"
                          ? "bg-violet-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                      onClick={() => setDupTab("rescheduled")}
                    >
                      🔄 Rescheduled ({checkResult.rescheduledRecords.length})
                    </button>
                  )}
                  <button
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      dupTab === "skipped"
                        ? "bg-gray-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                    onClick={() => setDupTab("skipped")}
                  >
                    ⏭️ Skipped ({checkResult.skippedRecords.length})
                  </button>
                </div>

                {/* Preview table — shows all mapped columns */}
                {(() => {
                  // Build ordered column list from mapping
                  const mappedCols = Object.entries(mapping)
                    .filter(([, idx]) => idx !== null && idx !== undefined)
                    .sort(([, a], [, b]) => (a as number) - (b as number))
                    .map(([field, idx]) => ({
                      field,
                      idx: idx as number,
                      label: DB_FIELDS[field] || field,
                    }));

                  const activeRecords =
                    dupTab === "new"
                      ? checkResult.newRecords
                      : dupTab === "duplicate" || dupTab === "update-preview"
                        ? checkResult.duplicateRecords
                        : dupTab === "rescheduled"
                          ? checkResult.rescheduledRecords
                          : checkResult.skippedRecords;

                  // Format cell for display — converts Excel serial values
                  const fmtCell = (field: string, raw: unknown): string => {
                    const s = String(raw ?? "").trim();
                    if (!s) return "—";
                    const n = Number(s);

                    // Time fields: Excel serial time (0.0–1.0) → HH:MM AM/PM
                    if (
                      field === "hearing_time" &&
                      !isNaN(n) &&
                      n >= 0 &&
                      n < 1
                    ) {
                      const totalMin = Math.round(n * 1440);
                      let h = Math.floor(totalMin / 60);
                      const m = totalMin % 60;
                      const ampm = h >= 12 ? "PM" : "AM";
                      if (h > 12) h -= 12;
                      if (h === 0) h = 12;
                      return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
                    }

                    // Date fields: Excel serial date (40000–60000) → MM/DD/YYYY
                    if (
                      (field === "hearing_date" ||
                        field === "status_date" ||
                        field === "entered_hearing_level_date" ||
                        field === "post_hrg_deadline") &&
                      !isNaN(n) &&
                      n > 40000 &&
                      n < 60000
                    ) {
                      const d = new Date((n - 25569) * 86400000);
                      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
                    }

                    // Boolean fields
                    if (
                      [
                        "phi_sheet_complete",
                        "rep_docs_complete",
                        "fee_agreement_complete",
                        "five_day_notice",
                        "task_assigned",
                      ].includes(field)
                    ) {
                      return s === "1" ||
                        s.toLowerCase() === "true" ||
                        s.toLowerCase() === "yes"
                        ? "✓"
                        : "—";
                    }

                    // SSN: show last 4
                    if (field === "ssn_last_4") {
                      const digits = s.replace(/\D/g, "").slice(-4);
                      return digits.length === 4 ? digits : s;
                    }

                    return s;
                  };

                  return (
                    <div className="max-h-96 overflow-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted z-10">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                              Row
                            </th>
                            {mappedCols.map((col) => (
                              <th
                                key={col.field}
                                className="px-3 py-2 text-left font-medium whitespace-nowrap"
                              >
                                {col.label.replace(" *", "")}
                              </th>
                            ))}
                            {dupTab === "skipped" && (
                              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                                Reason
                              </th>
                            )}
                            {dupTab === "rescheduled" && (
                              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                                Original Record
                              </th>
                            )}
                            {(dupTab === "duplicate" ||
                              dupTab === "update-preview") && (
                              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                                Changes
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {activeRecords.map((r, i) => {
                            const row = (r.data ||
                              currentSheet?.rows[r.rowIndex] ||
                              []) as string[];
                            return (
                              <tr
                                key={i}
                                className={cn(
                                  "border-t hover:bg-muted/50",
                                  (dupTab === "duplicate" ||
                                    dupTab === "update-preview") &&
                                    r.has_changes &&
                                    "bg-amber-50/50 dark:bg-amber-950/10",
                                )}
                              >
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  {r.row}
                                </td>
                                {mappedCols.map((col) => (
                                  <td
                                    key={col.field}
                                    className={cn(
                                      "px-3 py-1.5 max-w-48 truncate",
                                      col.field === "claimant" && "font-medium",
                                      col.field === "ssn_last_4" && "font-mono",
                                      (dupTab === "duplicate" ||
                                        dupTab === "update-preview") &&
                                        r.changed_fields?.includes(col.field) &&
                                        "text-amber-700 dark:text-amber-400 font-semibold",
                                    )}
                                  >
                                    {fmtCell(col.field, row[col.idx])}
                                  </td>
                                ))}
                                {dupTab === "skipped" && (
                                  <td className="px-3 py-1.5 text-destructive">
                                    {r.reason}
                                  </td>
                                )}
                                {dupTab === "rescheduled" && (
                                  <td className="px-3 py-1.5 text-violet-600 dark:text-violet-400 text-xs">
                                    Original: {r.original_claimant} (
                                    {r.original_date})
                                  </td>
                                )}
                                {(dupTab === "duplicate" ||
                                  dupTab === "update-preview") && (
                                  <td className="px-3 py-1.5 text-xs">
                                    {r.has_changes && r.field_diffs ? (
                                      <div className="space-y-0.5 max-w-75">
                                        {r.changed_fields?.map((f) => {
                                          const diff = r.field_diffs?.[f];
                                          if (!diff) return null;
                                          const label =
                                            FIELD_LABELS[f] ||
                                            f.replace(/_/g, " ");
                                          return (
                                            <div
                                              key={f}
                                              className="flex items-start gap-1 leading-tight"
                                            >
                                              <span className="font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                                                {label}:
                                              </span>
                                              <span
                                                className="text-red-500 dark:text-red-400 line-through truncate max-w-25"
                                                title={diff.old}
                                              >
                                                {diff.old}
                                              </span>
                                              <span className="text-muted-foreground shrink-0">
                                                →
                                              </span>
                                              <span
                                                className="text-emerald-600 dark:text-emerald-400 truncate max-w-25"
                                                title={diff.new}
                                              >
                                                {diff.new}
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
                                )}
                              </tr>
                            );
                          })}
                          {activeRecords.length === 0 && (
                            <tr>
                              <td
                                colSpan={mappedCols.length + 2}
                                className="px-3 py-6 text-center text-muted-foreground"
                              >
                                No records
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Bottom actions */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <button className={BTN_SECONDARY} onClick={() => setStep(2)}>
                    ← Back
                  </button>
                  <div className="flex flex-wrap gap-3">
                    {checkResult.rescheduledRecords.length > 0 && (
                      <button
                        className={cn(
                          BTN,
                          "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed",
                        )}
                        onClick={processRescheduled}
                      >
                        🔄 Update {checkResult.rescheduledRecords.length}{" "}
                        Rescheduled
                      </button>
                    )}
                    {updateDuplicates &&
                      checkResult.duplicateRecords.filter((r) => r.has_changes)
                        .length > 0 && (
                        <button
                          className={BTN_WARNING}
                          onClick={updateDuplicateRecords}
                        >
                          🔄 Update{" "}
                          {
                            checkResult.duplicateRecords.filter(
                              (r) => r.has_changes,
                            ).length
                          }{" "}
                          Duplicates
                        </button>
                      )}
                    <button
                      className={BTN_SUCCESS}
                      disabled={checkResult.newRecords.length === 0}
                      onClick={importRecords}
                    >
                      ✅ Import {checkResult.newRecords.length} New Hearings
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════ STEP 4: Import Progress ════════════════ */}
        {step === 4 && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-4">
              📥 Importing Hearings
            </h2>
            <div className="space-y-4">
              <div className="h-4 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">
                  {importProgress}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {importStatus}
                </div>
              </div>
              {importing && (
                <div className="flex items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════ STEP 5: Results ════════════════ */}
        {step === 5 && importResult && (
          <div className={CARD}>
            <h2 className="text-lg font-semibold mb-4">📊 Import Results</h2>

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {importResult.imported}
                </div>
                <div className="text-sm text-emerald-600 dark:text-emerald-500">
                  Imported
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
                <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                  {importResult.skipped}
                </div>
                <div className="text-sm text-amber-600 dark:text-amber-500">
                  Skipped
                </div>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-center">
                <div className="text-3xl font-bold text-red-700 dark:text-red-400">
                  {importResult.errors.length}
                </div>
                <div className="text-sm text-red-600 dark:text-red-500">
                  Errors
                </div>
              </div>
            </div>

            {/* Errors */}
            {importResult.errors.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-sm mb-2">⚠️ Issues Found:</h4>
                <ul className="space-y-1 max-h-40 overflow-auto rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
                  {importResult.errors.map((e, i) => (
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

            {/* Download imported */}
            {importResult.importedIds.length > 0 && (
              <div className="mb-4 rounded-lg bg-muted/50 p-4">
                <h4 className="font-medium text-sm mb-1">
                  📥 Download Imported Records
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Download a spreadsheet of the newly imported hearings.
                </p>
                <button className={BTN_PRIMARY} onClick={downloadImported}>
                  📄 Download XLSX
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <Link href="/" className={BTN_PRIMARY}>
                ← Back to Dashboard
              </Link>
              <button className={BTN_SECONDARY} onClick={resetImport}>
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════ DB COMPARE MODAL ════════════════ */}
      {showCompare && compareResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCompare(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-sm font-semibold">
                  🔍 Sheet vs Database Comparison
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sheet: {currentSheet?.rows.length.toLocaleString()} rows • DB:
                  comparing by Claimant + Hearing Date
                </p>
              </div>
              <button
                onClick={() => setShowCompare(false)}
                className="text-muted-foreground hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/30 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {compareResult.inSheetNotDb.length}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    In Sheet, Not in DB
                  </p>
                </div>
                <div className="rounded-lg border bg-red-50 dark:bg-red-900/30 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {compareResult.inDbNotSheet.length}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    In DB, Not in Sheet
                  </p>
                </div>
              </div>

              {/* In Sheet, Not in DB */}
              {compareResult.inSheetNotDb.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border-b">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      In Sheet, Not in DB ({compareResult.inSheetNotDb.length})
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                      — These will be imported as new records
                    </p>
                  </div>
                  <div className="overflow-auto max-h-62.5">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            #
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            Claimant
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            Hearing Date
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            SSN
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {compareResult.inSheetNotDb.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="px-3 py-1.5 font-medium">
                              {r.claimant}
                            </td>
                            <td className="px-3 py-1.5 tabular-nums">
                              {r.date}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                              {r.ssn || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* In DB, Not in Sheet */}
              {compareResult.inDbNotSheet.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border-b">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                      In DB, Not in Sheet ({compareResult.inDbNotSheet.length})
                    </p>
                    <p className="text-[10px] text-red-600 dark:text-red-400">
                      — These exist in the database but are missing from the
                      spreadsheet
                    </p>
                  </div>
                  <div className="overflow-auto max-h-62.5">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            #
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            Claimant
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            Hearing Date
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold">
                            SSN
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {compareResult.inDbNotSheet.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="px-3 py-1.5 font-medium">
                              {r.claimant}
                            </td>
                            <td className="px-3 py-1.5 tabular-nums">
                              {r.date}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                              {r.ssn || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {compareResult.inSheetNotDb.length === 0 &&
                compareResult.inDbNotSheet.length === 0 && (
                  <div className="rounded-lg border p-8 text-center text-muted-foreground">
                    ✅ Sheet and database are perfectly in sync — no differences
                    found.
                  </div>
                )}
            </div>

            <div className="flex items-center justify-end border-t px-5 py-3 shrink-0">
              <button
                className={BTN_SECONDARY}
                onClick={() => setShowCompare(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
