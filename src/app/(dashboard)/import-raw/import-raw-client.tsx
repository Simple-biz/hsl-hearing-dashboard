"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  Trash2,
  Download,
  Database,
  RotateCcw,
  ChevronLeft,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Users,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import {
  importRawHearings,
  clearRawHearings,
  getRawHearingsStats,
  fetchRawHearingsForCompare,
} from "./actions";

// ── Column mapping: CSV header → raw_hearings field ──
const COLUMN_MAP: Record<string, string> = {
  claimant: "claimant",
  claimants: "claimant",
  name: "claimant",
  rep: "rep",
  representative: "rep",
  ssn: "ssn_last_4",
  "ssn last 4": "ssn_last_4",
  ssn_last_4: "ssn_last_4",
  "last 4 ssn": "ssn_last_4",
  last4ssn: "ssn_last_4",
  "claim type": "claim_type",
  claim_type: "claim_type",
  claimtype: "claim_type",
  "hearing date": "hearing_date",
  hearing_date: "hearing_date",
  date: "hearing_date",
  time: "hearing_time",
  "hearing time": "hearing_time",
  hearing_time: "hearing_time",
  "hrg time": "hearing_time",
  "time zone": "time_zone",
  time_zone: "time_zone",
  timezone: "time_zone",
  "claimant location": "claimant_location",
  claimant_location: "claimant_location",
  "representative location": "representative_location",
  representative_location: "representative_location",
  "rep location": "representative_location",
  city: "city",
  state: "state",
  alj: "alj",
  judge: "alj",
  "medical expert": "medical_expert",
  medical_expert: "medical_expert",
  "vocational expert": "vocational_expert",
  vocational_expert: "vocational_expert",
  "status date": "status_date",
  status_date: "status_date",
  "entered hearing level date": "entered_hearing_level_date",
  entered_hearing_level_date: "entered_hearing_level_date",
  "download type": "download_type",
  download_type: "download_type",
  "time adjustment": "time_adjustment",
  time_adjustment: "time_adjustment",
  "converted time": "converted_time",
  converted_time: "converted_time",
  "converted time in est": "converted_time",
  month: "month",
};

const DB_FIELDS = [
  "claimant",
  "rep",
  "ssn_last_4",
  "claim_type",
  "hearing_date",
  "hearing_time",
  "time_zone",
  "claimant_location",
  "representative_location",
  "city",
  "state",
  "alj",
  "medical_expert",
  "vocational_expert",
  "status_date",
  "entered_hearing_level_date",
  "download_type",
  "time_adjustment",
  "converted_time",
  "month",
];

const FIELD_LABELS: Record<string, string> = {
  claimant: "Claimant",
  rep: "Rep",
  ssn_last_4: "SSN Last 4",
  claim_type: "Claim Type",
  hearing_date: "Hearing Date",
  hearing_time: "Time",
  time_zone: "Time Zone",
  claimant_location: "Claimant Location",
  representative_location: "Rep Location",
  city: "City",
  state: "State",
  alj: "ALJ",
  medical_expert: "Medical Expert",
  vocational_expert: "Vocational Expert",
  status_date: "Status Date",
  entered_hearing_level_date: "Entered HRG Level",
  download_type: "Download Type",
  time_adjustment: "Time Adjustment",
  converted_time: "Converted Time",
  month: "Month",
};

// ── CSV parsing ──
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
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

  const headers = parseLine(lines[0]);
  const rows = lines
    .slice(1)
    .map(parseLine)
    .filter((r) => r.some((c) => c.trim()));
  return { headers, rows };
}

function parseDate(d: string): string | null {
  if (!d) return null;
  // MM/DD/YYYY
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return d;
}

function formatSSN(v: string): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "").slice(-4);
  return digits.length > 0 ? digits.padStart(4, "0") : null;
}

// ── Component ──

interface Stats {
  total: string;
  reps: string;
  min_date: string | null;
  max_date: string | null;
}

export function ImportRawClient({
  initialStats,
}: {
  initialStats: Stats;
  userRole: string;
  userName: string;
}) {
  const [stats, setStats] = useState(initialStats);
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<{
    headers: string[];
    rows: string[][];
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({}); // dbField → colIndex
  const [mode, setMode] = useState<"skip" | "update" | "replace">("skip");
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">(
    "upload",
  );
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    newRecords: { claimant: string; date: string; ssn: string }[];
    duplicateRecords: { claimant: string; date: string; ssn: string }[];
    emptyCount: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.rows.length === 0) {
        setError("CSV is empty or invalid");
        return;
      }
      setCsvData(parsed);

      // Auto-map columns
      const autoMap: Record<string, number> = {};
      parsed.headers.forEach((h, idx) => {
        const key = h.toLowerCase().trim();
        const dbField = COLUMN_MAP[key];
        if (dbField && !autoMap[dbField]) autoMap[dbField] = idx;
      });
      setMapping(autoMap);
      setStep("preview");
    };
    reader.readAsText(f);
  }, []);

  // ── Check duplicates: client-side matching against DB ──
  const handleCheckDuplicates = useCallback(async () => {
    if (!csvData || Object.keys(mapping).length === 0) return;
    setChecking(true);
    setCheckResult(null);
    try {
      // Fetch all raw_hearings
      const { hearings } = await fetchRawHearingsForCompare();

      // Build DB lookup
      const stripSuffix = (n: string) =>
        n
          .replace(/\s*\([^)]+\)\s*$/g, "")
          .trim()
          .toLowerCase();
      const normTime = (t: string | null): string => {
        if (!t) return "";
        const s = t.trim();
        const ap = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (ap) {
          let h = parseInt(ap[1]);
          if (ap[3].toUpperCase() === "PM" && h !== 12) h += 12;
          if (ap[3].toUpperCase() === "AM" && h === 12) h = 0;
          return `${String(h).padStart(2, "0")}:${ap[2]}`;
        }
        const hm = s.match(/^(\d{1,2}):(\d{2})/);
        if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
        return s;
      };

      const dbMap = new Map<string, string[]>(); // key → times[]
      for (const row of hearings) {
        const base = stripSuffix(row.claimant || "");
        const ssn = (row.ssn_last_4 || "").padStart(4, "0");
        const date = row.hearing_date || "";
        const key = `${base}|${ssn}|${date}`;
        const time = normTime(row.hearing_time || row.converted_time || "");
        if (!dbMap.has(key)) dbMap.set(key, []);
        if (time) dbMap.get(key)!.push(time);
      }

      // Check each CSV row
      const newRecords: { claimant: string; date: string; ssn: string }[] = [];
      const duplicateRecords: {
        claimant: string;
        date: string;
        ssn: string;
      }[] = [];
      let emptyCount = 0;

      for (const row of csvData.rows) {
        const claimant =
          mapping.claimant !== undefined
            ? (row[mapping.claimant] || "").trim()
            : "";
        if (!claimant) {
          emptyCount++;
          continue;
        }

        const rawDate =
          mapping.hearing_date !== undefined
            ? (row[mapping.hearing_date] || "").trim()
            : "";
        const date = parseDate(rawDate) || rawDate;
        const rawSsn =
          mapping.ssn_last_4 !== undefined
            ? (row[mapping.ssn_last_4] || "").trim()
            : "";
        const ssn = rawSsn ? formatSSN(rawSsn) || "" : "";
        const rawTime =
          mapping.hearing_time !== undefined
            ? (row[mapping.hearing_time] || "").trim()
            : "";
        const convTime =
          mapping.converted_time !== undefined
            ? (row[mapping.converted_time] || "").trim()
            : "";
        const importTime = normTime(rawTime || convTime);

        const base = stripSuffix(claimant);
        const key = `${base}|${ssn.padStart(4, "0")}|${date}`;
        const match = dbMap.get(key);

        if (match) {
          const timeMatch =
            !importTime ||
            match.length === 0 ||
            match.some((t) => t === importTime);
          if (timeMatch) {
            duplicateRecords.push({ claimant, date, ssn });
            continue;
          }
        }
        newRecords.push({ claimant, date, ssn });
      }

      setCheckResult({ newRecords, duplicateRecords, emptyCount });
      setShowCheck(true);
    } catch (e) {
      setError(
        "Check failed: " + (e instanceof Error ? e.message : "Unknown error"),
      );
    }
    setChecking(false);
  }, [csvData, mapping]);

  const handleImport = useCallback(async () => {
    if (!csvData) return;
    setStep("importing");
    setProgress(0);
    setResult(null);
    setError(null);

    try {
      // Build records from CSV using mapping
      const records: Record<string, string | null>[] = [];
      for (const row of csvData.rows) {
        const rec: Record<string, string | null> = {};
        for (const [dbField, colIdx] of Object.entries(mapping)) {
          const val = (row[colIdx] || "").trim();
          if (!val) {
            rec[dbField] = null;
            continue;
          }

          // Parse special fields
          if (
            dbField === "hearing_date" ||
            dbField === "status_date" ||
            dbField === "entered_hearing_level_date"
          ) {
            rec[dbField] = parseDate(val);
          } else if (dbField === "ssn_last_4") {
            rec[dbField] = formatSSN(val);
          } else {
            rec[dbField] = val;
          }
        }
        if (rec.claimant) records.push(rec);
      }

      if (records.length === 0) {
        setError("No valid records found");
        setStep("preview");
        return;
      }

      // Send in batches
      const BATCH = 500;
      let totalImported = 0,
        totalUpdated = 0,
        totalSkipped = 0;

      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const batchMode = i === 0 ? mode : mode === "replace" ? "skip" : mode; // only truncate on first batch
        const res = await importRawHearings(batch, batchMode);
        totalImported += res.imported;
        totalUpdated += res.updated;
        totalSkipped += res.skipped;
        setProgress(
          Math.min(
            100,
            Math.round(((i + batch.length) / records.length) * 100),
          ),
        );
      }

      setResult({
        imported: totalImported,
        updated: totalUpdated,
        skipped: totalSkipped,
      });
      setStats(await getRawHearingsStats());
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("preview");
    }
  }, [csvData, mapping, mode]);

  const handleClear = useCallback(async () => {
    if (
      !confirm(
        "Are you sure you want to clear ALL RAW hearings data? This cannot be undone.",
      )
    )
      return;
    await clearRawHearings();
    setStats(await getRawHearingsStats());
  }, []);

  const handleReset = () => {
    setFile(null);
    setCsvData(null);
    setMapping({});
    setStep("upload");
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const mappedCount = Object.keys(mapping).length;
  const previewRows = csvData?.rows.slice(0, 5) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> Import RAW Hearings
            </h1>
            <p className="text-xs text-muted-foreground">
              Import HRG Tracker spreadsheet data into the RAW Hearings database
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-2xl font-bold">
              {Number(stats.total).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> Total Records
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-2xl font-bold">{stats.reps || 0}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Unique Reps
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">{stats.min_date || "-"}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Earliest Date
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">{stats.max_date || "-"}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Latest Date
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-xl border-2 border-dashed px-8 py-12 text-center cursor-pointer transition-all hover:border-primary/50 hover:bg-muted/30",
                file
                  ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20"
                  : "border-muted-foreground/25",
              )}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drop your RAW Hearings CSV here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .csv files exported from the HRG Tracker spreadsheet
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>

            {Number(stats.total) > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                  onClick={handleClear}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All RAW Data
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && csvData && (
          <div className="space-y-4">
            {/* File info */}
            <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {csvData.rows.length.toLocaleString()} rows •{" "}
                    {csvData.headers.length} columns • {mappedCount} mapped
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
            </div>

            {/* Column mapping */}
            <div className="rounded-lg border bg-card">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">Column Mapping</h3>
                <p className="text-xs text-muted-foreground">
                  {mappedCount} of {DB_FIELDS.length} fields mapped. Adjust if
                  needed.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-4">
                {DB_FIELDS.map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">
                      {FIELD_LABELS[field]}
                    </label>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      value={
                        mapping[field] !== undefined
                          ? String(mapping[field])
                          : ""
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (val === "") {
                            delete next[field];
                          } else {
                            next[field] = parseInt(val);
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="">— Skip —</option>
                      {csvData.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">
                  Preview (first 5 rows)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {Object.entries(mapping).map(([field]) => (
                        <th
                          key={field}
                          className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {FIELD_LABELS[field]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-muted/30">
                        {Object.entries(mapping).map(([field, colIdx]) => (
                          <td
                            key={field}
                            className="px-2 py-1.5 whitespace-nowrap max-w-37.5 truncate"
                          >
                            {row[colIdx] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import mode + button */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Import Mode</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  {(
                    [
                      {
                        key: "skip",
                        label: "Skip Duplicates",
                        desc: "Keep existing records, add new ones only",
                      },
                      {
                        key: "update",
                        label: "Update Existing",
                        desc: "Update existing records with new data",
                      },
                      {
                        key: "replace",
                        label: "Replace All",
                        desc: "Clear everything and reimport fresh",
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      className={cn(
                        "flex-1 rounded-lg border p-3 text-left transition-all",
                        mode === m.key
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {mode === "replace" && (
                <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  This will delete ALL existing RAW hearings before importing.
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {csvData.rows.length.toLocaleString()} records to import (
                  {mappedCount} fields mapped)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleCheckDuplicates}
                    disabled={!mapping.claimant || checking}
                  >
                    {checking ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{" "}
                        Checking...
                      </>
                    ) : (
                      <>
                        <Database className="h-3.5 w-3.5" /> Check Duplicates
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleImport}
                    disabled={!mapping.claimant}
                  >
                    <Download className="h-3.5 w-3.5" /> Import{" "}
                    {csvData.rows.length.toLocaleString()} Records
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === "importing" && (
          <div className="rounded-lg border bg-card p-8 text-center space-y-4">
            <RefreshCw className="h-8 w-8 mx-auto text-primary animate-spin" />
            <div>
              <p className="text-sm font-semibold">Importing records...</p>
              <p className="text-xs text-muted-foreground">
                {progress}% complete
              </p>
            </div>
            <div className="mx-auto max-w-xs h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && result && (
          <div className="rounded-lg border bg-card p-8 text-center space-y-4">
            <CheckCircle className="h-10 w-10 mx-auto text-emerald-600" />
            <div>
              <p className="text-lg font-semibold">Import Complete</p>
              <div className="flex justify-center gap-6 mt-3">
                {result.imported > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {result.imported}
                    </p>
                    <p className="text-xs text-muted-foreground">Imported</p>
                  </div>
                )}
                {result.updated > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-blue-600">
                      {result.updated}
                    </p>
                    <p className="text-xs text-muted-foreground">Updated</p>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-zinc-500">
                      {result.skipped}
                    </p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-center gap-3 mt-4">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Import Another
              </Button>
              <Link href="/">
                <Button size="sm">
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════ CHECK DUPLICATES MODAL ════════════════ */}
      {showCheck && checkResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCheck(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-sm font-semibold">
                  🔍 CSV vs Raw Hearings DB — Duplicate Check
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CSV: {csvData?.rows.length.toLocaleString()} rows • Matching
                  by Claimant + SSN + Date + Time
                </p>
              </div>
              <button
                onClick={() => setShowCheck(false)}
                className="text-muted-foreground hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/30 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {checkResult.newRecords.length.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    New Records
                  </p>
                </div>
                <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/30 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {checkResult.duplicateRecords.length.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Duplicates in DB
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">
                    {checkResult.emptyCount}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Empty / Skipped
                  </p>
                </div>
              </div>

              {/* New Records */}
              {checkResult.newRecords.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border-b">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      New Records (
                      {checkResult.newRecords.length.toLocaleString()})
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                      — Will be inserted
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
                        {checkResult.newRecords.slice(0, 200).map((r, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="px-3 py-1.5 font-medium">
                              {r.claimant}
                            </td>
                            <td className="px-3 py-1.5 tabular-nums">
                              {r.date || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                              {r.ssn || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {checkResult.newRecords.length > 200 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
                        Showing first 200 of{" "}
                        {checkResult.newRecords.length.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Duplicates */}
              {checkResult.duplicateRecords.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border-b">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Duplicates (
                      {checkResult.duplicateRecords.length.toLocaleString()})
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      —{" "}
                      {mode === "skip"
                        ? "Will be skipped"
                        : mode === "update"
                          ? "Will be updated"
                          : "N/A in replace mode"}
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
                        {checkResult.duplicateRecords
                          .slice(0, 200)
                          .map((r, i) => (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {i + 1}
                              </td>
                              <td className="px-3 py-1.5 font-medium">
                                {r.claimant}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums">
                                {r.date || "—"}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                                {r.ssn || "—"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {checkResult.duplicateRecords.length > 200 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
                        Showing first 200 of{" "}
                        {checkResult.duplicateRecords.length.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {checkResult.newRecords.length === 0 &&
                checkResult.duplicateRecords.length === 0 && (
                  <div className="rounded-lg border p-8 text-center text-muted-foreground">
                    ✅ All rows are empty — nothing to import.
                  </div>
                )}
            </div>

            <div className="flex items-center justify-end border-t px-5 py-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCheck(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
