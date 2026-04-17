"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Upload,
  X as XIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  importRepDocsFromCsv,
  previewRepDocsImport,
  type RepDocsImportPreview,
} from "@/app/(dashboard)/representative-docs/import-action";

type Step = "upload" | "preview" | "result";

export function RepDocsImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<RepDocsImportPreview | null>(null);
  const [result, setResult] = useState<{
    matched: number;
    skipped: number;
    notFound: number;
    errors: string[];
  } | null>(null);
  const [filter, setFilter] = useState<
    "all" | "match" | "fuzzy" | "not_found" | "skipped"
  >("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(null);
    setResult(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      setCsvText(text);
      const p = await previewRepDocsImport(text);
      setPreview(p);
      setStep("preview");
    } catch (e) {
      setResult({
        matched: 0,
        skipped: 0,
        notFound: 0,
        errors: [e instanceof Error ? e.message : "Preview failed"],
      });
      setStep("result");
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!csvText) return;
    setLoading(true);
    try {
      const res = await importRepDocsFromCsv(csvText);
      setResult(res);
      setStep("result");
      if (res.matched > 0) onSuccess();
    } catch (e) {
      setResult({
        matched: 0,
        skipped: 0,
        notFound: 0,
        errors: [e instanceof Error ? e.message : "Import failed"],
      });
      setStep("result");
    }
    setLoading(false);
  };

  const filteredRows =
    preview?.rows.filter((r) => filter === "all" || r.status === filter) ?? [];

  const maxWidth =
    step === "preview" ? "max-w-5xl" : "max-w-lg";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full rounded-xl border bg-card shadow-2xl flex flex-col max-h-[90vh]",
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">
              {step === "upload" && "📥 Import Rep Docs CSV"}
              {step === "preview" && "👀 Preview Rep Docs Import"}
              {step === "result" && "✅ Import Complete"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === "upload" &&
                "Match by claimant name + hearing date and populate workflow fields"}
              {step === "preview" &&
                "Review matches before committing. Nothing has been written yet."}
              {step === "result" && "Review the import results below"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {step === "upload" && (
            <>
              <div
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors",
                  file
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                    : "border-border hover:border-primary/50 hover:bg-muted/30",
                )}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f && f.name.endsWith(".csv")) handleFile(f);
                }}
              >
                <Upload
                  className={cn(
                    "h-8 w-8 mb-2",
                    file ? "text-emerald-500" : "text-muted-foreground",
                  )}
                />
                {file ? (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {file.name}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Drop CSV file here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Expected format: New Pre-Hearing 2.0 - Repdocs.csv
                    </p>
                  </>
                )}
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

              <div className="rounded-lg bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How it works:</p>
                <p>
                  • Each row is matched to a hearing by{" "}
                  <span className="font-medium">claimant name + date</span>
                </p>
                <p>• Rescheduled suffixes are ignored during matching</p>
                <p>• You will see a preview before anything is written</p>
                <p>
                  • On confirm, existing rep-docs rows will be{" "}
                  <span className="font-medium text-amber-600">overwritten</span>
                </p>
              </div>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <StatCard
                  label="Exact Match"
                  value={preview.matched}
                  tone="emerald"
                  active={filter === "match"}
                  onClick={() =>
                    setFilter(filter === "match" ? "all" : "match")
                  }
                />
                <StatCard
                  label="Fuzzy (±7d)"
                  value={preview.fuzzy}
                  tone="blue"
                  active={filter === "fuzzy"}
                  onClick={() =>
                    setFilter(filter === "fuzzy" ? "all" : "fuzzy")
                  }
                />
                <StatCard
                  label="Not Found"
                  value={preview.notFound}
                  tone="amber"
                  active={filter === "not_found"}
                  onClick={() =>
                    setFilter(filter === "not_found" ? "all" : "not_found")
                  }
                />
                <StatCard
                  label="Skipped"
                  value={preview.skipped}
                  tone="zinc"
                  active={filter === "skipped"}
                  onClick={() =>
                    setFilter(filter === "skipped" ? "all" : "skipped")
                  }
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <p className="text-muted-foreground">
                  Showing {filteredRows.length} of {preview.rows.length} rows
                  {filter !== "all" && (
                    <>
                      {" "}
                      ·{" "}
                      <button
                        onClick={() => setFilter("all")}
                        className="underline hover:text-foreground"
                      >
                        clear filter
                      </button>
                    </>
                  )}
                </p>
              </div>

              <div className="rounded-lg border overflow-auto max-h-[50vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr className="border-b">
                      <th className="text-left px-2 py-2 font-medium">Row</th>
                      <th className="text-left px-2 py-2 font-medium">
                        Status
                      </th>
                      <th className="text-left px-2 py-2 font-medium">
                        Claimant
                      </th>
                      <th className="text-left px-2 py-2 font-medium">Date</th>
                      <th className="text-left px-2 py-2 font-medium">
                        Assigned
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="Uploaded NOH"
                      >
                        NOH
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="Sent Rep Docs to CL"
                      >
                        SENT
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="Rep Docs Signed"
                      >
                        SIGN
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="Contact Letter"
                      >
                        CL
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="Rep Docs Split (1696 + Fee)"
                      >
                        SPLIT
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="Uploaded in Chronicle"
                      >
                        CHRON
                      </th>
                      <th
                        className="text-center px-1 py-2 font-medium"
                        title="OHO Confirmation"
                      >
                        OHO
                      </th>
                      <th className="text-left px-2 py-2 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr
                        key={r.lineNum}
                        className="border-b hover:bg-muted/30"
                      >
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {r.lineNum}
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-2 py-1.5 font-medium">
                          {r.claimant}
                          {r.matchedClaimant &&
                            r.matchedClaimant.toLowerCase() !==
                              r.claimant.toLowerCase() && (
                              <div className="text-[10px] text-muted-foreground">
                                → {r.matchedClaimant}
                              </div>
                            )}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {r.hearingDate ?? r.hearingDateRaw}
                        </td>
                        <td className="px-2 py-1.5">{r.assignedTo ?? "—"}</td>
                        <Check val={r.uploadedNoh} />
                        <Check val={r.sentRepdocsToCl} />
                        <Check val={r.repdocsSigned} />
                        <Check val={r.contactLtr} />
                        <Check val={r.repdocsSplit} />
                        <Check val={r.repdocsUploadedChronicle} />
                        <Check val={r.ohoConfirmation} />
                        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                          {r.note ?? ""}
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={13}
                          className="text-center py-6 text-muted-foreground"
                        >
                          No rows match this filter
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Status column is computed from the 7 workflow checkboxes on
                import. Withdrawn overrides are preserved.
              </p>
            </>
          )}

          {step === "result" && result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {result.matched}
                  </p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-medium">
                    Matched
                  </p>
                </div>
                <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {result.notFound}
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                    Not Found
                  </p>
                </div>
                <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-900 p-3 text-center">
                  <p className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">
                    {result.skipped}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-medium">
                    Skipped
                  </p>
                </div>
              </div>

              {result.matched > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Successfully imported {result.matched} records
                  </p>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {result.errors.length} rows not matched:
                    </p>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((e, i) => (
                      <p
                        key={i}
                        className="text-[10px] text-amber-600 dark:text-amber-500"
                      >
                        {e}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          {step === "preview" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("upload");
                setPreview(null);
              }}
              disabled={loading}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>
              {step === "result" ? "Close" : "Cancel"}
            </Button>
          )}

          {step === "upload" && (
            <Button
              size="sm"
              disabled={!file || loading}
              onClick={handlePreview}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {loading ? "Parsing..." : "Preview"}
            </Button>
          )}

          {step === "preview" && (
            <Button
              size="sm"
              disabled={
                loading ||
                !preview ||
                preview.matched + preview.fuzzy === 0
              }
              onClick={handleConfirm}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {loading
                ? "Importing..."
                : `Confirm Import (${(preview?.matched ?? 0) + (preview?.fuzzy ?? 0)})`}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber" | "zinc";
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    emerald:
      "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900",
    blue: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900",
    amber:
      "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    zinc: "bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-center transition-all",
        tones[tone],
        active ? "ring-2 ring-offset-1 ring-foreground/30" : "hover:opacity-80",
      )}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide">{label}</p>
    </button>
  );
}

function StatusBadge({
  status,
}: {
  status: "match" | "fuzzy" | "not_found" | "skipped";
}) {
  const config = {
    match: {
      label: "Match",
      class:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    fuzzy: {
      label: "Fuzzy",
      class:
        "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    },
    not_found: {
      label: "Not Found",
      class:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    },
    skipped: {
      label: "Skipped",
      class:
        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        config.class,
      )}
    >
      {config.label}
    </span>
  );
}

function Check({ val }: { val: boolean }) {
  return (
    <td className="text-center px-1 py-1.5">
      {val ? (
        <span className="text-emerald-600 font-bold">✓</span>
      ) : (
        <span className="text-muted-foreground/30">—</span>
      )}
    </td>
  );
}
