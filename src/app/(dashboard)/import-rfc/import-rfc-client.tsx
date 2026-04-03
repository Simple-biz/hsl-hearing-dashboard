"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/layout";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserRole } from "@/lib/roles";
import {
  Upload,
  FileSpreadsheet,
  X,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { importRfcData, checkRfcDuplicates } from "./actions";
import type {
  RfcImportRow,
  ImportRfcResult,
  RfcPreviewCounts,
} from "./actions";

// ─── Column mapping ─────────────────────────────────────────────────────────

const EXPECTED_COLUMNS = [
  { key: "entry_date", label: "Date", dateCol: true },
  { key: "mr_team_name", label: "MR Team", dateCol: false },
  { key: "hearing_date", label: "Hearing Date", dateCol: true },
  { key: "client_name", label: "Client Name", dateCol: false },
  { key: "document_type", label: "Type of Document", dateCol: false },
  { key: "provider_name", label: "Provider Name", dateCol: false },
  { key: "date_signed", label: "Date Signed", dateCol: true },
  { key: "mycase_link", label: "MyCase Link", dateCol: false },
  { key: "method_received", label: "Method Received", dateCol: false },
  { key: "date_received", label: "Date Received", dateCol: true },
  { key: "filed_to_oho", label: "Filed to OHO", dateCol: false },
  { key: "approved_by_tl", label: "Approved by TL", dateCol: false },
  { key: "comments", label: "Comments (cell notes)", dateCol: false },
] as const;

// ─── Date parsing ───────────────────────────────────────────────────────────

function parseExcelDate(
  value: string | number | null | undefined,
): string | null {
  if (value == null || value === "") return null;

  // Numeric Excel serial date
  if (
    typeof value === "number" ||
    (/^\d+(\.\d+)?$/.test(String(value)) &&
      Number(value) > 40000 &&
      Number(value) < 60000)
  ) {
    const num = Number(value);
    const ms = (num - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }

  const s = String(value).trim();

  // YYYY.MM.DD
  let m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // YYYY-MM-DD or YYYY/MM/DD
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // MM/DD/YYYY or MM-DD-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr = yr > 50 ? 1900 + yr : 2000 + yr;
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // MM DD YYYY with spaces
  m = s.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr = yr > 50 ? 1900 + yr : 2000 + yr;
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // Fallback
  const ts = Date.parse(s);
  if (!isNaN(ts)) return new Date(ts).toISOString().slice(0, 10);

  return null;
}

function parseBool(v: string | number | null | undefined): boolean {
  if (v == null || v === "") return false;
  const s = String(v).toLowerCase().trim();
  return s === "yes" || s === "1" || s === "true";
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  userRole: UserRole;
}

type Step = "upload" | "preview" | "results";

export function ImportRfcClient({ userRole }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [mode, setMode] = useState<"skip" | "update" | "replace">("skip");
  const [result, setResult] = useState<ImportRfcResult | null>(null);
  const [previewCounts, setPreviewCounts] = useState<RfcPreviewCounts | null>(
    null,
  );
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  // ── Build import records from raw rows ──

  const buildRecordsFrom = useCallback(
    (rawRows: unknown[][]): RfcImportRow[] => {
      return rawRows.map((row) => {
        const cell = (idx: number) => {
          const v = row[idx];
          return v != null ? String(v).trim() : null;
        };
        return {
          entry_date: parseExcelDate(cell(0)),
          mr_team_name: cell(1),
          hearing_date: parseExcelDate(cell(2)),
          client_name: cell(3) ?? "",
          document_type: cell(4),
          provider_name: cell(5),
          date_signed: parseExcelDate(cell(6)),
          mycase_link: cell(7),
          method_received: cell(8),
          date_received: parseExcelDate(cell(9)),
          filed_to_oho: parseBool(cell(10)),
          approved_by_tl: parseBool(cell(11)),
          comments: cell(12),
        };
      });
    },
    [],
  );

  // ── Parse file ──

  const loadSheet = useCallback(
    (wb: XLSX.WorkBook, idx: number) => {
      setSelectedSheet(idx);
      const ws = wb.Sheets[wb.SheetNames[idx]];
      const json = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: "",
        raw: true,
      });
      if (json.length < 2) {
        setError("Sheet is empty or has no data rows");
        return;
      }
      const hdrs = (json[0] as unknown[]).map((h) => String(h ?? "").trim());
      const dataRows = (json.slice(1) as unknown[][]).filter((r) =>
        r.some((c) => c != null && String(c).trim() !== ""),
      );

      // Extract Excel cell comments/notes from column L (Approved by TL, index 11)
      // and append as a virtual 13th column (index 12) for each data row
      const COMMENT_COL = 11; // Column L (0-indexed)
      const dataStartRow = 1; // Row 0 is header
      let filteredIdx = 0;
      const allDataRows = json.slice(1) as unknown[][];
      for (let ri = 0; ri < allDataRows.length; ri++) {
        const row = allDataRows[ri];
        const hasData = row.some((c) => c != null && String(c).trim() !== "");
        if (!hasData) continue;
        // Check for cell comment on column L for this row
        const cellRef = XLSX.utils.encode_cell({
          r: dataStartRow + ri,
          c: COMMENT_COL,
        });
        const cell = ws[cellRef];
        const comment =
          cell?.c
            ?.map((c: { t?: string }) => c.t?.trim())
            .filter(Boolean)
            .join(" ") || null;
        dataRows[filteredIdx] = [...dataRows[filteredIdx]];
        dataRows[filteredIdx][12] = comment;
        filteredIdx++;
      }

      // Add "Comments" to headers if not already present
      if (hdrs.length <= 12) hdrs.push("Comments");

      setHeaders(hdrs);
      setRows(dataRows);
      setStep("preview");

      // Run duplicate check
      setPreviewCounts(null);
      setIsChecking(true);
      const records = buildRecordsFrom(dataRows);
      checkRfcDuplicates(records)
        .then((counts) => setPreviewCounts(counts))
        .catch(() => {})
        .finally(() => setIsChecking(false));
    },
    [buildRecordsFrom],
  );

  const readFile = useCallback(
    (f: File) => {
      setFile(f);
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, {
            type: "array",
            cellDates: false,
            raw: true,
          });
          workbookRef.current = wb;
          setSheets(wb.SheetNames);
          loadSheet(wb, 0);
        } catch {
          setError("Could not read file. Try saving as .csv or .xlsx.");
        }
      };
      reader.readAsArrayBuffer(f);
    },
    [loadSheet],
  );

  // ── Build import records ──

  const buildRecords = () => buildRecordsFrom(rows);

  // ── Import handler ──

  const handleImport = () => {
    if (mode === "replace") {
      if (
        !confirm(
          "⚠️ This will DELETE all existing RFC records and import fresh. Continue?",
        )
      )
        return;
      if (!confirm("Are you ABSOLUTELY SURE? This cannot be undone.")) return;
    }

    const records = buildRecords();
    startTransition(async () => {
      try {
        const res = await importRfcData(records, mode);
        setResult(res);
        setStep("results");
      } catch (err) {
        setError(`Import failed: ${(err as Error).message}`);
      }
    });
  };

  // ── Reset ──

  const reset = () => {
    setStep("upload");
    setFile(null);
    setSheets([]);
    setHeaders([]);
    setRows([]);
    setResult(null);
    setPreviewCounts(null);
    setIsChecking(false);
    setError(null);
    setMode("skip");
    workbookRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Drag & drop ──

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) readFile(f);
    },
    [readFile],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <AppHeader title="Import RFC" subtitle="Upload XLSX/CSV RFC Documents" />
      <div className="flex min-w-0 flex-col gap-4 p-3 sm:gap-5 sm:p-4 lg:p-6">
        <DashboardNav userRole={userRole} />

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-8">
          {(["Upload", "Preview", "Results"] as const).map((label, i) => {
            const stepIdx = i;
            const currentIdx =
              step === "upload" ? 0 : step === "preview" ? 1 : 2;
            const isActive = stepIdx === currentIdx;
            const isComplete = stepIdx < currentIdx;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                    isComplete && "bg-green-600 text-white",
                    isActive && "bg-primary text-primary-foreground",
                    !isActive &&
                      !isComplete &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? "✓" : stepIdx + 1}
                </div>
                <span
                  className={cn(
                    "text-sm font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <Card className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4">
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          </Card>
        )}

        {/* ══════════ STEP 1: Upload ══════════ */}
        {step === "upload" && (
          <Card className="overflow-hidden">
            <div className="bg-slate-700 dark:bg-slate-800 px-5 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Upload File
              </h2>
            </div>
            <div className="p-6 space-y-5">
              {/* Column mapping info */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                  Expected Column Order
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0.5 text-xs text-blue-700 dark:text-blue-400">
                  {EXPECTED_COLUMNS.map((col, i) => (
                    <span key={col.key}>
                      <strong>{String.fromCharCode(65 + i)}:</strong>{" "}
                      {col.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              {!file ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-muted-foreground/25 p-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <Upload className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">
                    Drop your file here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Supports .xlsx, .xls, or .csv
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readFile(f);
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <span className="flex-1 text-sm font-medium truncate">
                    {file.name}
                  </span>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Sheet selector for multi-sheet XLSX */}
              {sheets.length > 1 && file && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">Select Sheet:</label>
                  <select
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    value={selectedSheet}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (workbookRef.current)
                        loadSheet(workbookRef.current, idx);
                    }}
                  >
                    {sheets.map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ══════════ STEP 2: Preview ══════════ */}
        {step === "preview" && (
          <Card className="overflow-hidden">
            <div className="bg-slate-700 dark:bg-slate-800 px-5 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Preview Data
              </h2>
            </div>
            <div className="p-5 space-y-5">
              {/* Info bar */}
              <div className="rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
                Found <strong>{rows.length}</strong> data rows in{" "}
                <strong>{file?.name}</strong>
                {sheets.length > 1 && (
                  <>
                    {" "}
                    &middot; Sheet: <strong>{sheets[selectedSheet]}</strong>
                  </>
                )}
              </div>

              {/* Preview counts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-blue-100 dark:bg-blue-900/30 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {isChecking ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : (
                      (previewCounts?.total ?? "—")
                    )}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                    Total Rows
                  </div>
                </div>
                <div className="rounded-xl bg-green-100 dark:bg-green-900/30 p-4 text-center">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {isChecking ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : (
                      (previewCounts?.newRows ?? "—")
                    )}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                    New
                  </div>
                </div>
                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-4 text-center">
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {isChecking ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : (
                      (previewCounts?.duplicates ?? "—")
                    )}
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Duplicates
                  </div>
                </div>
                <div className="rounded-xl bg-gray-100 dark:bg-gray-800/50 p-4 text-center">
                  <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                    {isChecking ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : (
                      (previewCounts?.empty ?? "—")
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Empty / Skipped
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-auto max-h-100 rounded-lg border border-border">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-600 dark:bg-slate-700 text-white">
                      <th className="sticky top-0 bg-slate-600 dark:bg-slate-700 px-3 py-2 text-left font-semibold z-10">
                        #
                      </th>
                      {headers.map((h, i) => (
                        <th
                          key={i}
                          className="sticky top-0 bg-slate-600 dark:bg-slate-700 px-3 py-2 text-left font-semibold whitespace-nowrap z-10"
                        >
                          {h || `Col ${String.fromCharCode(65 + i)}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className={cn(
                          "border-b border-border/40 hover:bg-muted/40",
                          ri % 2 === 0 && "bg-muted/20",
                        )}
                      >
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                          {ri + 1}
                        </td>
                        {headers.map((_, ci) => {
                          const raw = row[ci];
                          const col = EXPECTED_COLUMNS[ci];
                          let display = raw != null ? String(raw) : "";
                          // Show parsed dates for date columns
                          if (col?.dateCol && display) {
                            const parsed = parseExcelDate(
                              raw as string | number,
                            );
                            if (parsed) display = parsed;
                          }
                          return (
                            <td
                              key={ci}
                              className="px-3 py-1.5 whitespace-nowrap max-w-48 truncate"
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import mode */}
              <div className="rounded-lg border border-border bg-muted/30 p-5">
                <h3 className="text-sm font-semibold mb-3">Import Mode</h3>
                <div className="flex flex-col gap-3">
                  {[
                    {
                      value: "skip" as const,
                      icon: "⏭️",
                      label: "Skip Duplicates",
                      desc: "Keep existing records, only add new ones",
                    },
                    {
                      value: "update" as const,
                      icon: "🔄",
                      label: "Update Existing",
                      desc: "Update existing records with new data from import",
                    },
                    {
                      value: "replace" as const,
                      icon: "🗑️",
                      label: "Replace All",
                      desc: "Delete all existing records, import fresh",
                    },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border-2 p-3.5 cursor-pointer transition-colors",
                        mode === opt.value
                          ? opt.value === "replace"
                            ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                            : "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="import_mode"
                        value={opt.value}
                        checked={mode === opt.value}
                        onChange={() => setMode(opt.value)}
                        className="mt-0.5 accent-primary"
                      />
                      <div>
                        <div className="text-sm font-semibold">
                          {opt.icon} {opt.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                  }}
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleImport} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-1.5 h-4 w-4" />
                  )}
                  {isPending ? "Importing…" : "Import Data"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ══════════ STEP 3: Results ══════════ */}
        {step === "results" && result && (
          <Card className="overflow-hidden">
            <div className="bg-slate-700 dark:bg-slate-800 px-5 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Import Results
              </h2>
            </div>
            <div className="p-5 space-y-5">
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl bg-green-100 dark:bg-green-900/30 p-5 text-center">
                  <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                    {result.imported}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                    New Entries
                  </div>
                </div>
                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-5 text-center">
                  <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                    {result.updated}
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Updated
                  </div>
                </div>
                <div className="rounded-xl bg-gray-100 dark:bg-gray-800/50 p-5 text-center">
                  <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                    {result.skipped}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Skipped</div>
                </div>
                {result.deleted > 0 && (
                  <div className="rounded-xl bg-red-100 dark:bg-red-900/30 p-5 text-center">
                    <div className="text-3xl font-bold text-red-700 dark:text-red-400">
                      {result.deleted}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-500 mt-1">
                      Deleted
                    </div>
                  </div>
                )}
              </div>

              {/* Updated entries detail */}
              {result.updatedEntries.length > 0 && (
                <div className="rounded-lg bg-muted/50 p-4 max-h-48 overflow-y-auto">
                  <h4 className="text-sm font-semibold mb-2">
                    Updated Entries
                  </h4>
                  {result.updatedEntries.map((e, i) => (
                    <div
                      key={i}
                      className="rounded bg-amber-50 dark:bg-amber-900/20 px-3 py-2 mb-1.5 text-xs"
                    >
                      <strong>Row {e.row}:</strong> {e.client_name}
                      {e.hearing_date && <> &middot; {e.hearing_date}</>}
                      {e.provider_name && <> &middot; {e.provider_name}</>}
                      <span className="text-muted-foreground ml-2">
                        (ID: {e.id})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 max-h-48 overflow-y-auto">
                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
                    Errors
                  </h4>
                  {result.errors.map((e, i) => (
                    <div
                      key={i}
                      className="rounded bg-red-100 dark:bg-red-900/20 px-3 py-2 mb-1.5 text-xs text-red-800 dark:text-red-300"
                    >
                      {e}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between border-t border-border pt-4">
                <Button variant="outline" onClick={reset}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Import Another
                </Button>
                <Button asChild>
                  <Link href="/rfc">
                    <CheckCircle className="mr-1.5 h-4 w-4" /> Go to RFC Page
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
