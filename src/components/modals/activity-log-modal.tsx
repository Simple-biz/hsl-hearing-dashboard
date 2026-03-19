"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchActivityLog } from "@/app/(dashboard)/actions";
import type { ActivityLogEntry } from "@/app/(dashboard)/actions";

const CATEGORIES = [
  { key: "all", label: "📋 All" },
  { key: "assignments", label: "👤 Assignments" },
  { key: "emails", label: "📧 Emails" },
  { key: "fields", label: "✏️ Field Updates" },
  { key: "hearings", label: "📅 Hearings" },
  { key: "schedule", label: "🗓️ Schedule" },
  { key: "reps", label: "👥 Reps" },
];

const ACTION_COLORS: Record<string, string> = {
  // Auth
  user_login: "bg-green-100 text-green-700 dark:bg-green-900/30",
  user_logout: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30",
  // Assignments
  rep_assigned: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30",
  rep_unassigned: "bg-amber-100 text-amber-700 dark:bg-amber-900/30",
  rep_auto_assigned: "bg-purple-100 text-purple-700 dark:bg-purple-900/30",
  batch_auto_assign: "bg-purple-100 text-purple-700 dark:bg-purple-900/30",
  bulk_unassign: "bg-amber-100 text-amber-700 dark:bg-amber-900/30",
  status_assigned: "bg-teal-100 text-teal-700 dark:bg-teal-900/30",
  // Emails
  email_sent: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30",
  email_failed: "bg-red-100 text-red-700 dark:bg-red-900/30",
  bulk_email: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30",
  // Field updates
  field_updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
  post_hrg_note_added: "bg-sky-100 text-sky-700 dark:bg-sky-900/30",
  post_hrg_deadline_updated: "bg-sky-100 text-sky-700 dark:bg-sky-900/30",
  post_hrg_note_deleted: "bg-orange-100 text-orange-700 dark:bg-orange-900/30",
  // Hearings
  hearing_updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
  hearing_created: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30",
  hearing_deleted: "bg-red-100 text-red-700 dark:bg-red-900/30",
  hearing_imported: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30",
  bulk_delete: "bg-red-100 text-red-700 dark:bg-red-900/30",
  bulk_migrate: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30",
  // Schedule
  schedule_updated: "bg-sky-100 text-sky-700 dark:bg-sky-900/30",
  schedule_lock_override: "bg-amber-100 text-amber-700 dark:bg-amber-900/30",
  // Reps
  rep_created: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30",
  rep_updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
  rep_deleted: "bg-red-100 text-red-700 dark:bg-red-900/30",
  token_revoked: "bg-orange-100 text-orange-700 dark:bg-orange-900/30",
};

export function ActivityLogModal({
  onClose,
  excludeSystemAdmin = true,
}: {
  onClose: () => void;
  excludeSystemAdmin?: boolean;
}) {
  const [category, setCategory] = useState("all");
  const [dateRange, setDateRange] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [fetchId, setFetchId] = useState(1); // increments on every fetch, used to derive "loading"
  const [lastFetchId, setLastFetchId] = useState(0); // set in .then callback when data arrives
  const pageSize = 25;

  const loading = fetchId !== lastFetchId;

  useEffect(() => {
    let cancelled = false;
    const currentFetchId = fetchId;
    fetchActivityLog({
      page,
      pageSize,
      category,
      dateRange: dateRange || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      userId: userId || undefined,
      excludeSystemAdmin,
    }).then((res) => {
      if (!cancelled) {
        setEntries(res.entries);
        setTotal(res.total);
        setUsers(res.users);
        setLastFetchId(currentFetchId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger fetches by bumping fetchId (from event handlers, not effects)
  const changeCategory = (cat: string) => {
    setCategory(cat);
    setPage(1);
    setFetchId((n) => n + 1);
  };
  const changeDateRange = (dr: string) => {
    setDateRange(dr);
    setPage(1);
    setFetchId((n) => n + 1);
  };
  const changeUserId = (uid: string) => {
    setUserId(uid);
    setPage(1);
    setFetchId((n) => n + 1);
  };
  const changePage = (p: number) => {
    setPage(p);
    setFetchId((n) => n + 1);
  };
  const changeDateFrom = (v: string) => {
    setDateFrom(v);
    setPage(1);
    setFetchId((n) => n + 1);
  };
  const changeDateTo = (v: string) => {
    setDateTo(v);
    setPage(1);
    setFetchId((n) => n + 1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-187.5 max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">📋 Dashboard Activity Log</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Category tabs */}
          <div className="flex items-center gap-1 border-b px-5 py-2 overflow-x-auto shrink-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => changeCategory(cat.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  category === cat.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5 shrink-0">
            <select
              className="h-8 rounded border bg-card px-2 text-xs"
              value={dateRange}
              onChange={(e) => changeDateRange(e.target.value)}
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range...</option>
            </select>
            {dateRange === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => changeDateFrom(e.target.value)}
                  className="h-8 w-31.25 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => changeDateTo(e.target.value)}
                  className="h-8 w-31.25 text-xs"
                />
              </div>
            )}
            <select
              className="h-8 rounded border bg-card px-2 text-xs"
              value={userId}
              onChange={(e) => changeUserId(e.target.value)}
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {total.toLocaleString()} entries
            </span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {loading && entries === null ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries !== null && entries.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No activity entries found.
              </div>
            ) : entries !== null ? (
              <div
                className={cn(
                  "space-y-1",
                  loading && "opacity-50 pointer-events-none",
                )}
              >
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/30"
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        ACTION_COLORS[entry.action] ||
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {entry.action.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed">
                        {entry.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>
                          {new Date(entry.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {entry.user_name && (
                          <span>
                            by{" "}
                            <span className="font-medium text-foreground">
                              {entry.user_name}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-5 py-2.5 shrink-0">
            <span className="text-xs text-muted-foreground">
              {total.toLocaleString()} entries
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1 || loading}
                onClick={() => changePage(1)}
                title="First page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <ChevronLeft className="h-3.5 w-3.5 -ml-2" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1 || loading}
                onClick={() => changePage(page - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <select
                className="h-7 rounded-md border border-input bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                value={String(page)}
                onChange={(e) => changePage(Number(e.target.value))}
                disabled={loading}
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages || loading}
                onClick={() => changePage(page + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages || loading}
                onClick={() => changePage(totalPages)}
                title="Last page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
                <ChevronRight className="h-3.5 w-3.5 -ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
