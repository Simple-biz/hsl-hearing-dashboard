"use client";

import { useState, useCallback } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MappedRow {
  rowIndex: number;
  data: Record<string, string>;
}

interface AnalyzeResult {
  newRecords: MappedRow[];
  duplicateRecords: (MappedRow & { existingId: number })[];
  rescheduledRecords: (MappedRow & { originalId: number; baseName: string })[];
  skippedRecords: (MappedRow & { reason: string })[];
  repsMatched: number;
  repsUnmatched: number;
  teamsMatched: number;
  teamsUnmatched: number;
  matchedDbIds: number[];
  totalDbCount: number;
}

interface NotInSheetRow {
  id: number;
  claimant: string;
  hearing_date: string;
  ssn_last_4: string | null;
  hearing_time: string | null;
  rep_name: string | null;
}

type Step =
  | "upload"
  | "sheets"
  | "mapping"
  | "analyzing"
  | "review"
  | "processing"
  | "complete";
type ReviewTab = "new" | "duplicate" | "rescheduled" | "notInSheet" | "skipped";

// ─── API helper ─────────────────────────────────────────────────────────────

async function api<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ─── Field config ───────────────────────────────────────────────────────────

const DB_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "claimant", label: "Claimant *", required: true },
  { key: "ssn_last_4", label: "SSN (Last 4)" },
  { key: "claim_type", label: "Claim Type" },
  { key: "hearing_date", label: "Hearing Date *", required: true },
  { key: "hearing_time", label: "Hearing Time" },
  { key: "time_zone", label: "Time Zone" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "claimant_location", label: "Claimant Location" },
  { key: "representative_location", label: "Rep Location" },
  { key: "alj", label: "ALJ" },
  { key: "medical_expert", label: "Medical Expert" },
  { key: "vocational_expert", label: "Vocational Expert" },
  { key: "status_date", label: "Status Date" },
  { key: "entered_hearing_level_date", label: "Entered Hearing Level" },
  { key: "download_type", label: "Download Type" },
  { key: "manner_of_appearance", label: "Manner of Appearance" },
  { key: "hearing_decision_status", label: "Decision" },
  { key: "phi_sheet_complete", label: "PHI" },
  { key: "rep_docs_complete", label: "Rep Docs" },
  { key: "fee_agreement_complete", label: "Fee Agmt" },
  { key: "five_day_notice", label: "5-Day" },
  { key: "rfc_status", label: "RFC" },
  { key: "task_assigned", label: "Task" },
  { key: "brief_assigned_to", label: "Brief" },
  { key: "mr_team_id", label: "Medical Team (lookup)" },
  { key: "medical_record_status", label: "MR Status" },
  { key: "medical_record_link", label: "MR Worksheet" },
  { key: "representative", label: "Representative (lookup)" },
  { key: "claimant_link", label: "Claimant Link" },
  { key: "post_hrg_deadline", label: "Post HRG Deadline" },
  { key: "post_hrg_notes", label: "Post HRG Notes" },
];

const AUTO_MATCH: Record<string, string[]> = {
  claimant: ["claimant", "client", "name"],
  representative: ["rep", "representative", "attorney"],
  ssn_last_4: ["ssn", "social", "last 4"],
  claim_type: ["claim type", "type"],
  hearing_date: ["hearing date", "date"],
  hearing_time: ["time", "hearing time"],
  time_zone: ["tz", "time zone", "timezone"],
  claimant_location: ["claimant location", "claimant city"],
  representative_location: ["rep location", "rep city"],
  city: ["city"],
  state: ["state", "st"],
  alj: ["alj", "judge"],
  medical_expert: ["med expert", "medical expert"],
  vocational_expert: ["voc expert", "vocational expert"],
  status_date: ["status date"],
  download_type: ["download type", "download"],
  entered_hearing_level_date: ["entered hearing"],
  manner_of_appearance: ["manner", "moa", "appearance"],
  hearing_decision_status: ["decision", "hearing decision"],
  phi_sheet_complete: ["phi"],
  rep_docs_complete: ["rep docs"],
  fee_agreement_complete: ["fee ag", "fee agreement"],
  five_day_notice: ["5-day", "five day", "5 day"],
  rfc_status: ["rfc"],
  task_assigned: ["task"],
  brief_assigned_to: ["brief"],
  mr_team_id: ["mr team", "medical records team", "medical team", "team"],
  medical_record_status: ["mr status", "medical record status"],
  medical_record_link: ["mr worksheet", "medical record link"],
  claimant_link: ["claimant link"],
  post_hrg_deadline: ["post hrg", "post hearing", "deadline"],
  post_hrg_notes: ["post hrg notes", "post hearing notes"],
};

const ANALYZE_CHUNK = 5000; // analysis is in-memory now, send large batches
const WRITE_CHUNK = 200; // keep writes smaller to avoid timeouts

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportClient() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [dragOver, setDragOver] = useState(false);

  // Cross-sheet SSN lookup
  const [enableCrossSheet, setEnableCrossSheet] = useState(false);
  const [crossSheetIdx, setCrossSheetIdx] = useState(-1);
  const [crossSheetHeaders, setCrossSheetHeaders] = useState<string[]>([]);
  const [crossSheetSsnCol, setCrossSheetSsnCol] = useState(-1);
  const [crossSheetClaimantCol, setCrossSheetClaimantCol] = useState(-1);
  const [crossSheetDateCol, setCrossSheetDateCol] = useState(-1);
  const [crossSheetLocClaimantCol, setCrossSheetLocClaimantCol] = useState(-1);
  const [crossSheetLocRepCol, setCrossSheetLocRepCol] = useState(-1);
  const [crossSheetDownloadCol, setCrossSheetDownloadCol] = useState(-1);
  const [crossSheetStatusDateCol, setCrossSheetStatusDateCol] = useState(-1);
  const [crossSheetRows, setCrossSheetRows] = useState<string[][]>([]);

  // Analysis results
  const [analysis, setAnalysis] = useState<{
    new: MappedRow[];
    dup: (MappedRow & { existingId: number })[];
    resched: (MappedRow & { originalId: number; baseName: string })[];
    skip: (MappedRow & { reason: string })[];
    notInSheet: NotInSheetRow[];
    repsM: number;
    repsU: number;
    teamsM: number;
    teamsU: number;
  } | null>(null);
  const [reviewTab, setReviewTab] = useState<ReviewTab>("new");
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [processLog, setProcessLog] = useState<string[]>([]);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    rescheduled: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState("");

  // Workbook ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wbRef, setWbRef] = useState<any>(null);

  // ── File parse ──
  const parseFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setError("");
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    setWbRef(wb);
    setSheetNames(wb.SheetNames);

    if (wb.SheetNames.length > 1) {
      setStep("sheets");
    } else {
      loadSheetFromWb(wb, 0);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadSheetFromWb = async (wb: any, idx: number) => {
    const XLSX = await import("xlsx");
    const ws = wb.Sheets[wb.SheetNames[idx]];
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });
    if (data.length < 2) {
      setError("Sheet has no data rows");
      return;
    }

    const hdrs = (data[0] as unknown[]).map((h) => String(h ?? "").trim());
    setHeaders(hdrs);
    setRawRows(
      data
        .slice(1)
        .map((r) => (r as unknown[]).map((c) => String(c ?? "").trim())),
    );
    setSelectedSheet(idx);

    // Auto-map
    const autoMap: Record<string, number | null> = {};
    DB_FIELDS.forEach((f) => {
      const matchers = AUTO_MATCH[f.key] || [f.key.replace(/_/g, " ")];
      const i = hdrs.findIndex((h) =>
        matchers.some((m) => h.toLowerCase().includes(m)),
      );
      autoMap[f.key] = i >= 0 ? i : null;
    });
    setMapping(autoMap);
    setStep("mapping");
  };

  const loadCrossSheet = async (idx: number) => {
    setCrossSheetIdx(idx);
    if (idx < 0 || !wbRef) {
      setCrossSheetHeaders([]);
      setCrossSheetRows([]);
      return;
    }
    const XLSX = await import("xlsx");
    const ws = wbRef.Sheets[wbRef.SheetNames[idx]];
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });
    if (data.length < 2) return;
    setCrossSheetHeaders(
      (data[0] as unknown[]).map((h) => String(h ?? "").trim()),
    );
    setCrossSheetRows(
      data
        .slice(1)
        .map((r) => (r as unknown[]).map((c) => String(c ?? "").trim())),
    );
  };

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  // ── Build mapped rows with cross-sheet lookup applied client-side ──
  const buildMappedRows = (): MappedRow[] => {
    const crossLookup: Record<string, Record<string, string>> = {};
    if (
      enableCrossSheet &&
      crossSheetRows.length > 0 &&
      crossSheetClaimantCol >= 0
    ) {
      for (const row of crossSheetRows) {
        const claimant = (row[crossSheetClaimantCol] || "")
          .trim()
          .toLowerCase();
        if (!claimant) continue;
        const date =
          crossSheetDateCol >= 0 ? (row[crossSheetDateCol] || "").trim() : "";
        const key = date ? `${claimant}|${date}` : claimant;
        const entry: Record<string, string> = {};
        if (crossSheetSsnCol >= 0 && row[crossSheetSsnCol])
          entry.ssn_last_4 = row[crossSheetSsnCol];
        if (crossSheetLocClaimantCol >= 0 && row[crossSheetLocClaimantCol])
          entry.claimant_location = row[crossSheetLocClaimantCol];
        if (crossSheetLocRepCol >= 0 && row[crossSheetLocRepCol])
          entry.representative_location = row[crossSheetLocRepCol];
        if (crossSheetDownloadCol >= 0 && row[crossSheetDownloadCol])
          entry.download_type = row[crossSheetDownloadCol];
        if (crossSheetStatusDateCol >= 0 && row[crossSheetStatusDateCol])
          entry.status_date = row[crossSheetStatusDateCol];
        crossLookup[key] = entry;
      }
    }

    return rawRows.map((row, i) => {
      const data: Record<string, string> = {};
      Object.entries(mapping).forEach(([field, colIdx]) => {
        if (colIdx != null && colIdx >= 0) data[field] = row[colIdx] || "";
      });

      if (enableCrossSheet && Object.keys(crossLookup).length > 0) {
        const claimant = (data.claimant || "").trim().toLowerCase();
        const date = data.hearing_date || "";
        const entry =
          crossLookup[`${claimant}|${date}`] || crossLookup[claimant];
        if (entry) {
          if (entry.ssn_last_4 && !data.ssn_last_4)
            data.ssn_last_4 = entry.ssn_last_4;
          if (entry.claimant_location)
            data.claimant_location = entry.claimant_location;
          if (entry.representative_location)
            data.representative_location = entry.representative_location;
          if (entry.download_type) data.download_type = entry.download_type;
          if (entry.status_date) data.status_date = entry.status_date;
        }
      }

      return { rowIndex: i, data };
    });
  };

  // ── Analyze (chunked via API route) ──
  const handleAnalyze = async () => {
    setStep("analyzing");
    setError("");
    try {
      const mapped = buildMappedRows();
      const totals = {
        new: [] as MappedRow[],
        dup: [] as (MappedRow & { existingId: number })[],
        resched: [] as (MappedRow & { originalId: number; baseName: string })[],
        skip: [] as (MappedRow & { reason: string })[],
        repsM: 0,
        repsU: 0,
        teamsM: 0,
        teamsU: 0,
        allMatchedDbIds: [] as number[],
      };

      for (let i = 0; i < mapped.length; i += ANALYZE_CHUNK) {
        const chunk = mapped.slice(i, i + ANALYZE_CHUNK);
        setAnalyzeProgress(
          `Analyzing rows ${i + 1}–${Math.min(i + ANALYZE_CHUNK, mapped.length)} of ${mapped.length}...`,
        );
        const r = await api<AnalyzeResult>("analyze", { rows: chunk });
        totals.new.push(...r.newRecords);
        totals.dup.push(...r.duplicateRecords);
        totals.resched.push(...r.rescheduledRecords);
        totals.skip.push(...r.skippedRecords);
        totals.repsM += r.repsMatched;
        totals.repsU += r.repsUnmatched;
        totals.teamsM += r.teamsMatched;
        totals.teamsU += r.teamsUnmatched;
        totals.allMatchedDbIds.push(...r.matchedDbIds);
      }

      setAnalyzeProgress("Checking for records not in sheet...");
      const notInSheet = await api<NotInSheetRow[]>("notInSheet", {
        matchedIds: totals.allMatchedDbIds,
      });

      setAnalysis({ ...totals, notInSheet });
      setStep("review");
      setReviewTab("new");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStep("mapping");
    }
  };

  // ── Process (chunked via API route) ──
  const handleProcess = async () => {
    if (!analysis) return;
    setStep("processing");
    setProcessLog([]);
    setError("");
    try {
      const log: string[] = [];
      let imported = 0,
        updated = 0,
        rescheduled = 0;

      if (analysis.resched.length > 0) {
        log.push(`Updating ${analysis.resched.length} rescheduled...`);
        setProcessLog([...log]);
        for (let i = 0; i < analysis.resched.length; i += WRITE_CHUNK) {
          const r = await api<{ count: number }>("updateRescheduled", {
            records: analysis.resched.slice(i, i + WRITE_CHUNK),
          });
          rescheduled += r.count;
        }
        log.push(`✓ ${rescheduled} rescheduled`);
        setProcessLog([...log]);
      }

      if (analysis.new.length > 0) {
        log.push(`Importing ${analysis.new.length} new...`);
        setProcessLog([...log]);
        for (let i = 0; i < analysis.new.length; i += WRITE_CHUNK) {
          const r = await api<{ imported: number }>("import", {
            records: analysis.new.slice(i, i + WRITE_CHUNK),
          });
          imported += r.imported;
        }
        log.push(`✓ ${imported} imported`);
        setProcessLog([...log]);
      }

      if (analysis.dup.length > 0) {
        log.push(`Updating ${analysis.dup.length} duplicates...`);
        setProcessLog([...log]);
        for (let i = 0; i < analysis.dup.length; i += WRITE_CHUNK) {
          const r = await api<{ updated: number }>("update", {
            records: analysis.dup.slice(i, i + WRITE_CHUNK),
          });
          updated += r.updated;
        }
        log.push(`✓ ${updated} updated`);
        setProcessLog([...log]);
      }

      setResult({
        imported,
        updated,
        rescheduled,
        skipped: analysis.skip.length,
      });
      setStep("complete");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Processing failed");
      setStep("review");
    }
  };

  const handleDeleteNotInSheet = async (ids: number[]) => {
    if (!analysis) return;
    try {
      await api("deleteNotInSheet", { ids });
      setAnalysis({
        ...analysis,
        notInSheet: analysis.notInSheet.filter((r) => !ids.includes(r.id)),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setFileName("");
    setSheetNames([]);
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setAnalysis(null);
    setResult(null);
    setProcessLog([]);
    setWbRef(null);
    setEnableCrossSheet(false);
    setCrossSheetIdx(-1);
    setError("");
  };

  const mappedCount = Object.values(mapping).filter((v) => v != null).length;
  const requiredMapped = DB_FIELDS.filter((f) => f.required).every(
    (f) => mapping[f.key] != null,
  );
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "sheets", label: "Sheet" },
    { key: "mapping", label: "Map" },
    { key: "review", label: "Review" },
    { key: "complete", label: "Done" },
  ];
  const stepOrder = [
    "upload",
    "sheets",
    "mapping",
    "analyzing",
    "review",
    "processing",
    "complete",
  ];
  const ci = stepOrder.indexOf(step);

  return (
    <>
      <AppHeader
        title="Import Hearings"
        subtitle="Upload hearing schedules from XLSX"
      />
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <DashboardNav
          userRole={"system_admin" as import("@/lib/roles").UserRole}
        />

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  ci > stepOrder.indexOf(s.key)
                    ? "bg-emerald-500 text-white"
                    : step === s.key ||
                        (s.key === "review" && step === "analyzing")
                      ? "bg-primary text-primary-foreground"
                      : "border text-muted-foreground",
                )}
              >
                {ci > stepOrder.indexOf(s.key) ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  step === s.key ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Upload ── */}
        {step === "upload" && (
          <Card
            className="border-dashed border-2"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <CardContent
              className={cn(
                "flex flex-col items-center py-16",
                dragOver && "bg-primary/5",
              )}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">Upload Hearing Schedule</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                Drag & drop or click to browse
              </p>
              <label>
                <Button asChild className="cursor-pointer gap-2">
                  <span>
                    <Upload className="h-4 w-4" /> Choose File
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-muted-foreground mt-3">
                Supports .xlsx, .xls, .csv
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Sheet Selection ── */}
        {step === "sheets" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Select Sheet to Import
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {fileName} — {sheetNames.length} sheets found
              </p>
            </CardHeader>
            <Separator />
            <CardContent className="py-4 space-y-2">
              {sheetNames.map((name, i) => {
                const isRecommended =
                  name.toLowerCase().includes("hearing") &&
                  name.toLowerCase().includes("detail");
                const isRaw = name.toLowerCase() === "raw";
                return (
                  <button
                    key={i}
                    onClick={() => loadSheetFromWb(wbRef, i)}
                    className={cn(
                      "w-full text-left rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50",
                      isRecommended && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <FileSpreadsheet className="inline h-4 w-4 mr-2 text-muted-foreground" />
                    {name}
                    {isRecommended && (
                      <span className="ml-2 text-xs text-primary font-normal">
                        (recommended — hearing data)
                      </span>
                    )}
                    {isRaw && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        (use for cross-sheet SSN lookup)
                      </span>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* ── Column Mapping ── */}
        {step === "mapping" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Map Columns</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <FileSpreadsheet className="inline h-3.5 w-3.5 mr-1" />
                    {fileName} → {sheetNames[selectedSheet]} — {headers.length}{" "}
                    cols, {rawRows.length.toLocaleString()} rows · {mappedCount}{" "}
                    mapped
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!requiredMapped}
                    onClick={handleAnalyze}
                    className="gap-1.5"
                  >
                    Analyze <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {DB_FIELDS.map((f) => (
                    <div key={f.key} className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-44 shrink-0 text-sm",
                          f.required
                            ? "font-semibold"
                            : "text-muted-foreground",
                        )}
                      >
                        {f.label}
                      </span>
                      <select
                        value={mapping[f.key] ?? ""}
                        onChange={(e) =>
                          setMapping((p) => ({
                            ...p,
                            [f.key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }))
                        }
                        className={cn(
                          "flex-1 h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                          mapping[f.key] != null
                            ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800"
                            : "border-input bg-background",
                        )}
                      >
                        <option value="">— Skip —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            Col {String.fromCharCode(65 + (i % 26))}: {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Cross-Sheet Lookup */}
            {sheetNames.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableCrossSheet}
                      onChange={(e) => setEnableCrossSheet(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <CardTitle className="text-sm">
                      🔗 Cross-Sheet Lookup
                    </CardTitle>
                    <span className="text-xs text-muted-foreground font-normal">
                      Pull SSN, locations, download type, status date from
                      another sheet (e.g. RAW)
                    </span>
                  </label>
                </CardHeader>
                {enableCrossSheet && (
                  <>
                    <Separator />
                    <CardContent className="py-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium">
                            Lookup Sheet
                          </label>
                          <select
                            value={crossSheetIdx}
                            onChange={(e) =>
                              loadCrossSheet(Number(e.target.value))
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value={-1}>— Select —</option>
                            {sheetNames.map(
                              (n, i) =>
                                i !== selectedSheet && (
                                  <option key={i} value={i}>
                                    {n}
                                  </option>
                                ),
                            )}
                          </select>
                        </div>
                        {crossSheetHeaders.length > 0 && (
                          <>
                            <div>
                              <label className="mb-1 block text-xs font-medium">
                                Claimant Col *
                              </label>
                              <select
                                value={crossSheetClaimantCol}
                                onChange={(e) =>
                                  setCrossSheetClaimantCol(
                                    Number(e.target.value),
                                  )
                                }
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value={-1}>—</option>
                                {crossSheetHeaders.map((h, i) => (
                                  <option key={i} value={i}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium">
                                Date Col
                              </label>
                              <select
                                value={crossSheetDateCol}
                                onChange={(e) =>
                                  setCrossSheetDateCol(Number(e.target.value))
                                }
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value={-1}>—</option>
                                {crossSheetHeaders.map((h, i) => (
                                  <option key={i} value={i}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium">
                                SSN Col
                              </label>
                              <select
                                value={crossSheetSsnCol}
                                onChange={(e) =>
                                  setCrossSheetSsnCol(Number(e.target.value))
                                }
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value={-1}>—</option>
                                {crossSheetHeaders.map((h, i) => (
                                  <option key={i} value={i}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                      {crossSheetHeaders.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium">
                              Claimant Location
                            </label>
                            <select
                              value={crossSheetLocClaimantCol}
                              onChange={(e) =>
                                setCrossSheetLocClaimantCol(
                                  Number(e.target.value),
                                )
                              }
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value={-1}>— Skip —</option>
                              {crossSheetHeaders.map((h, i) => (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">
                              Rep Location
                            </label>
                            <select
                              value={crossSheetLocRepCol}
                              onChange={(e) =>
                                setCrossSheetLocRepCol(Number(e.target.value))
                              }
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value={-1}>— Skip —</option>
                              {crossSheetHeaders.map((h, i) => (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">
                              Download Type
                            </label>
                            <select
                              value={crossSheetDownloadCol}
                              onChange={(e) =>
                                setCrossSheetDownloadCol(Number(e.target.value))
                              }
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value={-1}>— Skip —</option>
                              {crossSheetHeaders.map((h, i) => (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">
                              Status Date
                            </label>
                            <select
                              value={crossSheetStatusDateCol}
                              onChange={(e) =>
                                setCrossSheetStatusDateCol(
                                  Number(e.target.value),
                                )
                              }
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value={-1}>— Skip —</option>
                              {crossSheetHeaders.map((h, i) => (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ── Analyzing ── */}
        {step === "analyzing" && (
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <h2 className="text-lg font-semibold">Analyzing...</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {analyzeProgress}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Review ── */}
        {step === "review" && analysis && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-1.5 p-3 border-b overflow-x-auto">
                {[
                  {
                    key: "new" as const,
                    label: "New",
                    count: analysis.new.length,
                    icon: CheckCircle2,
                    color: "text-emerald-600",
                  },
                  {
                    key: "duplicate" as const,
                    label: "Duplicates",
                    count: analysis.dup.length,
                    icon: AlertTriangle,
                    color: "text-amber-600",
                  },
                  {
                    key: "rescheduled" as const,
                    label: "Rescheduled",
                    count: analysis.resched.length,
                    icon: RefreshCw,
                    color: "text-blue-600",
                  },
                  {
                    key: "notInSheet" as const,
                    label: "Not in Sheet",
                    count: analysis.notInSheet.length,
                    icon: Search,
                    color: "text-purple-600",
                  },
                  {
                    key: "skipped" as const,
                    label: "Skipped",
                    count: analysis.skip.length,
                    icon: X,
                    color: "text-muted-foreground",
                  },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setReviewTab(tab.key)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                        reviewTab === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5",
                          reviewTab === tab.key ? "" : tab.color,
                        )}
                      />
                      {tab.label}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                          reviewTab === tab.key
                            ? "bg-primary-foreground/20"
                            : "bg-muted",
                        )}
                      >
                        {tab.count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
              <CardContent className="py-0">
                {/* Reusable preview table for rows with mapped data */}
                {(reviewTab === "new" ||
                  reviewTab === "duplicate" ||
                  reviewTab === "rescheduled" ||
                  reviewTab === "skipped") &&
                  (() => {
                    const rows: (MappedRow & {
                      existingId?: number;
                      originalId?: number;
                      baseName?: string;
                      reason?: string;
                    })[] =
                      reviewTab === "new"
                        ? analysis.new
                        : reviewTab === "duplicate"
                          ? analysis.dup
                          : reviewTab === "rescheduled"
                            ? analysis.resched
                            : analysis.skip;
                    const displayFields = DB_FIELDS.filter(
                      (f) =>
                        mapping[f.key] != null || f.key === "representative",
                    );
                    const maxRows = 500; // virtualize for performance
                    const shown = rows.slice(0, maxRows);

                    if (rows.length === 0) {
                      return (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          No{" "}
                          {reviewTab === "new"
                            ? "new"
                            : reviewTab === "duplicate"
                              ? "duplicate"
                              : reviewTab === "rescheduled"
                                ? "rescheduled"
                                : "skipped"}{" "}
                          records
                        </div>
                      );
                    }

                    return (
                      <div>
                        {/* Summary banner */}
                        <div
                          className={cn(
                            "px-4 py-2.5 text-sm font-medium border-b",
                            reviewTab === "new"
                              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                              : reviewTab === "duplicate"
                                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                                : reviewTab === "rescheduled"
                                  ? "bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300"
                                  : "bg-muted text-muted-foreground",
                          )}
                        >
                          {reviewTab === "new" &&
                            `${rows.length.toLocaleString()} new records ready to import`}
                          {reviewTab === "duplicate" &&
                            `${rows.length.toLocaleString()} existing records will be updated (rep assignments preserved unless mapped)`}
                          {reviewTab === "rescheduled" &&
                            `${rows.length} rescheduled records matched to originals`}
                          {reviewTab === "skipped" &&
                            `${rows.length} rows skipped`}
                          {rows.length > maxRows && (
                            <span className="ml-2 text-xs opacity-70">
                              (showing first {maxRows})
                            </span>
                          )}
                        </div>

                        {/* Scrollable data table */}
                        <div className="overflow-auto max-h-100">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-muted/80 backdrop-blur-sm">
                                <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                                  #
                                </th>
                                {reviewTab === "rescheduled" && (
                                  <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                                    Original ID
                                  </th>
                                )}
                                {reviewTab === "duplicate" && (
                                  <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                                    DB ID
                                  </th>
                                )}
                                {reviewTab === "skipped" && (
                                  <th className="px-2 py-1.5 text-left font-semibold text-destructive whitespace-nowrap">
                                    Reason
                                  </th>
                                )}
                                {displayFields.map((f) => (
                                  <th
                                    key={f.key}
                                    className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap"
                                  >
                                    {f.label
                                      .replace(" *", "")
                                      .replace(" (lookup)", "")}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {shown.map((row) => (
                                <tr
                                  key={row.rowIndex}
                                  className="hover:bg-muted/30"
                                >
                                  <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                    {row.rowIndex + 2}
                                  </td>
                                  {reviewTab === "rescheduled" &&
                                    "originalId" in row && (
                                      <td className="px-2 py-1.5">
                                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                          #{row.originalId}
                                        </span>
                                      </td>
                                    )}
                                  {reviewTab === "duplicate" &&
                                    "existingId" in row && (
                                      <td className="px-2 py-1.5">
                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                          #{row.existingId}
                                        </span>
                                      </td>
                                    )}
                                  {reviewTab === "skipped" &&
                                    "reason" in row && (
                                      <td className="px-2 py-1.5 text-destructive max-w-40 truncate">
                                        {row.reason}
                                      </td>
                                    )}
                                  {displayFields.map((f) => {
                                    const val = row.data[f.key] || "";
                                    // Color code rep lookups — show name
                                    if (f.key === "representative") {
                                      const repName =
                                        row.data._assigned_rep_name;
                                      const status =
                                        row.data._assignment_status;
                                      const unmatched = row.data._unmatched_rep;
                                      if (repName)
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-emerald-700 dark:text-emerald-400"
                                            title={`ID: ${row.data._assigned_rep_id}`}
                                          >
                                            {repName}
                                          </td>
                                        );
                                      if (status === "wd_never_assigned")
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-amber-600"
                                          >
                                            📋 WD - Never Assigned
                                          </td>
                                        );
                                      if (status === "withdrawal")
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-red-600"
                                          >
                                            🚫 Withdrawal
                                          </td>
                                        );
                                      if (unmatched)
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-red-600"
                                          >
                                            {unmatched} ⚠️
                                          </td>
                                        );
                                      if (!val)
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-muted-foreground"
                                          >
                                            —
                                          </td>
                                        );
                                      return (
                                        <td
                                          key={f.key}
                                          className="px-2 py-1.5 text-muted-foreground"
                                        >
                                          {val} (null)
                                        </td>
                                      );
                                    }
                                    // Color code MR team lookups — show name
                                    if (f.key === "mr_team_id") {
                                      const teamName = row.data._mr_team_name;
                                      const unmatched =
                                        row.data._unmatched_team;
                                      if (teamName)
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-emerald-700 dark:text-emerald-400"
                                            title={`ID: ${row.data.mr_team_id}`}
                                          >
                                            {teamName}
                                          </td>
                                        );
                                      if (unmatched)
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-red-600"
                                          >
                                            {unmatched} ⚠️
                                          </td>
                                        );
                                      if (!val)
                                        return (
                                          <td
                                            key={f.key}
                                            className="px-2 py-1.5 text-muted-foreground"
                                          >
                                            —
                                          </td>
                                        );
                                      return (
                                        <td key={f.key} className="px-2 py-1.5">
                                          {val}
                                        </td>
                                      );
                                    }
                                    return (
                                      <td
                                        key={f.key}
                                        className="px-2 py-1.5 max-w-50 truncate"
                                        title={val}
                                      >
                                        {val || "—"}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                {reviewTab === "notInSheet" && (
                  <div className="py-4 px-4">
                    <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 dark:bg-purple-950/20 dark:border-purple-800 flex items-start justify-between">
                      <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
                        {analysis.notInSheet.length} DB records not matched by
                        any row in the uploaded sheet
                      </p>
                      {analysis.notInSheet.length > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="shrink-0 gap-1.5"
                          onClick={() =>
                            handleDeleteNotInSheet(
                              analysis.notInSheet.map((r) => r.id),
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete All
                        </Button>
                      )}
                    </div>
                    {analysis.notInSheet.length > 0 && (
                      <div className="mt-3 overflow-auto max-h-100">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-muted/80 backdrop-blur-sm">
                              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                ID
                              </th>
                              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                Claimant
                              </th>
                              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                SSN
                              </th>
                              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                Hearing Date
                              </th>
                              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                Time
                              </th>
                              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                Assigned Rep
                              </th>
                              <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {analysis.notInSheet.map((r) => (
                              <tr key={r.id} className="hover:bg-muted/30">
                                <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                  {r.id}
                                </td>
                                <td className="px-2 py-1.5 font-medium">
                                  {r.claimant}
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                                  {r.ssn_last_4 ? `···${r.ssn_last_4}` : "—"}
                                </td>
                                <td className="px-2 py-1.5 tabular-nums">
                                  {r.hearing_date}
                                </td>
                                <td className="px-2 py-1.5 tabular-nums">
                                  {r.hearing_time || "—"}
                                </td>
                                <td className="px-2 py-1.5">
                                  {r.rep_name || (
                                    <span className="text-muted-foreground">
                                      Unassigned
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-red-500"
                                    onClick={() =>
                                      handleDeleteNotInSheet([r.id])
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between py-3">
                <div className="text-sm text-muted-foreground">
                  Reps:{" "}
                  <span className="text-emerald-600">
                    {analysis.repsM} matched
                  </span>
                  {analysis.repsU > 0 && (
                    <>
                      ,{" "}
                      <span className="text-amber-600">
                        {analysis.repsU} unmatched
                      </span>
                    </>
                  )}
                  {" · "}Teams:{" "}
                  <span className="text-emerald-600">
                    {analysis.teamsM} matched
                  </span>
                  {analysis.teamsU > 0 && (
                    <>
                      ,{" "}
                      <span className="text-amber-600">
                        {analysis.teamsU} unmatched
                      </span>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    Cancel
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={handleProcess}>
                    Process All <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Processing ── */}
        {step === "processing" && (
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <h2 className="text-lg font-semibold">Processing...</h2>
              <div className="mt-4 w-full max-w-md space-y-1">
                {processLog.map((m, i) => (
                  <p
                    key={i}
                    className={cn(
                      "text-sm",
                      m.startsWith("✓")
                        ? "text-emerald-600"
                        : "text-muted-foreground",
                    )}
                  >
                    {m}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Complete ── */}
        {step === "complete" && result && (
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold">Import Complete</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                {result.imported} imported · {result.updated.toLocaleString()}{" "}
                updated · {result.rescheduled} rescheduled · {result.skipped}{" "}
                skipped
              </p>
              <Button onClick={handleReset} className="gap-2">
                <Upload className="h-4 w-4" /> Import Another
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
