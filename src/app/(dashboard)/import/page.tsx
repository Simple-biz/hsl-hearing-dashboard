"use client";

import { useState, useCallback } from "react";
import { AppHeader } from "@/components/layout/app-header";
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

// ============================================================
// TYPES
// ============================================================
type ImportStep = "upload" | "mapping" | "review" | "processing" | "complete";
type ReviewTab = "new" | "duplicate" | "rescheduled" | "unmatched" | "skipped";

interface ColumnMapping {
  [dbField: string]: number | null; // column index in sheet
}

// DB fields available for mapping
const DB_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "claimant", label: "Claimant Name", required: true },
  { key: "representative", label: "Representative" },
  { key: "ssn_last_4", label: "SSN (Last 4)" },
  { key: "claim_type", label: "Claim Type" },
  { key: "hearing_date", label: "Hearing Date", required: true },
  { key: "hearing_time", label: "Hearing Time", required: true },
  { key: "time_zone", label: "Time Zone", required: true },
  { key: "claimant_location", label: "Claimant Location" },
  { key: "representative_location", label: "Representative Location" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "alj", label: "ALJ" },
  { key: "medical_expert", label: "Medical Expert" },
  { key: "vocational_expert", label: "Vocational Expert" },
  { key: "status_date", label: "Status Date" },
  { key: "entered_hearing_level_date", label: "Entered Hearing Level Date" },
  { key: "download_type", label: "Download Type" },
  { key: "manner_of_appearance", label: "Manner of Appearance" },
  { key: "hearing_decision_status", label: "Decision Status" },
  { key: "medical_records_team", label: "Medical Records Team (Legacy)" },
  { key: "mr_team_id", label: "MR Team" },
  { key: "post_hrg_deadline", label: "Post-Hearing Deadline" },
];

// ============================================================
// IMPORT PAGE
// ============================================================
export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetData, setSheetData] = useState<
    (string | number | boolean | null)[][]
  >([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [reviewTab, setReviewTab] = useState<ReviewTab>("new");
  const [processing, setProcessing] = useState(false);

  // Mock review results
  const [results, setResults] = useState({
    new_records: 47,
    duplicate_records: 5159,
    rescheduled_records: 4,
    unmatched_records: 2,
    skipped_records: 3,
  });

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);

      // TODO: Replace with actual SheetJS parsing
      // const workbook = XLSX.read(await file.arrayBuffer())
      // const sheet = workbook.Sheets[workbook.SheetNames[0]]
      // const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      // Mock headers for UI development
      const mockHeaders = [
        "Claimant",
        "Rep",
        "SSN",
        "Claim Type",
        "Hearing Date",
        "Time",
        "TZ",
        "Claimant City",
        "Rep City",
        "City",
        "State",
        "ALJ",
        "Med Expert",
        "Voc Expert",
        "Status Date",
        "Download Type",
      ];
      setSheetHeaders(mockHeaders);

      // Auto-detect mapping
      const autoMapping: ColumnMapping = {};
      const fieldMatches: Record<string, string[]> = {
        claimant: ["claimant", "client", "name"],
        representative: ["rep", "representative", "attorney"],
        ssn_last_4: ["ssn", "social"],
        claim_type: ["claim type", "type"],
        hearing_date: ["hearing date", "date"],
        hearing_time: ["time", "hearing time"],
        time_zone: ["tz", "time zone", "timezone"],
        city: ["city"],
        state: ["state", "st"],
        alj: ["alj", "judge"],
        medical_expert: ["med expert", "medical expert"],
        vocational_expert: ["voc expert", "vocational expert"],
        status_date: ["status date"],
        download_type: ["download type", "download"],
      };

      DB_FIELDS.forEach((field) => {
        const matchers = fieldMatches[field.key] || [
          field.key.replace(/_/g, " "),
        ];
        const idx = mockHeaders.findIndex((h) =>
          matchers.some((m) => h.toLowerCase().includes(m)),
        );
        if (idx >= 0) autoMapping[field.key] = idx;
      });

      setMapping(autoMapping);
      setStep("mapping");
    },
    [],
  );

  // Handle drop zone
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // Trigger same logic as file input
      setFileName(file.name);
      setStep("mapping");
    }
  }, []);

  const handleStartReview = () => {
    setStep("review");
  };

  const handleImport = async () => {
    setProcessing(true);
    setStep("processing");
    // Simulate processing
    await new Promise((r) => setTimeout(r, 2000));
    setStep("complete");
    setProcessing(false);
  };

  const handleReset = () => {
    setStep("upload");
    setFileName("");
    setSheetHeaders([]);
    setSheetData([]);
    setMapping({});
  };

  return (
    <>
      <AppHeader
        title="Import Hearings"
        subtitle="Upload XLSX and manage hearing data"
      />

      <div className="p-6">
        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-6">
          {(["upload", "mapping", "review", "complete"] as const).map(
            (s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                    step === s ||
                      [
                        "upload",
                        "mapping",
                        "review",
                        "processing",
                        "complete",
                      ].indexOf(step) > i
                      ? "bg-accent text-white"
                      : "border text-muted-foreground",
                  )}
                >
                  {[
                    "upload",
                    "mapping",
                    "review",
                    "processing",
                    "complete",
                  ].indexOf(step) > i ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm font-medium",
                    step === s ? "text-foreground" : "text-muted-foreground/70",
                  )}
                >
                  {s === "upload"
                    ? "Upload"
                    : s === "mapping"
                      ? "Map Columns"
                      : s === "review"
                        ? "Review"
                        : "Complete"}
                </span>
                {i < 3 && <div className="w-8 h-px border" />}
              </div>
            ),
          )}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-2xl p-16 text-center transition-all",
              dragOver
                ? "border-accent bg-accent/5"
                : "border-border bg-card hover:border-ring",
            )}
          >
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet size={28} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Upload Hearing Schedule
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Drag & drop an XLSX file or click to browse
            </p>
            <label
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent 
                             text-white font-medium text-sm cursor-pointer hover:bg-accent-hover
                             transition-colors shadow-sm"
            >
              <Upload size={16} />
              Choose File
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <p className="text-xs text-muted-foreground/70 mt-3">
              Supports .xlsx, .xls, and .csv files
            </p>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Map Columns
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <FileSpreadsheet size={13} className="inline -mt-0.5 mr-1" />
                  {fileName} — {sheetHeaders.length} columns detected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X size={14} className="inline mr-1" /> Cancel
                </button>
                <button
                  onClick={handleStartReview}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-white
                           text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  Analyze <ArrowRight size={14} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-3">
                {DB_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-48 shrink-0">
                      <span
                        className={cn(
                          "text-sm",
                          field.required
                            ? "font-semibold text-foreground"
                            : "text-foreground/70",
                        )}
                      >
                        {field.label}
                        {field.required && (
                          <span className="text-danger ml-0.5">*</span>
                        )}
                      </span>
                    </div>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        }))
                      }
                      className={cn(
                        "flex-1 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                        mapping[field.key] != null
                          ? "border-emerald-300 bg-emerald-50/50 text-foreground"
                          : "border-border bg-muted text-muted-foreground/70",
                      )}
                    >
                      <option value="">— Skip —</option>
                      {sheetHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          Col {String.fromCharCode(65 + i)}: {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Tab navigation */}
            <div className="bg-card border border-border rounded-xl">
              <div className="flex items-center gap-1 px-4 py-3 border-b border-border/50 overflow-x-auto">
                {(
                  [
                    {
                      key: "new",
                      label: "New Records",
                      count: results.new_records,
                      icon: CheckCircle2,
                      color: "text-emerald-600",
                    },
                    {
                      key: "duplicate",
                      label: "Duplicates",
                      count: results.duplicate_records,
                      icon: AlertTriangle,
                      color: "text-amber-600",
                    },
                    {
                      key: "rescheduled",
                      label: "Rescheduled",
                      count: results.rescheduled_records,
                      icon: RefreshCw,
                      color: "text-blue-600",
                    },
                    {
                      key: "unmatched",
                      label: "Not in Sheet",
                      count: results.unmatched_records,
                      icon: Search,
                      color: "text-purple-600",
                    },
                    {
                      key: "skipped",
                      label: "Skipped",
                      count: results.skipped_records,
                      icon: X,
                      color: "text-muted-foreground",
                    },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setReviewTab(tab.key)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                        "whitespace-nowrap transition-colors",
                        reviewTab === tab.key
                          ? "bg-foreground text-background"
                          : "text-foreground/70 hover:bg-muted",
                      )}
                    >
                      <Icon
                        size={14}
                        className={
                          reviewTab === tab.key ? "text-white" : tab.color
                        }
                      />
                      {tab.label}
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums",
                          reviewTab === tab.key
                            ? "bg-card/20 text-white"
                            : "bg-muted text-foreground/70",
                        )}
                      >
                        {tab.count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="p-6">
                {reviewTab === "new" && (
                  <div>
                    <p className="text-sm text-foreground/70 mb-4">
                      {results.new_records} new records will be imported into
                      the database.
                    </p>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-emerald-800">
                        Ready to import {results.new_records} new hearing
                        records
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        These records don&apos;t match any existing hearings by
                        claimant + date
                      </p>
                    </div>
                  </div>
                )}

                {reviewTab === "duplicate" && (
                  <div>
                    <p className="text-sm text-foreground/70 mb-4">
                      {results.duplicate_records.toLocaleString()} records match
                      existing hearings. Updating will overwrite sheet data
                      while{" "}
                      <strong>preserving dashboard rep assignments</strong>.
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-amber-800">
                        Update {results.duplicate_records.toLocaleString()}{" "}
                        existing records?
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        Sheet data (date, time, ALJ, etc.) will be updated. Rep
                        assignments made in the dashboard are preserved.
                      </p>
                    </div>
                  </div>
                )}

                {reviewTab === "rescheduled" && (
                  <div>
                    <p className="text-sm text-foreground/70 mb-4">
                      {results.rescheduled_records} records detected as
                      rescheduled hearings (claimant name ends with
                      &quot;Rescheduled&quot;).
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-800">
                        Update {results.rescheduled_records} original records
                        with rescheduled data
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        Original records matched by base claimant name + SSN.
                        All sheet data will be applied to the original record.
                      </p>
                    </div>
                  </div>
                )}

                {reviewTab === "unmatched" && (
                  <div>
                    <p className="text-sm text-foreground/70 mb-4">
                      {results.unmatched_records} records exist in the database
                      but were not found in the uploaded sheet.
                    </p>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-purple-800">
                          {results.unmatched_records} database records not in
                          sheet
                        </p>
                        <p className="text-xs text-purple-600 mt-1">
                          Select records to delete, or leave them as-is
                        </p>
                      </div>
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                                       font-medium bg-danger text-white hover:bg-red-700 transition-colors"
                      >
                        <Trash2 size={13} /> Delete Selected
                      </button>
                    </div>
                  </div>
                )}

                {reviewTab === "skipped" && (
                  <div>
                    <p className="text-sm text-foreground/70 mb-4">
                      {results.skipped_records} records were skipped due to
                      missing required fields.
                    </p>
                    <div className="bg-muted border border-border rounded-lg p-4">
                      <p className="text-sm font-medium text-foreground/80">
                        {results.skipped_records} rows skipped
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Missing claimant name, hearing date, or hearing time
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action bar */}
            <div className="bg-card border border-border rounded-xl px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Recommended order: 1) Update Rescheduled → 2) Delete Not in
                Sheet → 3) Import New → 4) Update Duplicates
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg text-sm text-foreground/70 hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent text-white
                           text-sm font-medium hover:bg-accent-hover transition-colors shadow-sm"
                >
                  Process All <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Processing */}
        {step === "processing" && (
          <div className="bg-card border border-border rounded-xl p-16 text-center">
            <Loader2
              size={40}
              className="animate-spin text-accent mx-auto mb-4"
            />
            <h2 className="text-lg font-semibold text-foreground">
              Processing Import...
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              This may take a moment for large files
            </p>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === "complete" && (
          <div className="bg-card border border-border rounded-xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Import Complete
            </h2>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              {results.new_records} imported •{" "}
              {results.duplicate_records.toLocaleString()} updated •{" "}
              {results.rescheduled_records} rescheduled •{" "}
              {results.skipped_records} skipped
            </p>
            <button
              onClick={handleReset}
              className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium
                       hover:bg-accent-hover transition-colors"
            >
              Import Another File
            </button>
          </div>
        )}
      </div>
    </>
  );
}
