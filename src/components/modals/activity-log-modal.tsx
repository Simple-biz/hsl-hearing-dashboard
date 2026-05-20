"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchActivityLog } from "@/app/(dashboard)/actions";
import type { ActivityLogEntry } from "@/app/(dashboard)/actions";
import {
  acknowledgeRepDocsChange,
  fetchRepDocsAckLog,
} from "@/app/(dashboard)/representative-docs/actions";
import type { RepDocsAckEvent } from "@/app/(dashboard)/representative-docs/actions";

const REP_DOCS_ACK_ACTIONS = new Set([
  "rep_assigned",
  "rep_unassigned",
  "rep_auto_assigned",
]);

const CATEGORIES = [
  { key: "assignments", label: "👤 Assignments" },
  { key: "emails", label: "📧 Emails" },
  { key: "fields", label: "✏️ Field Updates" },
  { key: "hearings", label: "📅 Hearings" },
  { key: "schedule", label: "🗓️ Schedule" },
  { key: "reps", label: "👥 Reps" },
  { key: "acknowledged", label: "✓ Acknowledged" },
  { key: "archived", label: "📦 Archived" },
  { key: "all", label: "📋 All" },
];

// Friendly display labels for action keys. Falls back to a title-cased
// version of the raw action when not listed (e.g. "schedule_updated" →
// "Schedule Updated"). Matches the PHD activity modal's visual treatment.
const ACTION_LABELS: Record<string, string> = {
  user_login: "Login",
  user_logout: "Logout",
  rep_assigned: "Rep Assigned",
  rep_unassigned: "Rep Unassigned",
  rep_auto_assigned: "Auto-Assigned",
  batch_auto_assign: "Batch Auto-Assign",
  bulk_unassign: "Bulk Unassign",
  status_assigned: "Assignment Status",
  email_sent: "Email Sent",
  email_failed: "Email Failed",
  bulk_email: "Bulk Email",
  field_updated: "Field Edit",
  rep_docs_field_updated: "Field Edit",
  post_hrg_dev_field_updated: "Field Edit",
  post_hrg_note_added: "Note Added",
  post_hrg_note_deleted: "Note Deleted",
  post_hrg_deadline_updated: "Deadline Updated",
  post_hrg_dev_created: "Created",
  post_hrg_dev_auto_created: "Auto-Created",
  post_hrg_dev_acknowledged: "Acknowledged",
  post_hrg_dev_deleted: "Deleted",
  post_hrg_dev_import: "Imported",
  post_hrg_dev_phstatus_synced: "PH Status Synced",
  post_hrg_dev_status_synced: "Dev Status Synced",
  hearing_updated: "Hearing Updated",
  hearing_created: "Hearing Created",
  hearing_deleted: "Hearing Deleted",
  hearing_imported: "Hearing Imported",
  bulk_delete: "Bulk Delete",
  bulk_migrate: "Bulk Migrate",
  schedule_updated: "Schedule Updated",
  schedule_lock_override: "Schedule Lock Override",
  rep_created: "Rep Created",
  rep_updated: "Rep Updated",
  rep_deleted: "Rep Deleted",
  token_revoked: "Token Revoked",
  api_key_created: "API Key Created",
  api_key_revoked: "API Key Revoked",
  archive_chronicles: "Archive Chronicles",
  unarchive_chronicles: "Unarchive Chronicles",
  hearing_archived: "Hearing Archived",
  hearing_unarchived: "Hearing Unarchived",
  rep_docs_acknowledged: "Acknowledged",
};

function labelForAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback — turn "snake_case_action" into "Snake Case Action"
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Deterministic avatar color from a name string. Same hash function as
// post-hrg-activity-modal.tsx so a user's avatar is the same color across
// every page that renders their activity entries.
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

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
  // Post HRG Development lifecycle
  post_hrg_dev_created: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30",
  post_hrg_dev_auto_created:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30",
  post_hrg_dev_acknowledged:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
  post_hrg_dev_deleted: "bg-red-100 text-red-700 dark:bg-red-900/30",
  post_hrg_dev_import: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30",
  post_hrg_dev_phstatus_synced:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30",
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
  // Archived
  archive_chronicles: "bg-violet-100 text-violet-700 dark:bg-violet-900/30",
  unarchive_chronicles:
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30",
  hearing_archived: "bg-amber-100 text-amber-700 dark:bg-amber-900/30",
  hearing_unarchived: "bg-teal-100 text-teal-700 dark:bg-teal-900/30",
};

export interface ActivityLogTab {
  key: string;
  label: string;
  actions: string[]; // actions scoped to this tab; empty = use scopedActions/CATEGORIES default
  /**
   * When "ack_events", the tab shows WHO acknowledged WHAT (sourced from
   * rep_docs_change_ack), instead of the raw activity_log list. `actions` is
   * ignored in this mode.
   */
  mode?: "activities" | "ack_events";
}

export function ActivityLogModal({
  onClose,
  excludeSystemAdmin = true,
  scopedActions,
  title,
  tabs,
  ackScope,
}: {
  onClose: () => void;
  excludeSystemAdmin?: boolean;
  scopedActions?: string[];
  title?: string;
  tabs?: ActivityLogTab[];
  ackScope?: "rep_docs";
}) {
  const hasCustomTabs = Array.isArray(tabs) && tabs.length > 0;
  const isScoped =
    hasCustomTabs ||
    (Array.isArray(scopedActions) && scopedActions.length > 0);
  const [category, setCategory] = useState<string>(
    hasCustomTabs
      ? tabs![0].key
      : Array.isArray(scopedActions) && scopedActions.length > 0
        ? "all"
        : "assignments",
  );
  const [dateRange, setDateRange] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  const [ackEvents, setAckEvents] = useState<RepDocsAckEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [fetchId, setFetchId] = useState(1); // increments on every fetch, used to derive "loading"
  const [lastFetchId, setLastFetchId] = useState(0); // set in .then callback when data arrives
  const pageSize = 25;

  const loading = fetchId !== lastFetchId;

  const activeTab = hasCustomTabs
    ? tabs!.find((t) => t.key === category)
    : undefined;
  const isAckEventsMode = activeTab?.mode === "ack_events";

  useEffect(() => {
    let cancelled = false;
    const currentFetchId = fetchId;

    if (isAckEventsMode) {
      fetchRepDocsAckLog({
        page,
        pageSize,
        dateRange: dateRange || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        userId: userId || undefined,
      }).then((res) => {
        if (!cancelled) {
          setAckEvents(res.events);
          setEntries(null);
          setTotal(res.total);
          setUsers(res.users);
          setLastFetchId(currentFetchId);
        }
      });
    } else {
      const effectiveScopedActions = hasCustomTabs
        ? activeTab?.actions ?? scopedActions
        : isScoped
          ? scopedActions
          : undefined;
      fetchActivityLog({
        page,
        pageSize,
        category: hasCustomTabs ? "all" : category,
        dateRange: dateRange || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        userId: userId || undefined,
        excludeSystemAdmin,
        scopedActions: effectiveScopedActions,
        ackScope,
      }).then((res) => {
        if (!cancelled) {
          setEntries(res.entries);
          setAckEvents(null);
          setTotal(res.total);
          setUsers(res.users);
          setLastFetchId(currentFetchId);
        }
      });
    }
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

  // Decide whether an entry shows an acknowledge checkbox
  const canAck = (action: string) =>
    ackScope === "rep_docs" && REP_DOCS_ACK_ACTIONS.has(action);

  const toggleAck = async (id: number, next: boolean) => {
    // Optimistic update
    setEntries((prev) =>
      prev
        ? prev.map((e) => (e.id === id ? { ...e, acknowledged: next } : e))
        : prev,
    );
    try {
      if (ackScope === "rep_docs") {
        const res = await acknowledgeRepDocsChange(id, next);
        if (!res?.success) throw new Error("acknowledgeRepDocsChange returned success=false");
      }
    } catch (err) {
      console.error("[ActivityLog] toggleAck failed:", err);
      setEntries((prev) =>
        prev
          ? prev.map((e) =>
              e.id === id ? { ...e, acknowledged: !next } : e,
            )
          : prev,
      );
    }
  };

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
          <h2 className="text-sm font-semibold">
            {title ?? "📋 Dashboard Activity Log"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Tabs — custom tabs override default CATEGORIES; hidden when neither */}
          {hasCustomTabs ? (
            <div className="flex items-center gap-1 border-b px-5 py-2 overflow-x-auto shrink-0">
              {tabs!.map((t) => (
                <button
                  key={t.key}
                  onClick={() => changeCategory(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    category === t.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : !isScoped ? (
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
          ) : null}

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
            {isAckEventsMode ? (
              loading && ackEvents === null ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : ackEvents !== null && ackEvents.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No acknowledgements yet.
                </div>
              ) : ackEvents !== null ? (
                <div
                  className={cn(
                    "space-y-1",
                    loading && "opacity-50 pointer-events-none",
                  )}
                >
                  {ackEvents.map((ev) => {
                    const author = ev.ackUserName ?? "Unknown user";
                    return (
                      <div
                        key={`${ev.ackUserId}-${ev.id}`}
                        className="flex items-start gap-3 px-2 py-3 hover:bg-muted/30"
                      >
                        {/* Avatar — circle with the acknowledging user's initials. */}
                        <div
                          className={cn(
                            "h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5",
                            avatarColor(author),
                          )}
                        >
                          {getInitials(author)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-xs font-semibold text-foreground">
                              {author}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                              )}
                            >
                              Acknowledged
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                              {new Date(ev.acknowledgedAt).toLocaleString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {ev.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null
            ) : loading && entries === null ? (
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
                {entries.map((entry) => {
                  const showAck = canAck(entry.action);
                  const author = entry.user_name || "System";
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-start gap-3 px-2 py-3 hover:bg-muted/30",
                        showAck && entry.acknowledged && "opacity-60",
                      )}
                    >
                      {/* Avatar — colored circle with author's initials. */}
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
                              ACTION_COLORS[entry.action] ||
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {labelForAction(entry.action)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                            {new Date(entry.created_at).toLocaleString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {entry.description}
                        </p>
                      </div>

                      {showAck && (
                        <label
                          className="shrink-0 flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground select-none pt-0.5"
                          title="Acknowledge — mark this change as seen"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                            checked={Boolean(entry.acknowledged)}
                            onChange={(e) =>
                              toggleAck(entry.id, e.target.checked)
                            }
                          />
                          <span>{entry.acknowledged ? "Seen" : "Ack"}</span>
                        </label>
                      )}
                    </div>
                  );
                })}
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
