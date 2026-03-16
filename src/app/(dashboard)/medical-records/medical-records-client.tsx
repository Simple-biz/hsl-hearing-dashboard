"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, Download, Loader2,
  Bell, BarChart3, FileText, ClipboardList, AlertTriangle, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "./types";

import {
  getHearingsPaginated,
  updateMrStatus,
  updateHearingDecisionStatus,
  updateMrTeam,
  toggleTaskAssigned,
  toggleCredited,
  updateMoa,
  assignJeromeUrgent,
  getRoundRobinState,
  getNotifications,
} from "./action";
import type {
  MrPivotPageData,
  Hearing,
  HearingFilters,
  RoundRobinState,
  NotificationItem,
  MrStatusByTeam,
  AssignedByMonthRow,
} from "./action";

import { HearingsModal }    from "@/components/modals/hearings-modal";
import { PostHrgModal }     from "@/components/modals/post-hrg-modal";
import { TeamStatsModal }   from "@/components/modals/team-stats-modal";
import { ActivityLogModal } from "@/components/modals/activity-log-modal";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLUMNS = [
  "c/o Franciso's Team",
  "Complete",
  "In Progress",
  "Not Started",
  "Overpayment",
  "Ready",
  "URGENT! NEEDS ATTENTION",
] as const;

const TEAM_HEX: Record<string, string> = {
  blue:   "#3b82f6", orange: "#f97316", green:  "#22c55e",
  yellow: "#eab308", purple: "#a855f7", red:    "#ef4444",
  pink:   "#ec4899", teal:   "#14b8a6", indigo: "#6366f1", cyan: "#06b6d4",
};

function teamHex(color: string | null | undefined): string {
  if (!color) return "#9ca3af";
  return TEAM_HEX[color] ?? color;
}

// Theme-safe status badge classes (no hardcoded light-only colours)
const MR_STATUS_CLS: Record<string, string> = {
  "Complete":                "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Progress":             "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Ready":                   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not Started":             "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "URGENT! NEEDS ATTENTION": "bg-red-700 text-white font-semibold",
  "WITHDRAWAL":              "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-700 dark:text-zinc-400",
};

const HRG_STATUS_CLS: Record<string, string> = {
  "Scheduled":            "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "Favorable":            "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Unfavorable":          "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Post HRG Review/ Dev": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Continued":            "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  "Pending Decision":     "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "OTR at Hrg":           "bg-green-700 text-white",
  "Dismissal":            "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function exportToCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportHearingsToCsv(hearings: Hearing[]) {
  const headers = ["ID","Claimant","Rep","Hearing Date","Time","MR Team","MR Status",
    "HRG Decision","MOA","Task","Credited","5-Day","Post HRG","Worksheet"];
  const rows = hearings.map((h) => [
    h.id, h.claimant, h.rep_name ?? "", h.hearing_date, h.converted_time_est ?? "",
    h.mr_team_name ?? "", h.medical_record_status ?? "", h.hearing_decision_status ?? "",
    h.manner_of_hearing ?? "", h.task_assigned ? "Yes" : "No", h.credited ? "Yes" : "No",
    h.five_day_letter ? "Yes" : "No", h.post_hrg_status ?? "", h.mr_worksheet_link ?? "",
  ]);
  exportToCsv(`hearings-export-${new Date().toISOString().slice(0,10)}.csv`, [headers, ...rows] as string[][]);
}

function exportPivotToCsv(rows: MrStatusByTeam[]) {
  const headers = ["MR Specialist", ...STATUS_COLUMNS, "Grand Total"];
  const dataRows = rows.map((r) => {
    const rowTotal = STATUS_COLUMNS.reduce((s, col) => s + (r.statuses[col] ?? 0), 0);
    return [r.team, ...STATUS_COLUMNS.map((col) => r.statuses[col] ?? 0), rowTotal];
  });
  exportToCsv(`mr-status-pivot-${new Date().toISOString().slice(0,10)}.csv`, [headers, ...dataRows] as string[][]);
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, bg, onClick }: {
  label: string; value: number | string; bg: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl p-4 sm:p-5 text-white flex flex-col gap-1",
        bg, onClick && "cursor-pointer hover:opacity-90 transition-opacity"
      )}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative z-10">
        <p className="text-[10px] font-semibold tracking-widest uppercase opacity-80 mb-1">{label}</p>
        <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{value}</p>
      </div>
    </div>
  );
}

// ─── AssignmentCard ───────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function AssignmentCard({ title, count, nextHearing, nextIcon, gradientFrom, gradientTo, availableYears }: {
  title: string; count: number;
  nextHearing: { claimant: string; hearing_date: string } | null;
  nextIcon?: string;
  gradientFrom: string; gradientTo: string;
  availableYears: number[];
}) {
  const [yearFilter,  setYearFilter]  = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const dateStr = nextHearing
    ? new Date(nextHearing.hearing_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="rounded-xl border border-border overflow-hidden w-fit min-w-[180px]">
      {/* Colored header: title left, count right */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white">{title}</span>
        <span className="text-2xl font-bold text-white tabular-nums leading-none">{count}</span>
      </div>
      {/* White/card body: year+month selects + next indicator */}
      <div className="px-3 py-2 bg-card">
        <div className="flex gap-1.5 mb-2">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="flex-1 text-[10px] px-1.5 py-1 border border-border rounded bg-card text-foreground cursor-pointer"
          >
            <option value="">All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="flex-1 text-[10px] px-1.5 py-1 border border-border rounded bg-card text-foreground cursor-pointer"
          >
            <option value="">All Months</option>
            {MONTH_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1.5 border-t border-border min-w-0">
          {dateStr ? (
            <>
              <span className="flex-shrink-0">{nextIcon ?? "📅"}</span>
              <span className="font-semibold text-primary flex-shrink-0">{dateStr}</span>
              <span className="text-[10px] truncate">— {nextHearing!.claimant.slice(0, 14)}…</span>
            </>
          ) : (
            <span className="opacity-50">No upcoming</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RoundRobinBanner ─────────────────────────────────────────────────────────

function RoundRobinBanner({ rr }: { rr: RoundRobinState }) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-muted-foreground font-semibold text-[11px]">LAST:</span>
      <span className="px-2 py-0.5 rounded font-semibold text-white text-[11px]"
        style={{ backgroundColor: teamHex(rr.lastColor) }}>
        {rr.lastTeamName}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="text-muted-foreground font-semibold text-[11px]">NEXT:</span>
      <span className="px-2 py-0.5 rounded font-semibold text-white text-[11px] ring-2 ring-offset-1"
        style={{ backgroundColor: teamHex(rr.nextColor) }}>
        {rr.nextTeamName}
      </span>
      <div className="hidden sm:flex gap-1 items-center">
        {rr.rotationOrder.map((c) => (
          <span key={c}
            className={cn("w-2 h-2 rounded-full transition-transform", c === rr.nextColor ? "scale-125" : "opacity-30")}
            style={{ backgroundColor: teamHex(c) }}
          />
        ))}
      </div>
      {rr.nextUnassignedHearing && (
        <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-border">
          <span className="text-primary">📅</span>
          <span className="font-semibold text-foreground text-[11px]">
            {new Date(rr.nextUnassignedHearing.hearing_date + "T00:00:00")
              .toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <span className="text-muted-foreground text-[10px] truncate max-w-[100px]">
            — {rr.nextUnassignedHearing.claimant.slice(0, 14)}…
          </span>
        </div>
      )}
    </div>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

function NotificationBell({ notifications, onRefresh }: {
  notifications: NotificationItem[];
  onRefresh: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const unseen = notifications.filter((n) => !seenIds.has(n.id));

  function markSeen(id: number) {
    setSeenIds((p) => new Set([...p, id]));
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); onRefresh(); }}
        className={cn(
          "relative w-9 h-9 flex items-center justify-center rounded-full border border-border bg-card hover:bg-muted transition-colors",
          unseen.length > 0 && "animate-[bell-shake_0.5s_ease-in-out]"
        )}
      >
        <Bell size={16} className="text-muted-foreground" />
        {unseen.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unseen.length > 99 ? "99+" : unseen.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-72 sm:w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Notifications</span>
              {unseen.length > 0 && (
                <button
                  onClick={() => notifications.forEach((n) => markSeen(n.id))}
                  className="text-[11px] text-primary hover:underline"
                >
                  Mark all seen
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No new notifications</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markSeen(n.id)}
                    className={cn(
                      "px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/40 transition-colors",
                      n.notification_type === "withdrawal"   ? "border-l-2 border-l-red-500"  :
                      n.notification_type === "status_change"? "border-l-2 border-l-amber-400" : "border-l-2 border-l-blue-400"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-[10px] font-bold uppercase",
                        n.notification_type === "withdrawal" ? "text-red-600" : "text-amber-600")}>
                        {n.notification_type === "withdrawal" ? "🚫 Withdrawal" : "📋 Status Update"}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MrStatusPivot ────────────────────────────────────────────────────────────

function MrStatusPivot({ rows }: { rows: MrStatusByTeam[] }) {
  const columnTotals = STATUS_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col] = rows.reduce((s, r) => s + (r.statuses[col] ?? 0), 0);
    return acc;
  }, {});
  const grandTotal = Object.values(columnTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-x-auto">
      {/* Theme-safe header: bg-muted instead of hardcoded #4a5568 */}
      <table className="w-full text-xs" style={{ minWidth: "900px" }}>
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-foreground">
              MR Specialist
            </th>
            {STATUS_COLUMNS.map((col) => (
              <th key={col} className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground">
                {col}
              </th>
            ))}
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              Grand Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowTotal = STATUS_COLUMNS.reduce((s, col) => s + (row.statuses[col] ?? 0), 0);
            return (
              <tr key={row.team} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-semibold text-foreground">
                  {row.color && (
                    <span className="inline-block w-2 h-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: teamHex(row.color) }} />
                  )}
                  {row.team}
                </td>
                {STATUS_COLUMNS.map((col) => {
                  const v = row.statuses[col] ?? 0;
                  const isUrgent   = col === "URGENT! NEEDS ATTENTION";
                  const isComplete = col === "Complete";
                  return (
                    <td key={col} className={cn("px-3 py-2 text-center tabular-nums",
                      v === 0     ? "text-muted-foreground/30"                                        :
                      isUrgent    ? "text-red-600 font-bold"                                           :
                      isComplete  ? "text-purple-600 dark:text-purple-400 font-semibold"               :
                      "text-foreground"
                    )}>
                      {v === 0 ? "—" : v}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-bold text-amber-600 bg-amber-50/50 dark:bg-amber-900/10 tabular-nums">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/40 font-bold">
            <td className="px-3 py-2 text-foreground text-[11px] uppercase tracking-wide">Column Totals</td>
            {STATUS_COLUMNS.map((col) => (
              <td key={col} className={cn("px-3 py-2 text-center tabular-nums text-sm",
                col === "URGENT! NEEDS ATTENTION" ? "text-red-600"                       :
                col === "Complete"                ? "text-purple-600 dark:text-purple-400" :
                "text-foreground"
              )}>
                {columnTotals[col]}
              </td>
            ))}
            <td className="px-3 py-2 text-center text-sm font-bold text-amber-600 bg-amber-50/50 dark:bg-amber-900/10 tabular-nums">
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── AssignedByMonth ──────────────────────────────────────────────────────────

function AssignedByMonth({ rows }: { rows: AssignedByMonthRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  function toggle(key: string) {
    setExpanded((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground font-semibold px-1 mb-2">Grand Total: {grandTotal}</div>
      {rows.map((row) => (
        <div key={row.month_key}>
          <button
            onClick={() => toggle(row.month_key)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px]">{expanded.has(row.month_key) ? "▼" : "▶"}</span>
              <span className="text-xs font-semibold text-foreground">{row.month_label}</span>
            </div>
            <span className="text-xs font-bold tabular-nums text-foreground">{row.total}</span>
          </button>
          {expanded.has(row.month_key) && (
            <div className="ml-4 mt-1 space-y-0.5">
              {row.teams.map((t) => (
                <div key={t.team_name}
                  className="flex items-center justify-between px-3 py-1.5 rounded border-l-2"
                  style={{ borderColor: teamHex(t.team_color) }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: teamHex(t.team_color) }} />
                    <span className="text-xs text-foreground">{t.team_name}</span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{t.case_count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── HearingRow ───────────────────────────────────────────────────────────────
// Inline selects/checkboxes inside the fixed-column data grid stay as native
// HTML elements intentionally — shadcn Select would break the compact layout.

function HearingRow({
  h, teams, mrStatusOptions, hearingDecisionOptions, mannerOptions, permissions, onUpdate,
}: {
  h: Hearing;
  teams: MrPivotPageData["medical_teams"];
  mrStatusOptions: string[];
  hearingDecisionOptions: string[];
  mannerOptions: string[];
  permissions: MrPivotPageData["permissions"];
  onUpdate: (id: number, field: string, value: unknown) => void;
}) {
  const dateStr = new Date(h.hearing_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mrCls   = MR_STATUS_CLS[h.medical_record_status ?? ""]   ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  const hrgCls  = HRG_STATUS_CLS[h.hearing_decision_status ?? ""] ?? "bg-red-500 text-white";

  return (
    <div
      className="grid gap-2 px-4 py-2 border-b border-border/40 hover:bg-muted/30 transition-colors text-[11px] items-center"
      style={{ gridTemplateColumns: "200px 120px 36px 90px 160px 36px 100px 70px 36px 70px 80px", minWidth: "1200px" }}
    >
      {/* Claimant */}
      <div>
        <div className="font-semibold text-foreground truncate">{h.claimant}</div>
        {h.rep_name && <div className="text-[9px] text-muted-foreground truncate">{h.rep_name}</div>}
      </div>

      {/* MR Team — canEditMrTeam gate */}
      {permissions.canEditMrTeam ? (
        <select
          className="w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer font-medium"
          style={{ backgroundColor: h.mr_team_id ? teamHex(h.mr_team_color) : "#e5e7eb", color: h.mr_team_id ? "#fff" : "#374151" }}
          value={h.mr_team_id ?? ""}
          onChange={(e) => onUpdate(h.id, "mr_team", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Unassigned</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
        </select>
      ) : (
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
          style={{ backgroundColor: teamHex(h.mr_team_color), color: h.mr_team_id ? "#fff" : "#6b7280" }}>
          {h.mr_team_name ?? "—"}
        </span>
      )}

      {/* Task — canEditTask gate */}
      <div className="text-center">
        {permissions.canEditTask ? (
          <input type="checkbox" checked={h.task_assigned}
            className="w-3.5 h-3.5 cursor-pointer accent-emerald-500"
            onChange={(e) => onUpdate(h.id, "task_assigned", e.target.checked)} />
        ) : (
          <span className={h.task_assigned ? "text-emerald-500" : "text-muted-foreground/30"}>
            {h.task_assigned ? "✓" : "—"}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-foreground font-medium">
        {dateStr}
        {h.converted_time_est && <div className="text-[9px] text-muted-foreground">{h.converted_time_est}</div>}
      </div>

      {/* MR Status — canManage gate */}
      {permissions.canManage ? (
        <select value={h.medical_record_status ?? ""}
          className={cn("w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer", mrCls)}
          onChange={(e) => onUpdate(h.id, "medical_record_status", e.target.value)}>
          <option value="">No Status</option>
          {mrStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <span className={cn("inline-block text-[9px] px-1.5 py-0.5 rounded", mrCls)}>
          {h.medical_record_status ?? "No Status"}
        </span>
      )}

      {/* Credited — canEditCredited gate */}
      <div className="text-center">
        {permissions.canEditCredited ? (
          <input type="checkbox" checked={h.credited}
            className="w-3.5 h-3.5 cursor-pointer accent-blue-500"
            onChange={(e) => onUpdate(h.id, "credited", e.target.checked)} />
        ) : (
          <span className={h.credited ? "text-blue-500" : "text-muted-foreground/30"}>
            {h.credited ? "✓" : "—"}
          </span>
        )}
      </div>

      {/* HRG Decision — canManage gate */}
      {permissions.canManage ? (
        <select value={h.hearing_decision_status ?? ""}
          className={cn("w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer", hrgCls)}
          onChange={(e) => onUpdate(h.id, "hearing_decision_status", e.target.value)}>
          <option value="">— Status —</option>
          {hearingDecisionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <span className={cn("inline-block text-[9px] px-1.5 py-0.5 rounded", hrgCls)}>
          {h.hearing_decision_status ?? "—"}
        </span>
      )}

      {/* MOA — canEditMoa gate */}
      {permissions.canEditMoa ? (
        <select value={h.manner_of_hearing ?? ""}
          className="w-full text-[9px] px-1.5 py-1 rounded border border-border bg-card text-foreground cursor-pointer"
          onChange={(e) => onUpdate(h.id, "manner_of_hearing", e.target.value)}>
          <option value="">—</option>
          {mannerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      ) : (
        <span className="text-muted-foreground">{h.manner_of_hearing ?? "—"}</span>
      )}

      {/* 5-Day — read-only for all */}
      <div className="text-center">
        {h.five_day_letter
          ? <span className="text-emerald-500">✓</span>
          : <span className="text-muted-foreground/30">—</span>}
      </div>

      {/* Post HRG */}
      <div>
        {h.post_hrg_status
          ? <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 px-1 py-0.5 rounded text-[9px] font-medium">📝</span>
          : <span className="text-muted-foreground/30">—</span>}
      </div>

      {/* Worksheet */}
      <div>
        {h.mr_worksheet_link
          ? <a href={h.mr_worksheet_link} target="_blank" rel="noreferrer"
              className="text-[9px] bg-blue-600 hover:bg-blue-700 text-white px-1.5 py-0.5 rounded transition-colors">
              📋 Sheet
            </a>
          : <span className="text-muted-foreground/30">—</span>}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = MrPivotPageData & { userRole: UserRole };

// ─── Main Component ───────────────────────────────────────────────────────────

export function MrPivotClient({ userRole, ...data }: Props) {
  const [isPending, startTransition] = useTransition();

  // ── Hearings ─────────────────────────────────────────────────────────────
  const [hearings,       setHearings]       = useState<Hearing[]>([]);
  const [totalHearings,  setTotalHearings]  = useState(data.statCards.totalHearings);
  const [totalPages,     setTotalPages]     = useState(1);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedTeams,  setExpandedTeams]  = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<HearingFilters>({
    search: "", month_filter: "", team_filter: "", status_filter: "",
    assignment_filter: "", sort_order: "asc", page: 1, per_page: 50,
  });

  // ── Round robin ───────────────────────────────────────────────────────────
  const [roundRobin,     setRoundRobin]     = useState<RoundRobinState>(data.roundRobin);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifications,  setNotifications]  = useState<NotificationItem[]>([]);

  // ── View mode ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"date" | "team">("date");

  // ── Modal visibility ──────────────────────────────────────────────────────
  const [showHearings,    setShowHearings]    = useState(false);
  const [showPostHrg,     setShowPostHrg]     = useState(false);
  const [showTeamStats,   setShowTeamStats]   = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadHearings = useCallback((f: HearingFilters) => {
    startTransition(async () => {
      const res = await getHearingsPaginated(f);
      setHearings(res.hearings);
      setTotalHearings(res.total);
      setTotalPages(res.total_pages);
    });
  }, []);

  useEffect(() => { loadHearings(filters); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh round robin + notifications every 30s ─────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      const [rr, notifs] = await Promise.all([getRoundRobinState(), getNotifications()]);
      setRoundRobin(rr);
      setNotifications(notifs);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Filter helpers ────────────────────────────────────────────────────────
  function applyFilter(patch: Partial<HearingFilters>) {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    loadHearings(next);
  }

  function goPage(p: number) {
    const next = { ...filters, page: p };
    setFilters(next);
    loadHearings(next);
  }

  // ── Row update handler ────────────────────────────────────────────────────
  async function handleUpdate(id: number, field: string, value: unknown) {
    const actions: Record<string, (v: unknown) => Promise<unknown>> = {
      medical_record_status:   (v) => updateMrStatus(id, v as string),
      hearing_decision_status: (v) => updateHearingDecisionStatus(id, v as string),
      mr_team:                 (v) => updateMrTeam(id, v as number | null),
      task_assigned:           (v) => toggleTaskAssigned(id, v as boolean),
      credited:                (v) => toggleCredited(id, v as boolean),
      manner_of_hearing:       (v) => updateMoa(id, v as string),
    };
    await actions[field]?.(value);
    setHearings((prev) => prev.map((h) => h.id === id ? { ...h, [field]: value } : h));
  }

  async function handleAssignJerome() {
    if (!confirm("Assign Jerome's Team to all urgent unassigned hearings (next 4 weeks)?")) return;
    const res = await assignJeromeUrgent();
    if (res.success) { alert(res.message); loadHearings(filters); }
  }

  // ── Group hearings ────────────────────────────────────────────────────────
  const groupedByMonth = hearings.reduce<Record<string, Hearing[]>>((acc, h) => {
    const key = h.hearing_date.slice(0, 7);
    (acc[key] ??= []).push(h);
    return acc;
  }, {});

  const groupedByTeam = hearings.reduce<Record<string, Hearing[]>>((acc, h) => {
    const key = h.mr_team_name ?? "Unassigned";
    (acc[key] ??= []).push(h);
    return acc;
  }, {});

  function toggleMonth(key: string) {
    setExpandedMonths((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleTeam(key: string) {
    setExpandedTeams((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function expandAll() {
    if (viewMode === "date") setExpandedMonths(new Set(Object.keys(groupedByMonth)));
    else setExpandedTeams(new Set(Object.keys(groupedByTeam)));
  }
  function collapseAll() {
    if (viewMode === "date") setExpandedMonths(new Set());
    else setExpandedTeams(new Set());
  }

  // ── Column headers (shared between both views) ────────────────────────────
  const columnHeaders = (
    <div
      className="grid gap-2 px-4 py-2 bg-muted text-foreground text-[9px] font-semibold uppercase tracking-wide flex-shrink-0 border-b border-border"
      style={{ gridTemplateColumns: "200px 120px 36px 90px 160px 36px 100px 70px 36px 70px 80px", minWidth: "1200px" }}
    >
      <div>Claimant</div><div>MR Specialist</div><div>Task</div><div>Date</div>
      <div>MR Status</div><div>Credited</div><div>Status</div><div>MOA</div>
      <div>5Day</div><div>Post HRG</div><div>Worksheet</div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <AppHeader title="Medical Records" subtitle="MR Status Tracking &amp; Analytics" />
      <DashboardNav userRole={userRole} />

      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">

        {/* ── Icon buttons (bell + refresh) ────────────────────────────── */}
        <div className="flex items-center justify-end gap-2">
          <NotificationBell
            notifications={notifications}
            onRefresh={async () => setNotifications(await getNotifications())}
          />
          <button
            onClick={() => loadHearings(filters)}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-border bg-card hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} className={cn("text-muted-foreground", isPending && "animate-spin")} />
          </button>
        </div>

        {/* ── Summary Section: [1fr 300px] — matches PHP structure exactly ─ */}
        {/* Left col: 6 status cards (3-col grid) + 2 assignment cards (flex) */}
        {/* Right col: Team Assignments sidebar spanning full height           */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* Left column */}
          <div>
            {/* 6 status summary cards — repeat(3, 1fr) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <SummaryCard label="Total Hearings" value={totalHearings}             bg="bg-gradient-to-br from-[#667eea] to-[#764ba2]" />
              <SummaryCard label="Complete"        value={data.statCards.complete}   bg="bg-gradient-to-br from-[#11998e] to-[#38ef7d]" />
              <SummaryCard label="In Progress"     value={data.statCards.inProgress} bg="bg-gradient-to-br from-[#4facfe] to-[#00f2fe]" />
              <SummaryCard label="Ready"           value={data.statCards.ready}      bg="bg-gradient-to-br from-[#56ab2f] to-[#a8e063]" />
              <SummaryCard label="Not Started"     value={data.statCards.notStarted} bg="bg-gradient-to-br from-[#f093fb] to-[#f5576c]" />
              <SummaryCard label="Urgent"          value={data.statCards.urgent}     bg="bg-gradient-to-br from-[#ff416c] to-[#ff4b2b]" />
            </div>
            {/* 2 assignment cards — flex row, compact with header+body */}
            <div className="flex gap-3">
              <AssignmentCard
                title="No Specialist"
                count={data.statCards.noSpecialistCount}
                nextHearing={data.statCards.nextUnassignedHearing}
                nextIcon="📅"
                gradientFrom="#667eea"
                gradientTo="#764ba2"
                availableYears={data.availableYears ?? []}
              />
              <AssignmentCard
                title="No Task Assigned"
                count={data.statCards.noTaskCount}
                nextHearing={data.statCards.nextUnassignedTask}
                nextIcon="☑️"
                gradientFrom="#11998e"
                gradientTo="#38ef7d"
                availableYears={data.availableYears ?? []}
              />
            </div>
          </div>

          {/* Right column: Team Assignments sidebar — spans full left height */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-muted/30 border-b border-border flex-shrink-0 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground">👥 Team Assignments</span>
            </div>
            <div className="px-2 py-1.5 space-y-0.5 overflow-y-auto flex-1" style={{ maxHeight: "200px" }}>
              {data.teamGrandTotals.map((t) => (
                <div key={t.team_name} className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.team_color ?? "#9ca3af" }} />
                    <span className="text-[10px] font-medium text-foreground">{t.team_name}</span>
                  </div>
                  <span className="text-[10px] font-bold tabular-nums text-foreground">{t.total}</span>
                </div>
              ))}
            </div>
            <div className="px-2 py-1.5 border-t border-border bg-muted/20 flex-shrink-0">
              <div className="flex items-center justify-between px-1.5">
                <span className="text-[10px] font-bold text-foreground">Grand Total</span>
                <span className="text-xs font-bold tabular-nums text-primary">
                  {data.teamGrandTotals.reduce((s, t) => s + t.total, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar (with RoundRobin at right end, matching PHP) ──────── */}
        <div className="bg-card border border-border rounded-xl px-4 py-3">
          <div className="flex flex-wrap gap-2 items-center">

            {/* Search */}
            <div className="relative min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search claimant…"
                value={filters.search ?? ""}
                onChange={(e) => applyFilter({ search: e.target.value })}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Sort order */}
            <Select
              value={filters.sort_order ?? "asc"}
              onValueChange={(v) => applyFilter({ sort_order: v as "asc" | "desc" })}
            >
              <SelectTrigger className="h-9 w-auto min-w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">📅 Date Asc</SelectItem>
                <SelectItem value="desc">📅 Date Desc</SelectItem>
              </SelectContent>
            </Select>

            {/* Month */}
            <Select
              value={filters.month_filter || "__all__"}
              onValueChange={(v) => applyFilter({ month_filter: v === "__all__" ? "" : v })}
            >
              <SelectTrigger className="h-9 w-auto min-w-36 text-xs">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Months</SelectItem>
                {data.availableMonths.map((m) => (
                  <SelectItem key={m.month_value} value={m.month_value}>{m.month_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Team */}
            <Select
              value={filters.team_filter || "__all__"}
              onValueChange={(v) => applyFilter({ team_filter: v === "__all__" ? "" : v })}
            >
              <SelectTrigger className="h-9 w-auto min-w-36 text-xs">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Teams</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {data.medical_teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.team_name}
                    {t.team_type === "leadership_lead" ? " 👑" : t.team_type === "leadership_asst" ? " ⭐" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* MR Status */}
            <Select
              value={filters.status_filter || "__all__"}
              onValueChange={(v) => applyFilter({ status_filter: v === "__all__" ? "" : v })}
            >
              <SelectTrigger className="h-9 w-auto min-w-36 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="unassigned">No Status</SelectItem>
                {data.medical_record_status_options.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Assignment */}
            <Select
              value={filters.assignment_filter || "__all__"}
              onValueChange={(v) => applyFilter({ assignment_filter: v === "__all__" ? "" : v })}
            >
              <SelectTrigger className="h-9 w-auto min-w-40 text-xs">
                <SelectValue placeholder="All Assignments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Assignments</SelectItem>
                <SelectItem value="no_specialist">No Specialist</SelectItem>
                <SelectItem value="no_task">No Task Assigned</SelectItem>
                <SelectItem value="no_both">No Specialist &amp; No Task</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear */}
            <button
              onClick={() => applyFilter({ search: "", month_filter: "", team_filter: "", status_filter: "", assignment_filter: "" })}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 transition-colors"
            >
              <RefreshCw size={11} /> Clear
            </button>

            {/* Round Robin — pushed to right end, matching PHP filter bar */}
            <div className="ml-auto">
              <RoundRobinBanner rr={roundRobin} />
            </div>
          </div>
        </div>

        {/* ── Main Hearings Card ────────────────────────────────────────── */}
        <div
          className="bg-card border border-border rounded-xl overflow-hidden flex flex-col"
          style={{ maxHeight: "min(calc(100vh - 240px), 75vh)" }}
        >
          {/* Card header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">📁 Hearings</span>
              <span className="text-xs text-muted-foreground tabular-nums">({totalHearings})</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
                {(["date", "team"] as const).map((v) => (
                  <button key={v} onClick={() => setViewMode(v)}
                    className={cn("px-3 py-1 text-[11px] font-medium rounded-md transition-all",
                      viewMode === v
                        ? "bg-card text-foreground shadow-sm border border-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}>
                    {v === "date" ? "📅 By Date" : "👥 By Team"}
                  </button>
                ))}
              </div>

              {/* Jerome assign — canEditMrTeam only */}
              {data.permissions.canEditMrTeam && data.jeromeTeamInfo && roundRobin.urgentUnassignedCount > 0 && (
                <button onClick={handleAssignJerome}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors">
                  <AlertTriangle size={12} />
                  <span className="hidden sm:inline">⚡ &lt;4wk Jerome</span>
                  <span className="sm:hidden">Jerome</span>
                  ({roundRobin.urgentUnassignedCount})
                </button>
              )}

              {/* Post HRG */}
              {data.postHrgCount > 0 && (
                <button onClick={() => setShowPostHrg(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-semibold transition-colors">
                  <FileText size={12} /> Post HRG ({data.postHrgCount})
                </button>
              )}
              <button onClick={() => setShowActivityLog(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors">
                <ClipboardList size={12} />
                <span className="hidden sm:inline">Activity Log</span>
                <span className="sm:hidden">Log</span>
              </button>

              <button onClick={() => setShowTeamStats(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors">
                <BarChart3 size={12} /> Stats
              </button>

              <button onClick={() => exportHearingsToCsv(hearings)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors">
                <Download size={12} /> Export
              </button>

              <button onClick={() => setShowHearings(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors">
                🔍 Details
              </button>

              <button onClick={expandAll}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors">
                + Expand
              </button>
              <button onClick={collapseAll}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold transition-colors">
                − Collapse
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="overflow-x-auto flex-shrink-0">
            {columnHeaders}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overflow-x-auto relative min-h-0">
            {isPending && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            )}

            {viewMode === "date" && Object.entries(groupedByMonth).map(([key, rows]) => (
              <div key={`month-${key}`}>
                <div
                  className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50 select-none"
                  style={{ minWidth: "1200px" }}
                  onClick={() => toggleMonth(key)}
                >
                  <span className="w-4 h-4 flex items-center justify-center bg-primary text-white rounded text-[9px] font-bold">
                    {expandedMonths.has(key) ? "−" : "+"}
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {new Date(key + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                  <span className="text-[10px] text-muted-foreground">({rows.length})</span>
                </div>
                {expandedMonths.has(key) && rows.map((h) => (
                  <HearingRow key={`mh-${h.id}`} h={h} teams={data.medical_teams}
                    mrStatusOptions={data.medical_record_status_options}
                    hearingDecisionOptions={data.hearing_decision_status_options}
                    mannerOptions={data.manner_options}
                    permissions={data.permissions}
                    onUpdate={handleUpdate} />
                ))}
              </div>
            ))}

            {viewMode === "team" && Object.entries(groupedByTeam).map(([key, rows]) => (
              <div key={`team-${key}`}>
                <div
                  className="flex items-center gap-3 px-4 py-2 border-b border-border cursor-pointer hover:bg-muted/50 select-none bg-card"
                  style={{ minWidth: "1200px" }}
                  onClick={() => toggleTeam(key)}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-[9px] text-muted-foreground">
                    {expandedTeams.has(key) ? "▼" : "▶"}
                  </span>
                  <span className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: teamHex(rows[0]?.mr_team_color) }} />
                  <span className="text-xs font-semibold text-foreground">{key}</span>
                  <span className="text-[10px] text-muted-foreground">({rows.length})</span>
                </div>
                {expandedTeams.has(key) && rows.map((h) => (
                  <HearingRow key={`th-${h.id}`} h={h} teams={data.medical_teams}
                    mrStatusOptions={data.medical_record_status_options}
                    hearingDecisionOptions={data.hearing_decision_status_options}
                    mannerOptions={data.manner_options}
                    permissions={data.permissions}
                    onUpdate={handleUpdate} />
                ))}
              </div>
            ))}

            {!isPending && hearings.length === 0 && (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                No hearings match the current filters.
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-t border-border bg-muted/20 flex-shrink-0">
            <span className="text-[11px] text-muted-foreground">
              Showing {((filters.page ?? 1) - 1) * (filters.per_page as number) + 1}–{Math.min(
                (filters.page ?? 1) * (filters.per_page as number), totalHearings
              )} of {totalHearings}
            </span>
            <div className="flex items-center gap-2">
              <select value={filters.per_page}
                onChange={(e) => applyFilter({ per_page: Number(e.target.value), page: 1 })}
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground cursor-pointer">
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
                <option value={200}>200/page</option>
                <option value={500}>500/page</option>
              </select>
              <button onClick={() => goPage((filters.page ?? 1) - 1)} disabled={(filters.page ?? 1) <= 1}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold disabled:opacity-40 transition-colors">
                ← Prev
              </button>
              <span className="text-[11px] text-muted-foreground">Page {filters.page} of {totalPages}</span>
              <button onClick={() => goPage((filters.page ?? 1) + 1)} disabled={(filters.page ?? 1) >= totalPages}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 transition-colors">
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom Grid: Pivot + Assigned by Month ────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 sm:gap-5">

          {/* MR Status Pivot */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-sm font-bold text-foreground">📊 Medical Records Status</span>
              <button onClick={() => exportPivotToCsv(data.mrStatusByTeam)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors">
                <Download size={12} /> Export CSV
              </button>
            </div>
            <div className="overflow-auto max-h-96">
              <MrStatusPivot rows={data.mrStatusByTeam} />
            </div>
          </div>

          {/* Assigned by Month */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-sm font-bold text-foreground">📅 Assigned Cases by Month</span>
            </div>
            <div className="p-4 overflow-y-auto max-h-96">
              <AssignedByMonth rows={data.groupedAssigned} />
            </div>
          </div>
        </div>

      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <HearingsModal
        open={showHearings}
        onClose={() => setShowHearings(false)}
        teams={data.medical_teams}
        mrStatusOptions={data.medical_record_status_options}
        hearingDecisionOptions={data.hearing_decision_status_options}
        mannerOptions={data.manner_options}
        availableMonths={data.availableMonths}
        permissions={data.permissions}
      />
      <PostHrgModal
        open={showPostHrg}
        onClose={() => setShowPostHrg(false)}
        teams={data.medical_teams}
        mrStatusOptions={data.medical_record_status_options}
      />
      <TeamStatsModal
        open={showTeamStats}
        onClose={() => setShowTeamStats(false)}
      />
      {showActivityLog && (
        <ActivityLogModal onClose={() => setShowActivityLog(false)} />
      )}
    </>
  );
}
