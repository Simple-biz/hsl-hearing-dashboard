
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  RefreshCw,
  X,
  ExternalLink,
  Search,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Permission gate ──────────────────────────────────────────────────────────
// Single source of truth lives in @/lib/roles — do not duplicate here.
import { canSyncGoogleSheets } from "@/lib/roles";

// ─── Types ────────────────────────────────────────────────────────────────────
// These mirror the exact JSON shape returned by the N8N webhook.
// Keep in sync with /api/mr-sync/ and the N8N "Respond to Webhook"
// node output.

export type ChangeType = "created" | "updated" | "deleted";

export interface FieldDiff {
  field: string;
  old: string | null;
  new: string | null;
}

export interface ChangeEntry {
  type: ChangeType;
  record: string;      // Claimant name
  sheetRow: number;
  diffs: FieldDiff[];  // Empty for created/deleted — use note instead
  note?: string;
  time: string;        // ISO string from N8N; formatted locally
}

export type SyncStatus = "completed" | "busy" | "no_change";
export type HistorySource = "fresh_run" | "latest_completed_session";

export interface SyncResult {
  runAt: string;       // ISO string
  triggeredBy: string; // Display name of the user who clicked Sync
  triggeredByRole?: string;
  triggeredById?: string;
  sheetUrl: string;
  syncStatus?: SyncStatus;
  historySource?: HistorySource;
  historyCompletedAt?: string | null;
  message?: string;
  summary: {
    total: number;
    created: number;
    updated: number;
    deleted: number;
  };
  changes: ChangeEntry[];
}

interface SyncApiError {
  message?: string;
  code?: string;
}

interface SyncToastState {
  title: string;
  message: string;
}

interface SyncNoticeState {
  tone: "amber" | "green" | "slate";
  message: string;
}

// ─── Loading steps ────────────────────────────────────────────────────────────
// Labels mirror the actual N8N workflow node sequence so the wait feels
// explained to the user rather than opaque.

const LOADING_STEPS = [
  { pct: 12, label: "Connecting to Google Sheets…" },
  { pct: 35, label: "Reading current sheet state…" },
  { pct: 58, label: "Comparing with MR database…" },
  { pct: 78, label: "Writing changes to sheet…" },
  { pct: 93, label: "Finalizing sync…" },
] as const;

const STEP_INTERVAL_MS = 650;
const BUSY_RETRY_DELAY_MS = 2500;
const MAX_BUSY_RETRIES = 24;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: ChangeType }) {
  if (type === "created") return <Plus size={13} />;
  if (type === "updated") return <Pencil size={13} />;
  return <Trash2 size={13} />;
}

const TYPE_BADGE: Record<ChangeType, string> = {
  created: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  updated: "bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300",
  deleted: "bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300",
};

const TYPE_ICON_BG: Record<ChangeType, string> = {
  created: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  updated: "bg-blue-100  text-blue-600  dark:bg-blue-900/40  dark:text-blue-400",
  deleted: "bg-red-100   text-red-600   dark:bg-red-900/40   dark:text-red-400",
};

function ChangeRow({ entry }: { entry: ChangeEntry }) {
  const localTime = new Date(entry.time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
      {/* Icon */}
      <div
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5",
          TYPE_ICON_BG[entry.type]
        )}
      >
        <TypeIcon type={entry.type} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Record name + badge */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {entry.record}
          </span>
          <span
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
              TYPE_BADGE[entry.type]
            )}
          >
            {entry.type}
          </span>
        </div>

        {/* Field diffs (updated rows) */}
        {entry.diffs.length > 0 && (
          <div className="flex flex-col gap-1 mb-1.5">
            {entry.diffs.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border/60 text-muted-foreground shrink-0">
                  {d.field}
                </span>
                <span className="text-muted-foreground/60 line-through truncate max-w-32.5">
                  {d.old ?? "—"}
                </span>
                <span className="text-muted-foreground/50 shrink-0">→</span>
                <span className="font-medium text-foreground truncate max-w-37.5">
                  {d.new ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Note (created / deleted rows) */}
        {entry.note && (
          <p className="text-xs text-muted-foreground italic mb-1.5">
            {entry.note}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock size={10} />
          <span>{localTime}</span>
          <span className="mx-0.5 opacity-40">·</span>
          <span>Sheet row {entry.sheetRow}</span>
        </div>
      </div>
    </div>
  );
}

function mapSyncErrorToToast(error: SyncApiError): SyncToastState {
  switch (error.code) {
    case "SYNC_UNAUTHORIZED":
      return {
        title: "Session expired",
        message: error.message ?? "Please sign in again before running the sync.",
      };
    case "SYNC_FORBIDDEN":
      return {
        title: "Sync unavailable",
        message:
          error.message ??
          "You do not have permission to run the Google Sheets sync.",
      };
    case "SYNC_TIMEOUT":
      return {
        title: "Sync still running",
        message:
          error.message ??
          "The sync is taking longer than expected. The sheet may still be updating.",
      };
    case "SYNC_CONFIG_ERROR":
    case "SYNC_SERVICE_UNAVAILABLE":
      return {
        title: "Sync unavailable",
        message:
          error.message ??
          "Google Sheets sync is temporarily unavailable. Please try again later.",
      };
    default:
      return {
        title: "Sync failed",
        message:
          error.message ??
          "We could not complete the Google Sheets sync. Please try again.",
      };
  }
}

function SyncErrorToast({
  toast,
  onClose,
}: {
  toast: SyncToastState;
  onClose: () => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-70 w-full max-w-sm rounded-xl border border-red-200 bg-red-50 p-4 shadow-2xl dark:border-red-900/70 dark:bg-zinc-950/95">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-red-100 p-1.5 text-red-600 dark:bg-red-900/40 dark:text-red-300">
          <AlertTriangle size={14} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">
            {toast.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-red-800 dark:text-red-200">
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-red-700 transition-colors hover:bg-red-100 hover:text-red-900 dark:text-red-300 dark:hover:bg-red-900/30 dark:hover:text-red-100"
          aria-label="Dismiss sync error"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Loading overlay ──────────────────────────────────────────────────────────

function LoadingOverlay({ stepIndex }: { stepIndex: number }) {
  const step = LOADING_STEPS[Math.min(stepIndex, LOADING_STEPS.length - 1)];
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <Loader2 size={24} className="animate-spin text-blue-500" />
      <div className="w-56 space-y-2">
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${step.pct}%` }}
          />
        </div>
        <p className="text-xs text-center text-muted-foreground">{step.label}</p>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2.5 text-center">
      <p className={cn("text-xl font-medium leading-tight", color)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
        {label}
      </p>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface ChangeHistoryModalProps {
  result: SyncResult;
  onClose: () => void;
}

type FilterType = "all" | ChangeType;

function ChangeHistoryModal({ result, onClose }: ChangeHistoryModalProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const filtered = result.changes.filter((e) => {
    const typeOk = filter === "all" || e.type === filter;
    const q = search.toLowerCase();
    const searchOk =
      !q ||
      e.record.toLowerCase().includes(q) ||
      e.diffs.some((d) => d.field.toLowerCase().includes(q));
    return typeOk && searchOk;
  });

  const runAt = new Date(result.runAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const latestSessionRunAt = result.historyCompletedAt
    ? new Date(result.historyCompletedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const showingLatestCompletedSession =
    result.historySource === "latest_completed_session" &&
    (result.changes.length > 0 || Boolean(result.historyCompletedAt));

  const headerBadge = showingLatestCompletedSession
    ? {
        label: "Showing latest sync",
        className:
          "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      }
    : result.syncStatus === "no_change"
      ? {
          label: "No new changes",
          className:
            "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
        }
      : {
          label: "Sync complete",
          className:
            "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
        };

  function exportCSV() {
    const header = ["Type", "Record", "Field", "Old Value", "New Value", "Sheet Row"];
    const rows = result.changes.flatMap((e) =>
      e.diffs.length > 0
        ? e.diffs.map((d) => [e.type, e.record, d.field, d.old ?? "", d.new ?? "", String(e.sheetRow)])
        : [[e.type, e.record, "", "", e.note ?? "", String(e.sheetRow)]]
    );
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `mr-sync-${new Date(result.runAt).toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const FILTERS: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Created", value: "created" },
    { label: "Updated", value: "updated" },
    { label: "Deleted", value: "deleted" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-170 max-h-[90vh] rounded-xl border bg-card shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold">Change History</h2>
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  headerBadge.className
                )}
              >
                {headerBadge.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span>
                Run by{" "}
                <span className="font-medium text-foreground">
                  {result.triggeredBy}
                </span>
              </span>
              <span className="opacity-40">·</span>
              <span>{runAt}</span>
              <span className="opacity-40">·</span>
              <a
                href={result.sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-500 hover:text-blue-400 inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} />
                Open Sheet
              </a>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {showingLatestCompletedSession && (
          <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {result.message ??
              "No new changes were found from your click. Showing the latest completed sync session instead."}
            {latestSessionRunAt ? (
              <span className="block mt-1 text-[11px] text-amber-700/90">
                Latest completed sync: {latestSessionRunAt}
              </span>
            ) : null}
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-2 px-5 py-3 border-b shrink-0">
          <StatCard label="Total"   value={result.summary.total}   color="text-foreground" />
          <StatCard label="Created" value={result.summary.created} color="text-green-600 dark:text-green-400" />
          <StatCard label="Updated" value={result.summary.updated} color="text-blue-600 dark:text-blue-400" />
          <StatCard label="Deleted" value={result.summary.deleted} color="text-red-600 dark:text-red-400" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b shrink-0 flex-wrap">
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-md border transition-colors",
                  filter === f.value
                    ? "bg-muted border-border font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-35">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or field…"
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              No changes match your filter.
            </p>
          ) : (
            filtered.map((entry, i) => <ChangeRow key={i} entry={entry} />)
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock size={11} />
            Showing {filtered.length} of {result.summary.total} changes
          </p>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <Download size={11} />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="text-xs px-4 py-1.5 rounded-md bg-foreground text-background hover:opacity-85 transition-opacity font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sync Button ──────────────────────────────────────────────────────────────
// Drop this wherever the MR page toolbar is rendered.
// Renders nothing if the user's role is not in SYNC_ALLOWED_ROLES.

interface SyncButtonProps {
  userRole: string;
}

export function GoogleSheetsSyncButton({ userRole }: SyncButtonProps) {
  const [phase, setPhase] = useState<"idle" | "syncing" | "waiting" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [toast, setToast] = useState<SyncToastState | null>(null);
  const [notice, setNotice] = useState<SyncNoticeState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hasLoadedLatest, setHasLoadedLatest] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!mounted || hasLoadedLatest) return;

    let cancelled = false;

    const loadLatest = async () => {
      try {
        const res = await fetch("/api/mr-sync", {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await res.json().catch(() => null)) as
          | (Partial<SyncResult> & { ok?: boolean; hasLatestSync?: boolean })
          | null;

        if (!res.ok || !payload?.ok || !payload?.hasLatestSync) {
          return;
        }

        if (cancelled) return;

        const latestResult = payload as SyncResult;
        setResult(latestResult);
        setPhase("done");
      } catch {
        // Silent failure: sync history hydration should never block the page.
      } finally {
        if (!cancelled) setHasLoadedLatest(true);
      }
    };

    void loadLatest();

    return () => {
      cancelled = true;
    };
  }, [hasLoadedLatest, mounted]);

  const showErrorToast = useCallback((error: SyncApiError) => {
    const nextToast = mapSyncErrorToToast(error);

    if (toastTimer.current) clearTimeout(toastTimer.current);

    setToast(nextToast);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const showNotice = useCallback((nextNotice: SyncNoticeState, durationMs = 8000) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(nextNotice);
    noticeTimer.current = setTimeout(() => setNotice(null), durationMs);
  }, []);

  const handleSync = useCallback(async () => {
    setPhase("syncing");
    setStepIndex(0);
    dismissToast();
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
    setModalOpen(true);

    let step = 0;
    const stepTimer = setInterval(() => {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      setStepIndex(step);
    }, STEP_INTERVAL_MS);

    const sleep = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    try {
      for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt += 1) {
        const res = await fetch("/api/mr-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        const payload = (await res.json().catch(() => ({
          message: "We could not complete the Google Sheets sync. Please try again.",
        }))) as SyncApiError & Partial<SyncResult> & { ok?: boolean };

        if (!res.ok) {
          throw payload;
        }

        const syncResult = payload as SyncResult;

        if (syncResult.syncStatus === "busy") {
          setResult(null);
          setPhase("waiting");
          setStepIndex(LOADING_STEPS.length - 1);
          setNotice({
            tone: "amber",
            message:
              syncResult.message ??
              "Another Google Sheets sync is currently running. Waiting for it to finish…",
          });

          if (attempt === MAX_BUSY_RETRIES) {
            setPhase("idle");
            setModalOpen(false);
            showErrorToast({
              message:
                "Another Google Sheets sync is still running. We stopped waiting automatically for now.",
            });
            return;
          }

          await sleep(BUSY_RETRY_DELAY_MS);
          continue;
        }

        setNotice(null);
        setResult(syncResult);
        setPhase("done");

        if (syncResult.syncStatus === "no_change" && syncResult.changes.length === 0) {
          showNotice(
            {
              tone: "slate",
              message: "No new changes were left to sync.",
            },
            7000,
          );
        }

        return;
      }
    } catch (err) {
      const error =
        err && typeof err === "object"
          ? (err as SyncApiError)
          : {
              message:
                "We could not complete the Google Sheets sync. Please try again.",
            };

      showErrorToast(error);
      setPhase("idle");
      setModalOpen(false);
    } finally {
      clearInterval(stepTimer);
    }
  }, [dismissToast, showErrorToast, showNotice]);

  if (!canSyncGoogleSheets(userRole)) return null;

  const lastSyncAt = result?.historyCompletedAt ?? result?.runAt ?? null;
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSync}
            disabled={phase === "syncing" || phase === "waiting"}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
              phase === "syncing" || phase === "waiting"
                ? "bg-blue-500/80 text-white cursor-not-allowed opacity-70"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            {phase === "syncing" || phase === "waiting" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {phase === "waiting"
              ? "Another sync is processing…"
              : phase === "syncing"
                ? "Sync in progress…"
                : "Sync to Google Sheets"}
          </button>

          {phase === "done" && result && !modalOpen && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors relative"
            >
              <Clock size={12} />
              Change History
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500" />
            </button>
          )}
        </div>

        {notice && (
          <div
            className={cn(
              "inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              notice.tone === "amber" &&
                "border-amber-200 bg-amber-50 text-amber-800",
              notice.tone === "green" &&
                "border-green-200 bg-green-50 text-green-800",
              notice.tone === "slate" &&
                "border-slate-200 bg-slate-50 text-slate-700",
            )}
          >
            <AlertTriangle size={12} className={cn(notice.tone !== "amber" && "hidden")} />
            <span>{notice.message}</span>
          </div>
        )}

        {result && lastSyncLabel && !notice && (
          <p className="text-[11px] text-muted-foreground">
            Last completed sync: <span className="font-medium text-foreground">{lastSyncLabel}</span>
            {result.triggeredBy ? (
              <>
                {" "}by <span className="font-medium text-foreground">{result.triggeredBy}</span>
              </>
            ) : null}
          </p>
        )}
      </div>

      {modalOpen && (phase === "syncing" || phase === "waiting") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-120 rounded-xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-sm font-semibold">{phase === "waiting" ? "Another sync is processing…" : "Sync in progress…"}</h2>
            </div>
            <LoadingOverlay stepIndex={stepIndex} />
            {phase === "waiting" && (
              <div className="px-5 pb-5 text-center text-xs text-muted-foreground">
                We&apos;re checking again automatically every few seconds so reps do not need to keep clicking the sync button.
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && phase === "done" && result && (
        <ChangeHistoryModal
          result={result}
          onClose={() => setModalOpen(false)}
        />
      )}

      {mounted && toast &&
        createPortal(
          <SyncErrorToast toast={toast} onClose={dismissToast} />,
          document.body,
        )}
    </>
  );
}
