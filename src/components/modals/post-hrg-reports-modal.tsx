"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  X,
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  Clock,
  AlertTriangle,
  Download,
  RefreshCw,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PostHrgDevRow,
  PostHrgRecordType,
} from "@/app/(dashboard)/post-hrg-development/actions";
import { fetchPostHrgDevPage } from "@/app/(dashboard)/post-hrg-development/actions";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReportData {
  // Summary
  totalRecords: number;
  byStatus: Record<string, number>;
  byPhStatus: Record<string, number>;
  byRecordType: Record<string, number>;
  byResponsible: Record<string, number>;
  byRep: Record<string, number>;
  byDocsNeeded: Record<string, number>;
  byIndicator: Record<string, number>;

  // Timeliness
  overdueCount: number;
  dueSoonCount: number; // deadline within 7 days
  completedThisMonth: number;
  avgDaysToDeadline: number | null;

  // Checkboxes
  emSentCount: number;
  extLetterCount: number;
  bothCheckedCount: number;
  neitherCheckedCount: number;

  // Acknowledgement
  unacknowledgedCount: number;
  acknowledgedCount: number;

  // Trend: records by hearing month
  byHearingMonth: Record<string, number>;

  // Raw rows (for the detail table)
  overdueRows: PostHrgDevRow[];
  unacknowledgedRows: PostHrgDevRow[];
}

type ReportTab =
  | "summary"
  | "timeliness"
  | "people"
  | "detail"
  | "completed_by_day";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

function computeReport(rows: PostHrgDevRow[]): ReportData {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(today.getDate() + 7);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const data: ReportData = {
    totalRecords: rows.length,
    byStatus: {},
    byPhStatus: {},
    byRecordType: {},
    byResponsible: {},
    byRep: {},
    byDocsNeeded: {},
    byIndicator: {},
    overdueCount: 0,
    dueSoonCount: 0,
    completedThisMonth: 0,
    avgDaysToDeadline: null,
    emSentCount: 0,
    extLetterCount: 0,
    bothCheckedCount: 0,
    neitherCheckedCount: 0,
    unacknowledgedCount: 0,
    acknowledgedCount: 0,
    byHearingMonth: {},
    overdueRows: [],
    unacknowledgedRows: [],
  };

  let totalDeadlineDays = 0;
  let deadlineCount = 0;

  for (const r of rows) {
    // By Status
    const status = r.status || "No Status";
    data.byStatus[status] = (data.byStatus[status] || 0) + 1;

    // By PH Status
    const phStatus = r.post_hearing_status || "No PH Status";
    data.byPhStatus[phStatus] = (data.byPhStatus[phStatus] || 0) + 1;

    // By Record Type
    const rt = r.record_type || "Unknown";
    data.byRecordType[rt] = (data.byRecordType[rt] || 0) + 1;

    // By Responsible
    const resp = r.person_responsible || "Unassigned";
    data.byResponsible[resp] = (data.byResponsible[resp] || 0) + 1;

    // By Rep
    const rep = r.representative_name || r.assigned_rep || "No Rep";
    data.byRep[rep] = (data.byRep[rep] || 0) + 1;

    // By Docs Needed
    const docs = r.type_of_docs_needed || "Not Specified";
    data.byDocsNeeded[docs] = (data.byDocsNeeded[docs] || 0) + 1;

    // By Indicator
    const ind = r.indicator || "none";
    data.byIndicator[ind] = (data.byIndicator[ind] || 0) + 1;

    // Overdue
    if (
      r.deadline &&
      r.status?.toLowerCase() !== "completed" &&
      r.status?.toLowerCase() !== "cancelled"
    ) {
      const dl = new Date(r.deadline + "T12:00:00");
      if (dl < today) {
        data.overdueCount++;
        data.overdueRows.push(r);
      } else if (dl <= sevenDaysOut) {
        data.dueSoonCount++;
      }
      // Avg days to deadline (non-overdue, non-completed)
      if (dl >= today) {
        totalDeadlineDays += Math.round(
          (dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        deadlineCount++;
      }
    }

    // Completed this month
    if (
      r.status?.toLowerCase() === "completed" &&
      r.updated_at &&
      new Date(r.updated_at) >= startOfMonth
    ) {
      data.completedThisMonth++;
    }

    // Checkboxes
    if (r.em_sent_task_created) data.emSentCount++;
    if (r.ext_letter_sent) data.extLetterCount++;
    if (r.em_sent_task_created && r.ext_letter_sent) data.bothCheckedCount++;
    if (!r.em_sent_task_created && !r.ext_letter_sent)
      data.neitherCheckedCount++;

    // Acknowledgement
    if (!r.acknowledged_at) {
      data.unacknowledgedCount++;
      data.unacknowledgedRows.push(r);
    } else {
      data.acknowledgedCount++;
    }

    // By Hearing Month
    if (r.hearing_date) {
      try {
        const d = new Date(r.hearing_date + "T12:00:00");
        const key = d.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
        data.byHearingMonth[key] = (data.byHearingMonth[key] || 0) + 1;
      } catch {
        /* */
      }
    }
  }

  if (deadlineCount > 0) {
    data.avgDaysToDeadline = Math.round(totalDeadlineDays / deadlineCount);
  }

  return data;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> =
  {
    Pending: {
      bg: "bg-amber-100 dark:bg-amber-900/30",
      text: "text-amber-800 dark:text-amber-300",
      bar: "bg-amber-400",
    },
    "In Progress": {
      bg: "bg-blue-100 dark:bg-blue-900/30",
      text: "text-blue-800 dark:text-blue-300",
      bar: "bg-blue-500",
    },
    Completed: {
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      text: "text-emerald-800 dark:text-emerald-300",
      bar: "bg-emerald-500",
    },
    "On Hold": {
      bg: "bg-gray-100 dark:bg-gray-900/30",
      text: "text-gray-700 dark:text-gray-300",
      bar: "bg-gray-400",
    },
    Cancelled: {
      bg: "bg-red-100 dark:bg-red-900/30",
      text: "text-red-800 dark:text-red-300",
      bar: "bg-red-400",
    },
    "No Status": {
      bg: "bg-muted",
      text: "text-muted-foreground",
      bar: "bg-muted-foreground/40",
    },
  };

const RT_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  POST_HRG: {
    bg: "bg-violet-100 dark:bg-violet-900/30",
    text: "text-violet-800 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  MR: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  REP: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-800 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
};

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3 flex items-start gap-3 shadow-sm",
        accent,
      )}
    >
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">
          {label}
        </p>
        <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
        {sub && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  barCls,
  badgeCls,
}: {
  label: string;
  count: number;
  total: number;
  barCls?: string;
  badgeCls?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span
        className="shrink-0 text-[11px] text-right text-foreground/80 truncate"
        style={{ width: 140, minWidth: 140 }}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            barCls || "bg-primary/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 tabular-nums",
          badgeCls || "bg-muted text-muted-foreground",
        )}
      >
        {count} ({pct}%)
      </span>
    </div>
  );
}

function SectionHeader({
  title,
  icon,
  count,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {count !== undefined && (
        <span className="ml-auto text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5 tabular-nums">
          {count} entries
        </span>
      )}
    </div>
  );
}

function CollapsibleTable({
  title,
  rows,
  emptyMsg,
  accentCls,
}: {
  title: string;
  rows: PostHrgDevRow[];
  emptyMsg: string;
  accentCls?: string;
}) {
  const [open, setOpen] = useState(true);
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground text-center">
        {emptyMsg}
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold border-b",
          accentCls || "bg-muted/40",
        )}
      >
        <span>
          {title}{" "}
          <span className="font-normal text-muted-foreground">
            ({rows.length})
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Claimant
                </th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Hearing
                </th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Rep
                </th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Deadline
                </th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                  Responsible
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b last:border-0",
                    i % 2 === 0
                      ? "bg-white dark:bg-zinc-950"
                      : "bg-zinc-50 dark:bg-zinc-900",
                  )}
                >
                  <td className="px-3 py-2 font-medium">{r.claimant}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {fmtDate(r.hearing_date)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.representative_name || r.assigned_rep || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_COLORS[r.status || "No Status"]?.bg,
                        STATUS_COLORS[r.status || "No Status"]?.text,
                      )}
                    >
                      {r.status || "—"}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums font-semibold",
                      r.deadline &&
                        new Date(r.deadline + "T12:00:00") < new Date()
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {fmtDate(r.deadline)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.person_responsible || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Export helpers
function exportToCSV(report: ReportData, rows: PostHrgDevRow[]) {
  const lines: string[] = [];
  lines.push("=== POST HRG DEVELOPMENT REPORT ===");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("--- SUMMARY ---");
  lines.push(`Total Records,${report.totalRecords}`);
  lines.push(`Overdue,${report.overdueCount}`);
  lines.push(`Due within 7 days,${report.dueSoonCount}`);
  lines.push(`Unacknowledged (NEW),${report.unacknowledgedCount}`);
  lines.push(`Completed this month,${report.completedThisMonth}`);
  lines.push(`EM Sent / Task Created,${report.emSentCount}`);
  lines.push(`EXT Letter Sent,${report.extLetterCount}`);
  lines.push("");
  lines.push("--- BY STATUS ---");
  for (const [k, v] of Object.entries(report.byStatus)) lines.push(`${k},${v}`);
  lines.push("");
  lines.push("--- BY RECORD TYPE ---");
  for (const [k, v] of Object.entries(report.byRecordType))
    lines.push(`${k},${v}`);
  lines.push("");
  lines.push("--- BY RESPONSIBLE ---");
  for (const [k, v] of Object.entries(report.byResponsible))
    lines.push(`${k},${v}`);
  lines.push("");
  lines.push("--- ALL RECORDS ---");
  lines.push(
    "ID,Claimant,Hearing Date,Rep,PH Status,Status,Docs Needed,Responsible,Deadline,EM Sent,EXT Letter,Record Type,Indicator",
  );
  for (const r of rows) {
    lines.push(
      [
        r.id,
        `"${r.claimant || ""}"`,
        r.hearing_date || "",
        `"${r.representative_name || r.assigned_rep || ""}"`,
        `"${r.post_hearing_status || ""}"`,
        `"${r.status || ""}"`,
        `"${r.type_of_docs_needed || ""}"`,
        `"${r.person_responsible || ""}"`,
        r.deadline || "",
        r.em_sent_task_created ? "Yes" : "No",
        r.ext_letter_sent ? "Yes" : "No",
        r.record_type || "",
        r.indicator || "",
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `post-hrg-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  recordType: PostHrgRecordType | "all";
}

export function PostHrgReportsModal({ open, onClose, recordType }: Props) {
  const [tab, setTab] = useState<ReportTab>("summary");
  const [rows, setRows] = useState<PostHrgDevRow[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  // Scoped record type inside the modal (can differ from the page's active tab)
  const [scopedType, setScopedType] = useState<PostHrgRecordType | "all">(
    recordType,
  );
  // "Completed by Day" tab — picked date defaults to today (local YYYY-MM-DD).
  const [selectedCompletedDate, setSelectedCompletedDate] = useState<string>(
    () => new Date().toLocaleDateString("en-CA"),
  );
  // Optional substring filter (claimant / rep / person responsible).
  const [completedSearch, setCompletedSearch] = useState("");

  // Completed records on the selected date — re-derived only when rows or
  // date change. We treat `updated_at` as the completion timestamp (same
  // proxy the existing "Completed this month" stat uses); accuracy depends
  // on no later edits to a Completed row.
  const completedOnSelectedDate = useMemo(() => {
    return rows
      .filter((r) => {
        if ((r.status || "").toLowerCase() !== "completed") return false;
        if (!r.updated_at) return false;
        // Compare in the user's local timezone — the date input picker is
        // also in local time, so the day boundaries line up.
        const localDay = new Date(r.updated_at).toLocaleDateString("en-CA");
        return localDay === selectedCompletedDate;
      })
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }, [rows, selectedCompletedDate]);

  // Apply the search filter on top of the date-filtered set. Both the count
  // card and the list below use this — so the displayed count always matches
  // what the user sees in the table.
  const completedFiltered = useMemo(() => {
    const q = completedSearch.trim().toLowerCase();
    if (!q) return completedOnSelectedDate;
    return completedOnSelectedDate.filter((r) => {
      const haystack = [
        r.claimant,
        r.representative_name,
        r.assigned_rep,
        r.person_responsible,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [completedOnSelectedDate, completedSearch]);

  // Per-record-type breakdown for the count cards (uses the filtered set so
  // the breakdown reflects whatever the search has narrowed to).
  const completedBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of completedFiltered) {
      counts[r.record_type] = (counts[r.record_type] ?? 0) + 1;
    }
    return counts;
  }, [completedFiltered]);

  const loadRef = useRef(false);

  const loadData = useCallback(async (rt: PostHrgRecordType | "all") => {
    if (loadRef.current) return;
    loadRef.current = true;
    setLoading(true);
    try {
      // Fetch a large page — reports work best with full data.
      // For teams with >1000 rows you can paginate or add a backend aggregate.
      const res = await fetchPostHrgDevPage({
        page: 1,
        pageSize: 2000,
        recordType: rt,
        includeCompleted: true,
        sortKey: "hearing_date",
        sortDir: "asc",
      });
      setRows(res.records);
      setReport(computeReport(res.records));
      setLoadedAt(new Date());
    } catch {
      /* */
    }
    setLoading(false);
    loadRef.current = false;
  }, []);

  // Load on open, reload when scoped type changes
  useEffect(() => {
    if (!open) return;
    loadData(scopedType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scopedType]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const TABS: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "summary",
      label: "Summary",
      icon: <BarChart3 className="h-3.5 w-3.5" />,
    },
    {
      key: "timeliness",
      label: "Timeliness",
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    {
      key: "people",
      label: "People",
      icon: <Users className="h-3.5 w-3.5" />,
    },
    {
      key: "detail",
      label: "Detail View",
      icon: <FileText className="h-3.5 w-3.5" />,
    },
    {
      key: "completed_by_day",
      label: "Completed by Day",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5 shrink-0 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">PHD Reports</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {loadedAt
                  ? `Last loaded ${loadedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                  : "Loading data..."}
                {report && ` · ${report.totalRecords} records`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Scope selector */}
            <select
              value={scopedType}
              onChange={(e) =>
                setScopedType(e.target.value as PostHrgRecordType | "all")
              }
              className="h-8 rounded-lg border bg-background px-2 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">All Types</option>
              <option value="POST_HRG">Post HRG</option>
              <option value="MR">MR</option>
              <option value="REP">REP</option>
            </select>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => loadData(scopedType)}
              disabled={loading}
              className="h-8 w-8 flex items-center justify-center rounded-lg border bg-background hover:bg-muted transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
            </button>

            {/* Export */}
            {report && (
              <button
                type="button"
                onClick={() => exportToCSV(report, rows)}
                className="h-8 flex items-center gap-1.5 px-3 rounded-lg border bg-background hover:bg-muted transition-colors text-xs font-medium"
                title="Export to CSV"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 shrink-0 bg-muted/10 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && !report && (
            <div className="flex items-center justify-center gap-3 py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                Building report...
              </span>
            </div>
          )}

          {report && (
            <div className="p-5 space-y-6">
              {/* ═══ SUMMARY TAB ═══ */}
              {tab === "summary" && (
                <>
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <MetricCard
                      icon={<FileText className="h-4 w-4" />}
                      label="Total Records"
                      value={report.totalRecords}
                    />
                    <MetricCard
                      icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                      label="Incomplete"
                      value={report.overdueCount}
                      accent={
                        report.overdueCount > 0
                          ? "border-red-200 dark:border-red-800"
                          : undefined
                      }
                    />
                    <MetricCard
                      icon={<Clock className="h-4 w-4 text-amber-500" />}
                      label="Due in 7 Days"
                      value={report.dueSoonCount}
                    />
                    <MetricCard
                      icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
                      label="NEW (Unack.)"
                      value={report.unacknowledgedCount}
                    />
                    <MetricCard
                      icon={
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      }
                      label="Completed / Month"
                      value={report.completedThisMonth}
                    />
                    <MetricCard
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      label="EM Sent"
                      value={`${report.emSentCount} / ${report.totalRecords}`}
                      sub={`${report.totalRecords > 0 ? Math.round((report.emSentCount / report.totalRecords) * 100) : 0}% of records`}
                    />
                    <MetricCard
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      label="EXT Letter Sent"
                      value={`${report.extLetterCount} / ${report.totalRecords}`}
                      sub={`${report.totalRecords > 0 ? Math.round((report.extLetterCount / report.totalRecords) * 100) : 0}% of records`}
                    />
                    <MetricCard
                      icon={
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      }
                      label="Neither Actioned"
                      value={report.neitherCheckedCount}
                      sub="No EM or EXT sent"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* By Status */}
                    <div className="rounded-xl border bg-card p-4">
                      <SectionHeader
                        title="By Status"
                        icon={<BarChart3 className="h-3.5 w-3.5" />}
                      />
                      <div className="space-y-2">
                        {Object.entries(report.byStatus)
                          .sort(([, a], [, b]) => b - a)
                          .map(([status, count]) => (
                            <BarRow
                              key={status}
                              label={status}
                              count={count}
                              total={report.totalRecords}
                              barCls={
                                STATUS_COLORS[status]?.bar || "bg-primary/60"
                              }
                              badgeCls={cn(
                                STATUS_COLORS[status]?.bg,
                                STATUS_COLORS[status]?.text,
                              )}
                            />
                          ))}
                      </div>
                    </div>

                    {/* By Record Type */}
                    <div className="rounded-xl border bg-card p-4">
                      <SectionHeader
                        title="By Record Type"
                        icon={<FileText className="h-3.5 w-3.5" />}
                      />
                      <div className="space-y-2">
                        {Object.entries(report.byRecordType)
                          .sort(([, a], [, b]) => b - a)
                          .map(([rt, count]) => (
                            <BarRow
                              key={rt}
                              label={rt}
                              count={count}
                              total={report.totalRecords}
                              barCls={RT_COLORS[rt]?.bar || "bg-primary/60"}
                              badgeCls={cn(
                                RT_COLORS[rt]?.bg,
                                RT_COLORS[rt]?.text,
                              )}
                            />
                          ))}
                      </div>

                      {/* Completion rate per record type */}
                      <div className="mt-4 pt-3 border-t space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Completed / Total per Type
                        </p>
                        {Object.entries(report.byRecordType)
                          .sort(([, a], [, b]) => b - a)
                          .map(([rt, total]) => {
                            const completed = rows.filter(
                              (r) =>
                                r.record_type === rt &&
                                r.status?.toLowerCase() === "completed",
                            ).length;
                            const pct =
                              total > 0
                                ? Math.round((completed / total) * 100)
                                : 0;
                            return (
                              <div key={rt} className="flex items-center gap-2">
                                <span
                                  className="shrink-0 text-[11px] text-right text-foreground/80"
                                  style={{ width: 140, minWidth: 140 }}
                                >
                                  {rt}
                                </span>
                                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      pct >= 80
                                        ? "bg-emerald-500"
                                        : pct >= 50
                                          ? "bg-amber-400"
                                          : "bg-red-400",
                                    )}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                  {completed}/{total} ({pct}%)
                                </span>
                              </div>
                            );
                          })}

                        {/* POST_HRG + REP combined row */}
                        {(() => {
                          const combinedTotal = rows.filter(
                            (r) =>
                              r.record_type === "POST_HRG" ||
                              r.record_type === "REP",
                          ).length;
                          const combinedCompleted = rows.filter(
                            (r) =>
                              (r.record_type === "POST_HRG" ||
                                r.record_type === "REP") &&
                              r.status?.toLowerCase() === "completed",
                          ).length;
                          const pct =
                            combinedTotal > 0
                              ? Math.round(
                                  (combinedCompleted / combinedTotal) * 100,
                                )
                              : 0;
                          return (
                            <div className="flex items-center gap-2 pt-2 border-t mt-1">
                              <span
                                className="shrink-0 text-[11px] text-right font-semibold text-foreground"
                                style={{ width: 140, minWidth: 140 }}
                              >
                                POST_HRG + REP
                              </span>
                              <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    pct >= 80
                                      ? "bg-emerald-500"
                                      : pct >= 50
                                        ? "bg-amber-400"
                                        : "bg-red-400",
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                {combinedCompleted}/{combinedTotal} ({pct}%)
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* By PH Status */}
                    <div className="rounded-xl border bg-card p-4">
                      <SectionHeader
                        title="By PH Status"
                        icon={<TrendingUp className="h-3.5 w-3.5" />}
                      />
                      <div className="space-y-2">
                        {Object.entries(report.byPhStatus)
                          .sort(([, a], [, b]) => b - a)
                          .map(([ph, count]) => (
                            <BarRow
                              key={ph}
                              label={ph}
                              count={count}
                              total={report.totalRecords}
                            />
                          ))}
                      </div>
                    </div>

                    {/* By Docs Needed */}
                    <div className="rounded-xl border bg-card p-4">
                      <SectionHeader
                        title="By Docs Needed"
                        icon={<FileText className="h-3.5 w-3.5" />}
                      />
                      <div className="space-y-2">
                        {Object.entries(report.byDocsNeeded)
                          .sort(([, a], [, b]) => b - a)
                          .map(([doc, count]) => (
                            <BarRow
                              key={doc}
                              label={doc}
                              count={count}
                              total={report.totalRecords}
                            />
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* By Hearing Month (mini-chart) */}
                  {Object.keys(report.byHearingMonth).length > 0 && (
                    <div className="rounded-xl border bg-card p-4">
                      <SectionHeader
                        title="Records by Hearing Month"
                        icon={<BarChart3 className="h-3.5 w-3.5" />}
                      />
                      <div className="flex items-end gap-1.5 h-24 overflow-x-auto pb-1">
                        {Object.entries(report.byHearingMonth)
                          .sort(
                            ([a], [b]) =>
                              new Date(a).getTime() - new Date(b).getTime(),
                          )
                          .map(([month, count]) => {
                            const max = Math.max(
                              ...Object.values(report.byHearingMonth),
                            );
                            const heightPct =
                              max > 0
                                ? Math.max(8, Math.round((count / max) * 100))
                                : 8;
                            return (
                              <div
                                key={month}
                                className="flex flex-col items-center gap-1 shrink-0"
                              >
                                <span className="text-[9px] tabular-nums text-muted-foreground">
                                  {count}
                                </span>
                                <div
                                  className="w-8 rounded-t bg-primary/60 hover:bg-primary transition-colors"
                                  style={{ height: `${heightPct}%` }}
                                  title={`${month}: ${count}`}
                                />
                                <span className="text-[8px] text-muted-foreground rotate-45 origin-left">
                                  {month.split(" ")[0]}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══ TIMELINESS TAB ═══ */}
              {tab === "timeliness" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard
                      icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                      label="Incomplete"
                      value={report.overdueCount}
                      sub="Past deadline, not completed"
                      accent={
                        report.overdueCount > 0
                          ? "border-red-200 dark:border-red-800"
                          : undefined
                      }
                    />
                    <MetricCard
                      icon={<Clock className="h-4 w-4 text-amber-500" />}
                      label="Due in 7 Days"
                      value={report.dueSoonCount}
                      sub="Needs attention soon"
                    />
                    <MetricCard
                      icon={
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      }
                      label="Avg Days to Deadline"
                      value={
                        report.avgDaysToDeadline !== null
                          ? `${report.avgDaysToDeadline}d`
                          : "N/A"
                      }
                      sub="Active records with deadlines"
                    />
                  </div>

                  {/* Indicator breakdown */}
                  <div className="rounded-xl border bg-card p-4">
                    <SectionHeader
                      title="By Indicator Color"
                      icon={<BarChart3 className="h-3.5 w-3.5" />}
                    />
                    <div className="space-y-2">
                      {Object.entries(report.byIndicator)
                        .sort(([, a], [, b]) => b - a)
                        .map(([ind, count]) => {
                          const LABELS: Record<string, string> = {
                            green: "🟢 Need to check / monitor",
                            yellow: "🟡 CE's that need response",
                            blue: "🔵 Normal CE's",
                            gray: "⚫ Assigned to Charlotte",
                            orange: "🟠 Assigned to Esther",
                            none: "◯ No indicator",
                          };
                          return (
                            <BarRow
                              key={ind}
                              label={LABELS[ind] || ind}
                              count={count}
                              total={report.totalRecords}
                            />
                          );
                        })}
                    </div>
                  </div>

                  {/* Overdue rows */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <h3 className="text-sm font-semibold">Overdue Records</h3>
                    </div>
                    <CollapsibleTable
                      title="Overdue"
                      rows={report.overdueRows}
                      emptyMsg="✅ No overdue records"
                      accentCls="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
                    />
                  </div>

                  {/* Unacknowledged rows */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <h3 className="text-sm font-semibold">
                        Unacknowledged (NEW) Records
                      </h3>
                    </div>
                    <CollapsibleTable
                      title="Unacknowledged"
                      rows={report.unacknowledgedRows}
                      emptyMsg="✅ All records acknowledged"
                      accentCls="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300"
                    />
                  </div>
                </>
              )}

              {/* ═══ PEOPLE TAB ═══ */}
              {tab === "people" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* By Responsible */}
                  <div className="rounded-xl border bg-card p-4">
                    <SectionHeader
                      title="By Person Responsible"
                      icon={<Users className="h-3.5 w-3.5" />}
                      count={Object.keys(report.byResponsible).length}
                    />
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {Object.entries(report.byResponsible)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, count]) => (
                          <BarRow
                            key={name}
                            label={name}
                            count={count}
                            total={report.totalRecords}
                            barCls="bg-indigo-400"
                            badgeCls="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
                          />
                        ))}
                    </div>
                  </div>

                  {/* By Rep */}
                  <div className="rounded-xl border bg-card p-4">
                    <SectionHeader
                      title="By Representative"
                      icon={<Users className="h-3.5 w-3.5" />}
                      count={Object.keys(report.byRep).length}
                    />
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {Object.entries(report.byRep)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, count]) => (
                          <BarRow
                            key={name}
                            label={name}
                            count={count}
                            total={report.totalRecords}
                            barCls="bg-emerald-400"
                            badgeCls="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          />
                        ))}
                    </div>
                  </div>

                  {/* Checkbox completion heatmap */}
                  <div className="md:col-span-2 rounded-xl border bg-card p-4">
                    <SectionHeader
                      title="Action Completion by Responsible Person"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    />
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs mt-1">
                        <thead>
                          <tr className="border-b">
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                              Person
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                              Total
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                              EM Sent
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                              EXT Sent
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                              Both ✓
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(report.byResponsible)
                            .sort(([, a], [, b]) => b - a)
                            .map(([person]) => {
                              const personRows = rows.filter(
                                (r) =>
                                  (r.person_responsible || "Unassigned") ===
                                  person,
                              );
                              const emCount = personRows.filter(
                                (r) => r.em_sent_task_created,
                              ).length;
                              const extCount = personRows.filter(
                                (r) => r.ext_letter_sent,
                              ).length;
                              const bothCount = personRows.filter(
                                (r) =>
                                  r.em_sent_task_created && r.ext_letter_sent,
                              ).length;
                              const total = personRows.length;
                              const pct = (n: number) =>
                                total > 0 ? Math.round((n / total) * 100) : 0;
                              return (
                                <tr
                                  key={person}
                                  className="border-b last:border-0 hover:bg-muted/30"
                                >
                                  <td className="px-3 py-2 font-medium">
                                    {person}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {total}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    <span
                                      className={cn(
                                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                        pct(emCount) >= 80
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                          : pct(emCount) >= 50
                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                                      )}
                                    >
                                      {emCount} ({pct(emCount)}%)
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    <span
                                      className={cn(
                                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                        pct(extCount) >= 80
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                          : pct(extCount) >= 50
                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                                      )}
                                    >
                                      {extCount} ({pct(extCount)}%)
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    <span
                                      className={cn(
                                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                        pct(bothCount) >= 80
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                          : pct(bothCount) >= 50
                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                                      )}
                                    >
                                      {bothCount} ({pct(bothCount)}%)
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ DETAIL TAB ═══ */}
              {tab === "detail" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Full list of {report.totalRecords} records loaded for this
                    report. Use the Export button to download as CSV.
                  </p>
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                          <tr className="border-b">
                            {[
                              "Claimant",
                              "Hearing Date",
                              "Record Type",
                              "Rep",
                              "PH Status",
                              "Status",
                              "Responsible",
                              "Deadline",
                              "EM",
                              "EXT",
                              "Indicator",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr
                              key={r.id}
                              className={cn(
                                "border-b last:border-0 hover:bg-muted/30",
                                i % 2 === 0
                                  ? "bg-white dark:bg-zinc-950"
                                  : "bg-zinc-50 dark:bg-zinc-900",
                              )}
                            >
                              <td className="px-3 py-2 font-medium whitespace-nowrap max-w-40 truncate">
                                {r.claimant}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                                {fmtDate(r.hearing_date)}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                    RT_COLORS[r.record_type]?.bg,
                                    RT_COLORS[r.record_type]?.text,
                                  )}
                                >
                                  {r.record_type}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-28 truncate">
                                {r.representative_name || r.assigned_rep || "—"}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap max-w-32 truncate text-muted-foreground">
                                {r.post_hearing_status || "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                                    STATUS_COLORS[r.status || "No Status"]?.bg,
                                    STATUS_COLORS[r.status || "No Status"]
                                      ?.text,
                                  )}
                                >
                                  {r.status || "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {r.person_responsible || "—"}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2 tabular-nums font-semibold whitespace-nowrap",
                                  r.deadline &&
                                    new Date(r.deadline + "T12:00:00") <
                                      new Date() &&
                                    r.status?.toLowerCase() !== "completed"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground",
                                )}
                              >
                                {fmtDate(r.deadline)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.em_sent_task_created ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.ext_letter_sent ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {r.indicator ? (
                                  <span
                                    className="inline-block w-3 h-3 rounded-full"
                                    style={{
                                      backgroundColor:
                                        {
                                          green: "#39FF14",
                                          yellow: "#FACC15",
                                          blue: "#93C5FD",
                                          gray: "#9CA3AF",
                                          orange: "#FB923C",
                                        }[r.indicator] || "#9CA3AF",
                                    }}
                                    title={r.indicator}
                                  />
                                ) : (
                                  <span className="text-muted-foreground/30">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === "completed_by_day" && (
                <div className="space-y-4">
                  {/* Date picker + search + summary row */}
                  <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Completed on
                          </p>
                          <input
                            type="date"
                            value={selectedCompletedDate}
                            onChange={(e) =>
                              setSelectedCompletedDate(
                                e.target.value ||
                                  new Date().toLocaleDateString("en-CA"),
                              )
                            }
                            max={new Date().toLocaleDateString("en-CA")}
                            className="mt-0.5 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                      <div className="relative w-full sm:w-64">
                        <input
                          type="text"
                          value={completedSearch}
                          onChange={(e) => setCompletedSearch(e.target.value)}
                          placeholder="Search claimant, rep, responsible..."
                          className="h-9 w-full rounded-md border border-input bg-background px-3 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {completedSearch && (
                          <button
                            type="button"
                            onClick={() => setCompletedSearch("")}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                            title="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {completedSearch ? "Matches" : "Records completed"}
                      </p>
                      <p className="text-3xl font-bold tabular-nums leading-tight">
                        {completedFiltered.length}
                        {completedSearch &&
                          completedFiltered.length !==
                            completedOnSelectedDate.length && (
                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                              of {completedOnSelectedDate.length}
                            </span>
                          )}
                      </p>
                    </div>
                  </div>

                  {/* Per-record-type breakdown — only show types that have at
                      least one completion that day, so empty types don't
                      clutter the row. */}
                  {Object.keys(completedBreakdown).length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {Object.entries(completedBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([rt, count]) => (
                          <div
                            key={rt}
                            className={cn(
                              "flex items-center justify-between rounded-lg border p-3",
                              RT_COLORS[rt]?.bg,
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wide",
                                RT_COLORS[rt]?.text,
                              )}
                            >
                              {rt}
                            </span>
                            <span
                              className={cn(
                                "text-xl font-bold tabular-nums",
                                RT_COLORS[rt]?.text,
                              )}
                            >
                              {count}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Completed list — bottom of the cards, the team's “what
                      shipped today” feed. */}
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                      <p className="text-xs font-semibold">Completed records</p>
                      <p className="text-[10px] text-muted-foreground">
                        Sorted by completion time, newest first
                      </p>
                    </div>
                    {completedFiltered.length === 0 ? (
                      <p className="p-6 text-center text-xs text-muted-foreground">
                        {completedSearch
                          ? "No completed records match this search."
                          : "No records completed on this day."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                            <tr className="border-b">
                              {[
                                "Time",
                                "Claimant",
                                "Hearing Date",
                                "Record Type",
                                "Rep",
                                "Responsible",
                              ].map((h) => (
                                <th
                                  key={h}
                                  className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {completedFiltered.map((r, i) => (
                              <tr
                                key={r.id}
                                className={cn(
                                  "border-b last:border-0 hover:bg-muted/30",
                                  i % 2 === 0
                                    ? "bg-white dark:bg-zinc-950"
                                    : "bg-zinc-50 dark:bg-zinc-900",
                                )}
                              >
                                <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                                  {r.updated_at
                                    ? new Date(r.updated_at).toLocaleTimeString(
                                        "en-US",
                                        {
                                          hour: "numeric",
                                          minute: "2-digit",
                                        },
                                      )
                                    : "—"}
                                </td>
                                <td className="px-3 py-2 font-medium whitespace-nowrap max-w-40 truncate">
                                  {r.claimant}
                                </td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                                  {fmtDate(r.hearing_date)}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                      RT_COLORS[r.record_type]?.bg,
                                      RT_COLORS[r.record_type]?.text,
                                    )}
                                  >
                                    {r.record_type}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-28 truncate">
                                  {r.representative_name ||
                                    r.assigned_rep ||
                                    "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-28 truncate">
                                  {r.person_responsible || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Caveat note — tells the user what "completion time"
                      actually represents. Cheap honesty so the report
                      isn't misread as exact audit data. */}
                  <p className="text-[10px] text-muted-foreground italic">
                    Completion time is taken from each record&apos;s last
                    update. Editing a completed record after marking it Complete
                    will shift its position in this list.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t bg-muted/20 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">
              Esc
            </kbd>{" "}
            to close
          </p>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
