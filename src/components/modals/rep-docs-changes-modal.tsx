"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X as XIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchRepDocsChanges,
  acknowledgeRepDocsChange,
  type RepDocsChange,
} from "@/app/(dashboard)/representative-docs/actions";

const REP_CHANGE_ACTIONS = new Set([
  "rep_assigned",
  "rep_unassigned",
  "rep_auto_assigned",
]);

type Tab = "all" | "status" | "field" | "rep" | "assigned_to";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All Changes" },
  { key: "status", label: "Status / Decision" },
  { key: "field", label: "Field Updates" },
  { key: "rep", label: "Rep Changes" },
  { key: "assigned_to", label: "Assigned To" },
];

const DATE_PRESETS = [
  { value: "", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range..." },
];

const ACTION_STYLES: Record<string, string> = {
  rep_docs_field_updated:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  rep_docs_imported:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  field_updated:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  hearing_link_updated_from_repdocs:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  rep_assigned:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rep_unassigned:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  rep_auto_assigned:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const ACTION_LABELS: Record<string, string> = {
  rep_docs_field_updated: "Rep Docs",
  rep_docs_imported: "Import",
  field_updated: "Decision",
  hearing_link_updated_from_repdocs: "Link",
  rep_assigned: "Assigned",
  rep_unassigned: "Unassigned",
  rep_auto_assigned: "Auto-Assigned",
};

export function RepDocsChangesModal({
  onClose,
  onRefreshPage,
  lastSeenAt,
  onMarkSeen,
  assigneeNames,
}: {
  onClose: () => void;
  onRefreshPage: () => void;
  lastSeenAt: string | null;
  onMarkSeen: (ts: string) => void;
  /** List of assignee names for the "Assignee" filter dropdown. */
  assigneeNames: string[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [datePreset, setDatePreset] = useState("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [changes, setChanges] = useState<RepDocsChange[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 25;

  const buildDateRange = useCallback(
    (preset: string, from: string, to: string) => {
      if (preset === "custom")
        return { dateFrom: from || undefined, dateTo: to || undefined };
      if (!preset) return {};

      const today = new Date();
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      switch (preset) {
        case "today": {
          const t = fmt(today);
          return { dateFrom: t, dateTo: t };
        }
        case "yesterday": {
          const y = new Date(today);
          y.setDate(y.getDate() - 1);
          const t = fmt(y);
          return { dateFrom: t, dateTo: t };
        }
        case "this_week": {
          const mon = new Date(today);
          mon.setDate(mon.getDate() - mon.getDay() + 1);
          return { dateFrom: fmt(mon), dateTo: fmt(today) };
        }
        case "last_7_days": {
          const start = new Date(today);
          start.setDate(start.getDate() - 7);
          return { dateFrom: fmt(start), dateTo: fmt(today) };
        }
        case "this_month": {
          return {
            dateFrom: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
            dateTo: fmt(today),
          };
        }
        default:
          return {};
      }
    },
    [],
  );

  const load = useCallback(
    async (
      t: Tab,
      s: string,
      p: number,
      preset: string,
      from: string,
      to: string,
      assignee: string,
    ) => {
      setLoading(true);
      try {
        const dateRange = buildDateRange(preset, from, to);
        const res = await fetchRepDocsChanges({
          category: t === "all" ? "all" : t,
          search: s || undefined,
          assignedTo: assignee || undefined,
          page: p,
          pageSize,
          ...dateRange,
        });
        setChanges(res.changes);
        setTotal(res.total);
        if (res.latestAt) onMarkSeen(res.latestAt);
      } catch {
        setChanges([]);
        setTotal(0);
      }
      setLoading(false);
    },
    [onMarkSeen, buildDateRange],
  );

  useEffect(() => {
    const init = async () => {
      await load(tab, search, page, datePreset, dateFrom, dateTo, assigneeFilter);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeTab = (t: Tab) => {
    setTab(t);
    setPage(1);
    load(t, search, 1, datePreset, dateFrom, dateTo, assigneeFilter);
  };

  const changeSearch = (s: string) => {
    setSearch(s);
    setPage(1);
    load(tab, s, 1, datePreset, dateFrom, dateTo, assigneeFilter);
  };

  const changePage = (p: number) => {
    setPage(p);
    load(tab, search, p, datePreset, dateFrom, dateTo, assigneeFilter);
  };

  const changePreset = (preset: string) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
    setPage(1);
    load(tab, search, 1, preset, "", "", assigneeFilter);
  };

  const changeAssignee = (name: string) => {
    setAssigneeFilter(name);
    setPage(1);
    load(tab, search, 1, datePreset, dateFrom, dateTo, name);
  };

  const toggleAck = async (activityId: number, next: boolean) => {
    // Optimistic update
    setChanges((prev) =>
      prev
        ? prev.map((c) =>
            c.id === activityId ? { ...c, acknowledged: next } : c,
          )
        : prev,
    );
    try {
      const res = await acknowledgeRepDocsChange(activityId, next);
      if (!res?.success) throw new Error("acknowledgeRepDocsChange returned success=false");
    } catch (err) {
      console.error("[RepDocsChanges] toggleAck failed:", err);
      // Revert on failure
      setChanges((prev) =>
        prev
          ? prev.map((c) =>
              c.id === activityId ? { ...c, acknowledged: !next } : c,
            )
          : prev,
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const isNew = (createdAt: string) =>
    lastSeenAt ? new Date(createdAt) > new Date(lastSeenAt) : true;

  const SEL =
    "h-8 rounded-md border border-input bg-card px-2 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Rep Docs Changes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total.toLocaleString()} change{total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                onRefreshPage();
                onClose();
              }}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh Page
            </Button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b px-5 py-2 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5 shrink-0">
          <Input
            placeholder="Search changes..."
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            className="h-8 text-xs flex-1 min-w-32"
          />
          <select
            className={SEL + " min-w-36"}
            value={assigneeFilter}
            onChange={(e) => changeAssignee(e.target.value)}
            title="Filter changes by assignee name (matches anywhere in the description)"
          >
            <option value="">All Assignees</option>
            {assigneeNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            className={SEL + " min-w-32"}
            value={datePreset}
            onChange={(e) => changePreset(e.target.value)}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                  load(tab, search, 1, "custom", e.target.value, dateTo, assigneeFilter);
                }}
                className="h-8 w-30 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                  load(tab, search, 1, "custom", dateFrom, e.target.value, assigneeFilter);
                }}
                className="h-8 w-30 text-xs"
              />
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading && changes === null ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : changes !== null && changes.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No changes found.
            </div>
          ) : changes !== null ? (
            <div
              className={cn(
                "space-y-1",
                loading && "opacity-50 pointer-events-none",
              )}
            >
              {changes.map((c) => {
                const isRepChange = REP_CHANGE_ACTIONS.has(c.action);
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/30",
                      isNew(c.createdAt) &&
                        !c.acknowledged &&
                        "bg-blue-50/50 dark:bg-blue-950/20 border-l-2 border-l-blue-400",
                      c.acknowledged && "opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        ACTION_STYLES[c.action] ||
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {ACTION_LABELS[c.action] || c.action.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed">{c.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{fmtTime(c.createdAt)}</span>
                        {c.userName && (
                          <span>
                            by{" "}
                            <span className="font-medium text-foreground">
                              {c.userName}
                            </span>
                          </span>
                        )}
                        {isNew(c.createdAt) && !c.acknowledged && (
                          <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                    {isRepChange && (
                      <label
                        className="shrink-0 flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground select-none pt-0.5"
                        title="Acknowledge — mark this change as seen"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                          checked={c.acknowledged}
                          onChange={(e) => toggleAck(c.id, e.target.checked)}
                        />
                        <span>{c.acknowledged ? "Seen" : "Ack"}</span>
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
            {total.toLocaleString()} change{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1.5">
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
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
