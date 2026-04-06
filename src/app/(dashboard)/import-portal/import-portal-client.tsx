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
  ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  importPortalRecords,
  clearPortalData,
  getPortalStats,
} from "./actions";
import type { PortalRecord } from "./actions";

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const COLUMN_DEFS = [
  { key: "entry_date", label: "Entry Date", col: "A", required: false },
  { key: "mr_specialist", label: "MR Specialist", col: "B", required: false },
  { key: "hearing_date", label: "Hearing Date", col: "C", required: false },
  { key: "client_name", label: "Client Name", col: "D", required: true },
  { key: "provider", label: "Provider", col: "E", required: false },
  { key: "mycase_link", label: "MyCase Link", col: "F", required: false },
  { key: "portal_link", label: "Portal Link", col: "G", required: false },
  { key: "portal_username", label: "Username", col: "H", required: false },
  { key: "portal_password", label: "Password", col: "I", required: false },
  { key: "got_mr", label: "Got MR?", col: "J", required: false },
  {
    key: "approved_by_tl",
    label: "Approved by TL",
    col: "K",
    required: false,
  },
] as const;

const HEADER_MAP: Record<string, string> = {
  date: "entry_date",
  "entry date": "entry_date",
  entry_date: "entry_date",
  "mr specialist": "mr_specialist",
  mr_specialist: "mr_specialist",
  specialist: "mr_specialist",
  "hearing date": "hearing_date",
  hearing_date: "hearing_date",
  "client name": "client_name",
  client_name: "client_name",
  client: "client_name",
  name: "client_name",
  provider: "provider",
  "mycase link": "mycase_link",
  mycase_link: "mycase_link",
  mycase: "mycase_link",
  "portal link": "portal_link",
  "patient portal link": "portal_link",
  portal_link: "portal_link",
  portal: "portal_link",
  username: "portal_username",
  portal_username: "portal_username",
  password: "portal_password",
  portal_password: "portal_password",
  "got mr": "got_mr",
  "got mr?": "got_mr",
  "got the mr?": "got_mr",
  "got the mr": "got_mr",
  got_mr: "got_mr",
  approved: "approved_by_tl",
  "approved by tl": "approved_by_tl",
  approved_by_tl: "approved_by_tl",
};

const INITIAL_MALFORMED_SHOW = 5;

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface MalformedDate {
  row: number;
  col: string;
  value: string;
  client: string;
}

interface ParsedRow {
  cells: string[];
  comments: Record<number, string>; // colIndex → comment text
}

interface ParsedData {
  headers: string[];
  rows: ParsedRow[];
  sheetNames: string[];
  selectedSheet: number;
}

interface Stats {
  total: string;
  clients: string;
  got_mr_count: string;
  min_date: string | null;
  max_date: string | null;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  deleted: number;
  updatedEntries: {
    row: number;
    id: number;
    client_name: string;
    hearing_date: string | null;
    provider: string;
  }[];
}

// ═══════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════

function formatExcelDate(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  // Excel serial number
  const num = Number(s);
  if (!isNaN(num) && num > 25000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return s;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  value = value.trim();
  if (value.length < 6) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // Excel serial
  const num = Number(value);
  if (!isNaN(num) && num > 25000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  const slashCount = (value.match(/\//g) || []).length;
  const dashCount = (value.match(/-/g) || []).length;

  if (slashCount === 2 && dashCount === 0) {
    let match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, mm, dd, yyyy] = match;
      const month = parseInt(mm),
        day = parseInt(dd),
        year = parseInt(yyyy);
      if (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        year >= 1990 &&
        year <= 2100
      ) {
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
    }
    match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (match) {
      const [, mm, dd, yy] = match;
      const month = parseInt(mm),
        day = parseInt(dd);
      let year = parseInt(yy);
      year = year > 50 ? 1900 + year : 2000 + year;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
    }
  } else if (dashCount === 2 && slashCount === 0) {
    const match = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
      const [, mm, dd, yyyy] = match;
      const month = parseInt(mm),
        day = parseInt(dd),
        year = parseInt(yyyy);
      if (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        year >= 1990 &&
        year <= 2100
      ) {
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
    }
  }

  if (slashCount > 0 || dashCount > 0) return null;

  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y >= 1990 && y <= 2100) {
      return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

function parseBool(value: string): boolean {
  if (!value) return false;
  const v = String(value).toLowerCase().trim();
  return v === "yes" || v === "1" || v === "true";
}

function autoMapFromHeaders(headers: string[]): Record<string, number> {
  const autoMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const key = h.toLowerCase().trim();
    const dbField = HEADER_MAP[key];
    if (dbField && !autoMap[dbField]) autoMap[dbField] = idx;
  });

  // Fallback: positional mapping if no headers matched
  if (Object.keys(autoMap).length === 0 && headers.length >= 4) {
    COLUMN_DEFS.forEach((def, idx) => {
      if (idx < headers.length) {
        autoMap[def.key] = idx;
      }
    });
  }

  return autoMap;
}

function detectMalformed(
  rows: ParsedRow[],
  mapping: Record<string, number>,
): MalformedDate[] {
  const malformed: MalformedDate[] = [];
  const entryDateIdx = mapping.entry_date;
  const hearingDateIdx = mapping.hearing_date;
  const clientNameIdx = mapping.client_name;

  rows.forEach((row, rowIdx) => {
    const clientName =
      clientNameIdx !== undefined ? row.cells[clientNameIdx]?.trim() || "" : "";

    if (entryDateIdx !== undefined) {
      const val = row.cells[entryDateIdx]?.trim();
      if (val && !parseDate(val)) {
        malformed.push({
          row: rowIdx + 2,
          col: "A (Entry Date)",
          value: val,
          client: clientName,
        });
      }
    }

    if (hearingDateIdx !== undefined) {
      const val = row.cells[hearingDateIdx]?.trim();
      if (val && !parseDate(val)) {
        malformed.push({
          row: rowIdx + 2,
          col: "C (Hearing Date)",
          value: val,
          client: clientName,
        });
      }
    }
  });

  return malformed;
}

function readWorkbook(
  data: ArrayBuffer,
  sheetIndex: number = 0,
): ParsedData | null {
  const wb = XLSX.read(data, { type: "array", cellDates: true, cellNF: true });
  if (!wb.SheetNames.length) return null;

  const sheetName = wb.SheetNames[sheetIndex] || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const headers: string[] = [];
  const rows: ParsedRow[] = [];

  // Read headers (row 0)
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = ws[addr];
    headers.push(cell ? String(cell.v ?? "").trim() : "");
  }

  // Read data rows
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cells: string[] = [];
    const comments: Record<number, string> = {};
    let hasData = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];

      if (cell) {
        // Format value
        let val: string;
        if (cell.t === "d" || cell.v instanceof Date) {
          val = formatExcelDate(cell.v);
        } else if (cell.t === "b") {
          val = cell.v ? "TRUE" : "FALSE";
        } else {
          val =
            cell.v !== null && cell.v !== undefined
              ? String(cell.v).trim()
              : "";
        }

        // Clean leading newlines/whitespace from values
        val = val.replace(/^[\n\r\s\\n]+/, "").trim();
        cells.push(val);
        if (val) hasData = true;

        // Extract comment
        if (cell.c && cell.c.length > 0) {
          const commentText = cell.c
            .map((c: { t?: string }) => c.t || "")
            .join("")
            .trim();
          if (commentText) {
            comments[c - range.s.c] = commentText;
          }
        }
      } else {
        cells.push("");
      }
    }

    if (hasData) {
      rows.push({ cells, comments });
    }
  }

  return {
    headers,
    rows,
    sheetNames: wb.SheetNames,
    selectedSheet: sheetIndex,
  };
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export function ImportPortalClient({
  initialStats,
}: {
  initialStats: Stats;
  userRole: string;
  userName: string;
}) {
  const [stats, setStats] = useState(initialStats);
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [malformedDates, setMalformedDates] = useState<MalformedDate[]>([]);
  const [showAllMalformed, setShowAllMalformed] = useState(false);
  const [mode, setMode] = useState<"skip" | "update" | "replace">("skip");
  const [step, setStep] = useState<
    "upload" | "sheet-select" | "preview" | "importing" | "done"
  >("upload");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Handle file ──
  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
    setMalformedDates([]);
    setParsedData(null);

    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      setError("Invalid file type. Please upload .xlsx, .xls, or .csv");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      setFileBuffer(buffer);

      const data = readWorkbook(buffer, 0);
      if (!data || data.rows.length === 0) {
        setError("File is empty or could not be read");
        return;
      }

      // If multiple sheets, show sheet selection
      if (data.sheetNames.length > 1) {
        setParsedData(data);
        setStep("sheet-select");
        return;
      }

      // Single sheet — go to preview
      const autoMap = autoMapFromHeaders(data.headers);
      setMapping(autoMap);
      setMalformedDates(detectMalformed(data.rows, autoMap));
      setParsedData(data);
      setStep("preview");
    };
    reader.readAsArrayBuffer(f);
  }, []);

  // ── Select sheet ──
  const handleSheetSelect = useCallback(
    (index: number) => {
      if (!fileBuffer) return;
      const data = readWorkbook(fileBuffer, index);
      if (!data || data.rows.length === 0) {
        setError("Sheet is empty or could not be read");
        return;
      }
      const autoMap = autoMapFromHeaders(data.headers);
      setMapping(autoMap);
      setMalformedDates(detectMalformed(data.rows, autoMap));
      setParsedData(data);
      setStep("preview");
    },
    [fileBuffer],
  );

  // ── Import ──
  const handleImport = useCallback(async () => {
    if (!parsedData) return;

    if (mode === "replace") {
      if (
        !confirm(
          `Import ${parsedData.rows.length} rows?\n\n⚠️ WARNING: Replace All — ALL existing records will be DELETED first!`,
        )
      )
        return;
      if (
        !confirm(
          "Are you ABSOLUTELY SURE? This will delete ALL existing portal records!",
        )
      )
        return;
    } else {
      if (
        !confirm(
          `Import ${parsedData.rows.length} rows?\n\nMode: ${mode === "skip" ? "Skip Duplicates — Only new records will be added." : "Update Existing — Duplicates will be updated with new data."}`,
        )
      )
        return;
    }

    setStep("importing");
    setProgress(0);
    setResult(null);
    setError(null);

    try {
      const records: PortalRecord[] = [];

      // Reverse rows so bottom of file gets lower IDs (matching PHP behavior)
      const reversedRows = [...parsedData.rows].reverse();

      for (const row of reversedRows) {
        const get = (field: string) =>
          mapping[field] !== undefined
            ? (row.cells[mapping[field]] || "").trim()
            : "";

        const getComment = (field: string) => {
          const colIdx = mapping[field];
          if (colIdx === undefined) return null;
          return row.comments[colIdx] || null;
        };

        const clientName = get("client_name");
        if (!clientName) continue;

        const entryDateRaw = get("entry_date");
        const hearingDateRaw = get("hearing_date");

        records.push({
          entry_date: entryDateRaw ? parseDate(entryDateRaw) : null,
          mr_specialist: get("mr_specialist") || null,
          hearing_date: hearingDateRaw ? parseDate(hearingDateRaw) : null,
          client_name: clientName,
          provider: get("provider") || null,
          mycase_link: get("mycase_link") || null,
          portal_link: get("portal_link") || null,
          portal_username: get("portal_username") || null,
          portal_password: get("portal_password") || null,
          got_mr: parseBool(get("got_mr")),
          approved_by_tl: parseBool(get("approved_by_tl")),
          username_notes: getComment("portal_username"),
          password_notes: getComment("portal_password"),
          got_mr_notes: getComment("got_mr"),
          approved_notes: getComment("approved_by_tl"),
        });
      }

      if (records.length === 0) {
        setError("No valid records found (Client Name is required)");
        setStep("preview");
        return;
      }

      const BATCH = 200;
      let totalImported = 0,
        totalUpdated = 0,
        totalSkipped = 0,
        totalDeleted = 0;
      const allUpdatedEntries: ImportResult["updatedEntries"] = [];

      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const batchMode = i === 0 ? mode : mode === "replace" ? "skip" : mode;
        const res = await importPortalRecords(batch, batchMode);
        totalImported += res.imported;
        totalUpdated += res.updated;
        totalSkipped += res.skipped;
        if (i === 0) totalDeleted = res.deleted;
        allUpdatedEntries.push(...res.updatedEntries);
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
        deleted: totalDeleted,
        updatedEntries: allUpdatedEntries,
      });
      setStats(await getPortalStats());
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("preview");
    }
  }, [parsedData, mapping, mode]);

  // ── Clear ──
  const handleClear = useCallback(async () => {
    if (
      !confirm(
        "Are you sure you want to clear ALL patient portal data? This cannot be undone.",
      )
    )
      return;
    await clearPortalData();
    setStats(await getPortalStats());
  }, []);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setFile(null);
    setFileBuffer(null);
    setParsedData(null);
    setMapping({});
    setMalformedDates([]);
    setShowAllMalformed(false);
    setStep("upload");
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const mappedCount = Object.keys(mapping).length;
  const previewRows = parsedData?.rows.slice(0, 10) || [];

  // Count total comments in data
  const totalComments = parsedData
    ? parsedData.rows.reduce(
        (sum, row) => sum + Object.keys(row.comments).length,
        0,
      )
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/mr-patient-portal">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Import Patient
              Portal Data
            </h1>
            <p className="text-xs text-muted-foreground">
              Upload XLSX or CSV files with patient portal data
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
            <p className="text-2xl font-bold">{stats.clients || 0}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Unique Clients
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-2xl font-bold">{stats.got_mr_count || 0}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3" /> Got MR
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">{stats.min_date || "—"}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Earliest / Latest
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.max_date || "—"}
            </p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2">
          {[
            { num: 1, label: "Upload" },
            { num: 2, label: "Preview" },
            { num: 3, label: "Import" },
          ].map((s) => {
            const stepOrder = [
              "upload",
              "sheet-select",
              "preview",
              "importing",
              "done",
            ];
            const currentIdx = stepOrder.indexOf(step);
            const thisIdx = s.num === 1 ? 0 : s.num === 2 ? 2 : 4;
            const isActive =
              (s.num === 1 && currentIdx <= 1) ||
              (s.num === 2 && currentIdx === 2) ||
              (s.num === 3 && currentIdx >= 3);
            const isCompleted = currentIdx > thisIdx;
            return (
              <div
                key={s.num}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">
                  {isCompleted ? "✓" : s.num}
                </span>
                {s.label}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* ════════════════ STEP: UPLOAD ════════════════ */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">Upload File</h3>

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
                  Drop your file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported: .xlsx, .xls, .csv — cell comments will be imported
                  as notes
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              {/* Expected format */}
              <div className="pt-4">
                <p className="text-sm font-semibold mb-2">Expected Format:</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Column
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Field
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Required
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {COLUMN_DEFS.map((col) => (
                        <tr key={col.key} className="hover:bg-muted/30">
                          <td className="px-3 py-1.5 font-mono">{col.col}</td>
                          <td className="px-3 py-1.5">{col.label}</td>
                          <td className="px-3 py-1.5">
                            {col.required ? (
                              <span className="font-semibold text-red-600">
                                Yes
                              </span>
                            ) : col.key === "hearing_date" ? (
                              <span className="text-amber-600">
                                Recommended
                              </span>
                            ) : (
                              "No"
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {col.key === "got_mr" ||
                            col.key === "approved_by_tl" ||
                            col.key === "portal_username" ||
                            col.key === "portal_password"
                              ? "Cell comments → notes"
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {Number(stats.total) > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                  onClick={handleClear}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All Portal Data
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ STEP: SHEET SELECT ════════════════ */}
        {step === "sheet-select" && parsedData && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {parsedData.sheetNames.length} sheets found — select one to
                  import
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Select Sheet:</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value !== "") {
                    handleSheetSelect(parseInt(e.target.value));
                  }
                }}
              >
                <option value="">— Select a sheet —</option>
                {parsedData.sheetNames.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleReset}>
                ← Back
              </Button>
            </div>
          </div>
        )}

        {/* ════════════════ STEP: PREVIEW ════════════════ */}
        {step === "preview" && parsedData && (
          <div className="space-y-4">
            {/* File info */}
            <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {parsedData.rows.length.toLocaleString()} rows •{" "}
                    {parsedData.headers.length} columns • {mappedCount} mapped
                    {totalComments > 0 && (
                      <span className="text-amber-600 ml-1">
                        • {totalComments.toLocaleString()} cell comments
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
            </div>

            {/* Malformed dates warning */}
            {malformedDates.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    ⚠️ Malformed Dates Detected ({malformedDates.length})
                  </p>
                  {malformedDates.length > INITIAL_MALFORMED_SHOW && (
                    <button
                      className="text-xs px-3 py-1 rounded border border-red-300 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 hover:bg-red-200 transition-colors"
                      onClick={() => setShowAllMalformed(!showAllMalformed)}
                    >
                      {showAllMalformed ? "Show Less ▲" : "Show All ▼"}
                    </button>
                  )}
                </div>
                <div className="max-h-50 overflow-y-auto rounded border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                  {malformedDates
                    .slice(
                      0,
                      showAllMalformed ? undefined : INITIAL_MALFORMED_SHOW,
                    )
                    .map((d, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-2 border-b border-red-200 dark:border-red-800 last:border-b-0 flex-wrap text-xs"
                      >
                        <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap">
                          Row {d.row}
                        </span>
                        {d.client && (
                          <span className="font-semibold text-red-900 dark:text-red-200">
                            {d.client} —
                          </span>
                        )}
                        <span className="text-red-700 dark:text-red-400">
                          {d.col}:
                        </span>
                        <span className="font-mono bg-red-200 dark:bg-red-900 px-1.5 py-0.5 rounded text-red-800 dark:text-red-200">
                          &quot;{d.value}&quot;
                        </span>
                      </div>
                    ))}
                </div>
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  These will be imported as NULL. Expected formats: MM/DD/YYYY
                  or YYYY-MM-DD
                </p>
              </div>
            )}

            {/* Column mapping */}
            <div className="rounded-lg border bg-card">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">Column Mapping</h3>
                <p className="text-xs text-muted-foreground">
                  {mappedCount} of {COLUMN_DEFS.length} fields mapped. Adjust if
                  needed.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-4">
                {COLUMN_DEFS.map((def) => (
                  <div key={def.key} className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">
                      {def.label}
                      {def.required && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                    </label>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      value={
                        mapping[def.key] !== undefined
                          ? String(mapping[def.key])
                          : ""
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (val === "") {
                            delete next[def.key];
                          } else {
                            next[def.key] = parseInt(val);
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="">— Skip —</option>
                      {parsedData.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${String.fromCharCode(65 + i)}`}
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
                  Preview (first {Math.min(10, parsedData.rows.length)} rows)
                </h3>
              </div>
              <div className="overflow-x-auto max-h-100">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {parsedData.headers.map((h, i) => (
                        <th
                          key={i}
                          className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {h || `Col ${String.fromCharCode(65 + i)}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-muted/30">
                        {parsedData.headers.map((_, ci) => {
                          const hasComment = !!row.comments[ci];
                          const isMalformed = malformedDates.some(
                            (d) =>
                              d.row === ri + 2 &&
                              ((d.col.startsWith("A") &&
                                ci === mapping.entry_date) ||
                                (d.col.startsWith("C") &&
                                  ci === mapping.hearing_date)),
                          );
                          return (
                            <td
                              key={ci}
                              className={cn(
                                "px-2 py-1.5 whitespace-nowrap max-w-37.5 truncate",
                                isMalformed &&
                                  "bg-red-50 dark:bg-red-950/30 text-red-600 font-semibold",
                                hasComment &&
                                  !isMalformed &&
                                  "bg-amber-50 dark:bg-amber-950/20",
                              )}
                              title={
                                hasComment
                                  ? `💬 ${row.comments[ci]}`
                                  : undefined
                              }
                            >
                              {row.cells[ci] || "—"}
                              {hasComment && (
                                <span className="ml-1 text-amber-500">💬</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import mode */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Import Mode</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  {(
                    [
                      {
                        key: "skip",
                        label: "⏭️ Skip Duplicates",
                        desc: "Keep existing records, only add new ones",
                      },
                      {
                        key: "update",
                        label: "🔄 Update Existing",
                        desc: "Update existing records with new data from import",
                      },
                      {
                        key: "replace",
                        label: "🗑️ Replace All",
                        desc: "Delete all existing records, import fresh",
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      className={cn(
                        "flex-1 rounded-lg border p-3 text-left transition-all",
                        mode === m.key
                          ? m.key === "replace"
                            ? "border-red-400 bg-red-50 dark:bg-red-950/30 ring-1 ring-red-400"
                            : "border-primary bg-primary/5 ring-1 ring-primary"
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
                  This will delete ALL existing patient portal records before
                  importing.
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {parsedData.rows.length.toLocaleString()} records •{" "}
                  {mappedCount} fields mapped
                  {totalComments > 0 &&
                    ` • ${totalComments.toLocaleString()} comments → notes`}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    ← Back
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleImport}
                    disabled={!mapping.client_name}
                  >
                    <Download className="h-3.5 w-3.5" /> Import Data
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ STEP: IMPORTING ════════════════ */}
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

        {/* ════════════════ STEP: DONE ════════════════ */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-8 text-center space-y-4">
              <CheckCircle className="h-10 w-10 mx-auto text-emerald-600" />
              <p className="text-lg font-semibold">Import Complete</p>
              <div className="flex justify-center gap-6 mt-3 flex-wrap">
                {result.imported > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {result.imported}
                    </p>
                    <p className="text-xs text-muted-foreground">New Entries</p>
                  </div>
                )}
                {result.updated > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-amber-600">
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
                {result.deleted > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {result.deleted}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Deleted (Replace)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {result.updatedEntries.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  📝 Updated Entries ({result.updatedEntries.length})
                </p>
                <div className="max-h-75 overflow-y-auto space-y-1">
                  {result.updatedEntries.map((e, i) => (
                    <div
                      key={i}
                      className="text-xs py-1.5 border-b border-amber-200 dark:border-amber-800 last:border-b-0"
                    >
                      <span className="font-semibold">Row {e.row}:</span>{" "}
                      {e.client_name} | Date: {e.hearing_date || "—"} |
                      Provider: {e.provider || "—"}
                      <span className="text-muted-foreground ml-2 text-[11px]">
                        (DB ID: {e.id})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Import Another File
              </Button>
              <Link href="/mr-patient-portal">
                <Button size="sm">View Portal →</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
