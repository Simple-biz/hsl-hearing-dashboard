"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Search, Loader2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColor, getInitials } from "@/lib/activity-avatar";
import {
  fetchPostHrgActivityLog,
  type PostHrgActivityLog,
  type PostHrgActivityCategory,
} from "@/app/(dashboard)/post-hrg-development/actions";

const CATEGORY_TABS: {
  key: PostHrgActivityCategory;
  label: string;
  activeCls: string;
  chipActive: string;
}[] = [
  {
    key: "all",
    label: "All",
    activeCls: "border-primary text-foreground bg-primary/5",
    chipActive: "bg-primary/15 text-primary",
  },
  {
    key: "created",
    label: "Created",
    activeCls:
      "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
    chipActive:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    key: "updated",
    label: "Updated",
    activeCls:
      "border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-500/5",
    chipActive:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    key: "notes",
    label: "Notes",
    activeCls:
      "border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-500/5",
    chipActive:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  {
    key: "acknowledged",
    label: "✓ Acknowledged",
    activeCls:
      "border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-500/5",
    chipActive:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    key: "imported",
    label: "Imported",
    activeCls:
      "border-violet-500 text-violet-700 dark:text-violet-300 bg-violet-500/5",
    chipActive:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  {
    key: "deleted",
    label: "Deleted",
    activeCls: "border-red-500 text-red-700 dark:text-red-300 bg-red-500/5",
    chipActive:
      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
];

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  post_hrg_dev_created: {
    label: "Created",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  post_hrg_dev_updated: {
    label: "Updated",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  post_hrg_dev_field_updated: {
    label: "Field Edit",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  },
  post_hrg_dev_deleted: {
    label: "Deleted",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  post_hrg_dev_import: {
    label: "Imported",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  },
  post_hrg_dev_note_added: {
    label: "Note Added",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  post_hrg_dev_note_deleted: {
    label: "Note Deleted",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  post_hrg_dev_auto_created: {
    label: "Auto-Created",
    cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
  post_hrg_dev_acknowledged: {
    label: "Acknowledged",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  post_hrg_dev_phstatus_synced: {
    label: "PH Status Synced",
    cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  post_hrg_dev_cascade: {
    label: "Cascaded",
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
};

function formatDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
}

// Compute date ranges for backward-looking presets (activity log only).
function rangeFromPreset(preset: string): {
  from: string;
  to: string;
} {
  if (!preset || preset === "custom") return { from: "", to: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === "today") return { from: iso(today), to: iso(today) };
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: iso(y), to: iso(y) };
  }
  if (preset === "this-week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "last-7") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "this-month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "last-30") {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { from: iso(start), to: iso(today) };
  }
  return { from: "", to: "" };
}

export function PostHrgActivityModal({ open, onClose }: Props) {
  const [logs, setLogs] = useState<PostHrgActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PostHrgActivityCategory>("all");
  const [datePreset, setDatePreset] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (
      s: string,
      p: number,
      c: PostHrgActivityCategory,
      from: string,
      to: string,
    ) => {
      setLoading(true);
      try {
        const res = await fetchPostHrgActivityLog({
          search: s,
          page: p,
          pageSize: PAGE_SIZE,
          category: c,
          fromDate: from || null,
          toDate: to || null,
        });
        setLogs(res.logs);
        setTotal(res.total);
      } catch {
        /* ignore */
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setSearch("");
      setCategory("all");
      setDatePreset("");
      setFromDate("");
      setToDate("");
      setPage(1);
      load("", 1, "all", "", "");
    }, 0);
    return () => clearTimeout(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => load(val, 1, category, fromDate, toDate),
      300,
    );
  };

  const handleCategoryChange = (c: PostHrgActivityCategory) => {
    setCategory(c);
    setPage(1);
    load(search, 1, c, fromDate, toDate);
  };

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    setPage(1);
    if (preset === "custom") {
      // Keep current from/to (likely empty); user fills in the inputs.
      return;
    }
    if (!preset) {
      setFromDate("");
      setToDate("");
      load(search, 1, category, "", "");
      return;
    }
    const r = rangeFromPreset(preset);
    setFromDate(r.from);
    setToDate(r.to);
    load(search, 1, category, r.from, r.to);
  };

  const handleFromDate = (val: string) => {
    setFromDate(val);
    setPage(1);
    load(search, 1, category, val, toDate);
  };

  const handleToDate = (val: string) => {
    setToDate(val);
    setPage(1);
    load(search, 1, category, fromDate, val);
  };

  const handleClearDates = () => {
    setDatePreset("");
    setFromDate("");
    setToDate("");
    setPage(1);
    load(search, 1, category, "", "");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Activity Log</h2>
              <p className="text-[11px] text-muted-foreground">
                Post Hearing Development · {total.toLocaleString()} entries
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + Date filters */}
        <div className="px-6 py-3 border-b shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by description or user..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border bg-muted/40 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <select
              value={datePreset}
              onChange={(e) => handleDatePreset(e.target.value)}
              className="h-8 rounded-md border bg-muted/40 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring min-w-32"
            >
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this-week">This Week</option>
              <option value="last-7">Last 7 Days</option>
              <option value="this-month">This Month</option>
              <option value="last-30">Last 30 Days</option>
              <option value="custom">Custom Range...</option>
            </select>
            {datePreset === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => handleFromDate(e.target.value)}
                  max={toDate || undefined}
                  className="h-8 w-31.25 rounded-md border bg-muted/40 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => handleToDate(e.target.value)}
                  min={fromDate || undefined}
                  className="h-8 w-31.25 rounded-md border bg-muted/40 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
              </div>
            )}
            {(datePreset || fromDate || toDate) && (
              <button
                type="button"
                onClick={handleClearDates}
                className="h-8 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Action-category tabs */}
        <div className="border-b shrink-0 px-3 overflow-x-auto">
          <div className="flex items-center gap-1">
            {CATEGORY_TABS.map((t) => {
              const active = category === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleCategoryChange(t.key)}
                  className={cn(
                    "group relative px-3 py-2 text-xs font-medium border-b-2 -mb-px rounded-t-md transition-all duration-200 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? cn("shadow-sm", t.activeCls)
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-muted-foreground/30",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No activity found.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {logs.map((log) => {
                const actionMeta = ACTION_LABELS[log.action] ?? {
                  label: log.action,
                  cls: "bg-muted text-muted-foreground",
                };
                const author = log.userName || "System";
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5",
                        avatarColor(author),
                      )}
                    >
                      {getInitials(author)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold text-foreground">
                          {author}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                            actionMeta.cls,
                          )}
                        >
                          {actionMeta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {log.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        <div className="shrink-0 border-t bg-muted/20 px-6 py-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((p) => p - 1);
                load(search, page - 1, category, fromDate, toDate);
              }}
              className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 hover:bg-muted transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted-foreground tabular-nums px-1">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((p) => p + 1);
                load(search, page + 1, category, fromDate, toDate);
              }}
              className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 hover:bg-muted transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
