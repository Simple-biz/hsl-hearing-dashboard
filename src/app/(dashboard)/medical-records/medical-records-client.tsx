"use client";

import {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Input } from "@/components/ui/input";
import { ClaimantCopyButton } from "@/components/ui/claimant-copy-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Download,
  Loader2,
  X,
  BarChart3,
  FileText,
  ClipboardList,
  AlertTriangle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "./types";

import {
  getHearingsPaginated,
  getWithdrawnHearings,
  updateMrStatus,
  updateHearingDecisionStatus,
  updateMrTeam,
  toggleTaskAssigned,
  toggleCredited,
  updateMoa,
  updateWorksheetLink,
  assignJeromeUrgent,
  getRoundRobinState,
} from "./action";
import type {
  MrPivotPageData,
  Hearing,
  HearingFilters,
  RoundRobinState,
  MrStatusByTeam,
  AssignedByMonthRow,
} from "./action";

import { HearingsModal } from "@/components/modals/hearings-modal";
import { PostHrgModal } from "@/components/modals/post-hrg-modal";
import { PostHrgReviewModal } from "@/components/modals/post-hrg-review-modal";
import { TeamStatsModal } from "@/components/modals/team-stats-modal";
import { ActivityLogModal } from "@/components/modals/activity-log-modal";
import { PAGE_ACTION_SCOPES } from "@/lib/activity-avatar";
import { MedicalRecordsDetailPanel } from "./medical-records-detail-panel";

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
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  red: "#ef4444",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
  cyan: "#06b6d4",
};

function teamHex(color: string | null | undefined): string {
  if (!color) return "#9ca3af";
  return TEAM_HEX[color] ?? color;
}

function fmtTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const [hStr, mStr] = raw.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  if (isNaN(h)) return raw;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

// Theme-safe status badge classes (no hardcoded light-only colours)
// Text-only color maps — bg is always bg-card; only text + border-current changes

// Badge maps (read-only display — keeps bg+text for spans)
const MR_STATUS_CLS: Record<string, string> = {
  Complete:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "In Progress":
    "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  Ready: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Not Started": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "URGENT! NEEDS ATTENTION": "bg-red-700 text-white font-semibold",
  WITHDRAWAL:
    "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-700 dark:text-zinc-400",
};

const HRG_STATUS_CLS: Record<string, string> = {
  Scheduled:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Favorable:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Unfavorable:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Post HRG Review/ Dev":
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  Continued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  "Pending Decision":
    "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "OTR at Hrg": "bg-green-700 text-white",
  Dismissal: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const MOA_CLS: Record<string, string> = {
  "Get Phone Permission":
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "Case is Ready":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "In Person Florida":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Phone:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  OVH: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function exportToCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHearingsToCsv(hearings: Hearing[]) {
  const headers = [
    "ID",
    "Claimant",
    "Rep",
    "Hearing Date",
    "Time",
    "MR Team",
    "MR Status",
    "HRG Decision",
    "MOA",
    "Task",
    "Credited",
    "5-Day",
    "Post HRG",
    "Worksheet",
  ];
  const rows = hearings.map((h) => [
    h.id,
    h.claimant,
    h.rep_name ?? "",
    h.hearing_date,
    fmtTime(h.converted_time_est) ?? "",
    h.mr_team_name ?? "",
    h.medical_record_status ?? "",
    h.hearing_decision_status ?? "",
    h.manner_of_appearance ?? "",
    h.task_assigned ? "Yes" : "No",
    h.credited ? "Yes" : "No",
    h.five_day_notice ? "Yes" : "No",
    h.post_hrg_review ?? "",
    h.medical_record_link ?? "",
  ]);
  exportToCsv(`hearings-export-${new Date().toISOString().slice(0, 10)}.csv`, [
    headers,
    ...rows,
  ] as string[][]);
}

function exportPivotToCsv(rows: MrStatusByTeam[]) {
  const headers = ["MR Specialist", ...STATUS_COLUMNS, "Grand Total"];
  const dataRows = rows.map((r) => {
    const rowTotal = STATUS_COLUMNS.reduce(
      (s, col) => s + (r.statuses[col] ?? 0),
      0,
    );
    return [
      r.team,
      ...STATUS_COLUMNS.map((col) => r.statuses[col] ?? 0),
      rowTotal,
    ];
  });
  exportToCsv(`mr-status-pivot-${new Date().toISOString().slice(0, 10)}.csv`, [
    headers,
    ...dataRows,
  ] as string[][]);
}

// ─── PostHrgReviewBadge ───────────────────────────────────────────────────────
// Mirrors the Post HRG cell on the dashboard / post-hrg-development pages:
// shows the deadline (color-coded: red ⚠️ overdue, blue 📅 upcoming) when one
// is set, falls back to a "Notes" pill when a review note exists, else "+ Add".
// MR rows are hearing-mode, so the deadline source is hearings.post_hrg_deadline.

// `post_hrg_deadline` is typed string|null but a Postgres `date` can arrive as
// a JS Date; normalize to a local YYYY-MM-DD string before formatting.
function toYmd(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // A Postgres `date` arrives as a JS Date at UTC midnight — use the UTC
    // parts so a negative-UTC (US) browser doesn't read it as the prior day.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function PostHrgReviewBadge({
  h,
  onClick,
}: {
  h: Hearing;
  onClick: () => void;
}) {
  const ymd = toYmd(h.post_hrg_deadline);
  const hasNotes = !!h.post_hrg_review;

  let badgeClass =
    "border-border text-muted-foreground hover:bg-muted bg-transparent";
  let icon = "📝";
  let text = "+ Add";

  if (ymd) {
    const dd = new Date(ymd + "T12:00:00");
    const today = new Date(
      new Date().toISOString().split("T")[0] + "T12:00:00",
    );
    const fmt = dd.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (dd < today) {
      badgeClass =
        "bg-red-100 border-red-300 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400";
      icon = "⚠️";
      text = fmt;
    } else {
      badgeClass =
        "bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400";
      icon = "📅";
      text = fmt;
    }
  } else if (hasNotes) {
    badgeClass =
      "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300";
    icon = "📝";
    text = "Notes";
  }

  return (
    <button
      onClick={onClick}
      title={
        ymd
          ? `Deadline ${text} — Click to view`
          : hasNotes
            ? "Post HRG notes — Click to view"
            : "Click to add"
      }
      className={cn(
        "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap font-semibold",
        badgeClass,
      )}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </button>
  );
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  bg,
  onClick,
  compact,
  className,
}: {
  label: string;
  value: number | string;
  bg: string;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl text-white flex flex-col gap-1",
        compact ? "p-2.5" : "p-4 sm:p-5",
        bg,
        onClick && "cursor-pointer hover:opacity-90 transition-opacity",
        className,
      )}
    >
      <div
        className={cn(
          "absolute -right-4 -top-4 rounded-full bg-white/10",
          compact ? "h-16 w-16" : "h-24 w-24",
        )}
      />
      <div className="relative z-10">
        <p
          className={cn(
            "font-semibold tracking-widest uppercase opacity-80 mb-0.5",
            compact ? "text-[9px]" : "text-[10px]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "font-bold tabular-nums leading-none",
            compact ? "text-2xl sm:text-3xl" : "text-2xl sm:text-3xl",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── AssignmentCard ───────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function AssignmentCard({
  title,
  count,
  nextHearing,
  nextIcon,
  gradientFrom,
  gradientTo,
  availableYears,
}: {
  title: string;
  count: number;
  nextHearing: { claimant: string; hearing_date: string } | null;
  nextIcon?: string;
  gradientFrom: string;
  gradientTo: string;
  availableYears: number[];
}) {
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const dateStr = nextHearing
    ? new Date(nextHearing.hearing_date + "T00:00:00").toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" },
      )
    : null;

  return (
    <div className="rounded-xl border border-border overflow-hidden w-full flex flex-col flex-1">
      {/* Colored header: title left, count right */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white">
          {title}
        </span>
        <span className="text-2xl font-bold text-white tabular-nums leading-none">
          {count}
        </span>
      </div>
      {/* Card body: year+month selects + next indicator */}
      <div className="px-3 py-2 bg-card flex-1 flex flex-col justify-between">
        <div className="flex gap-1.5 mb-2">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="flex-1 text-[10px] px-1.5 py-1 border border-border rounded bg-card text-foreground cursor-pointer"
          >
            <option value="">All Years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="flex-1 text-[10px] px-1.5 py-1 border border-border rounded bg-card text-foreground cursor-pointer"
          >
            <option value="">All Months</option>
            {MONTH_LABELS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1.5 border-t border-border min-w-0">
          {dateStr ? (
            <>
              <span className="shrink-0">{nextIcon ?? "📅"}</span>
              <span className="font-semibold text-primary shrink-0">
                {dateStr}
              </span>
              <span className="text-[10px] truncate">
                — {nextHearing!.claimant.slice(0, 14)}…
              </span>
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
      <span className="text-muted-foreground font-semibold text-[11px]">
        LAST:
      </span>
      <span
        className="px-2 py-0.5 rounded font-semibold text-white text-[11px]"
        style={{ backgroundColor: teamHex(rr.lastColor) }}
      >
        {rr.lastTeamName}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="text-muted-foreground font-semibold text-[11px]">
        NEXT:
      </span>
      <span
        className="px-2 py-0.5 rounded font-semibold text-white text-[11px] ring-2 ring-offset-1"
        style={{ backgroundColor: teamHex(rr.nextColor) }}
      >
        {rr.nextTeamName}
      </span>
      <div className="hidden sm:flex gap-1 items-center">
        {rr.rotationOrder.map((c) => (
          <span
            key={c}
            className={cn(
              "w-2 h-2 rounded-full transition-transform",
              c === rr.nextColor ? "scale-125" : "opacity-30",
            )}
            style={{ backgroundColor: teamHex(c) }}
          />
        ))}
      </div>
      {rr.nextUnassignedHearing && (
        <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-border">
          <span className="text-primary">📅</span>
          <span className="font-semibold text-foreground text-[11px]">
            {new Date(
              rr.nextUnassignedHearing.hearing_date + "T00:00:00",
            ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <span className="text-muted-foreground text-[10px] truncate max-w-25">
            — {rr.nextUnassignedHearing.claimant.slice(0, 14)}…
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Shared set-toggle utility ────────────────────────────────────────────────
// Used by AssignedByMonth row toggle, toggleMonth, and toggleTeam —
// all share the identical "flip key membership in a Set" pattern.
function toggleSetKey(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return next;
  });
}

// ─── MrStatusPivot ────────────────────────────────────────────────────────────

function MrStatusPivot({ rows }: { rows: MrStatusByTeam[] }) {
  const columnTotals = STATUS_COLUMNS.reduce<Record<string, number>>(
    (acc, col) => {
      acc[col] = rows.reduce((s, r) => s + (r.statuses[col] ?? 0), 0);
      return acc;
    },
    {},
  );
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
              <th
                key={col}
                className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap text-foreground"
              >
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
            const rowTotal = STATUS_COLUMNS.reduce(
              (s, col) => s + (row.statuses[col] ?? 0),
              0,
            );
            return (
              <tr
                key={row.team}
                className="border-b border-border hover:bg-muted/30 transition-colors"
              >
                <td className="px-3 py-2 font-semibold text-foreground">
                  {row.color && (
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: teamHex(row.color) }}
                    />
                  )}
                  {row.team}
                </td>
                {STATUS_COLUMNS.map((col) => {
                  const v = row.statuses[col] ?? 0;
                  const isUrgent = col === "URGENT! NEEDS ATTENTION";
                  const isComplete = col === "Complete";
                  return (
                    <td
                      key={col}
                      className={cn(
                        "px-3 py-2 text-center tabular-nums",
                        v === 0
                          ? "text-muted-foreground/30"
                          : isUrgent
                            ? "text-red-600 font-bold"
                            : isComplete
                              ? "text-purple-600 dark:text-purple-400 font-semibold"
                              : "text-foreground",
                      )}
                    >
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
            <td className="px-3 py-2 text-foreground text-[11px] uppercase tracking-wide">
              Column Totals
            </td>
            {STATUS_COLUMNS.map((col) => (
              <td
                key={col}
                className={cn(
                  "px-3 py-2 text-center tabular-nums text-sm",
                  col === "URGENT! NEEDS ATTENTION"
                    ? "text-red-600"
                    : col === "Complete"
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-foreground",
                )}
              >
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
    toggleSetKey(setExpanded, key);
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground font-semibold px-1 mb-2">
        Grand Total: {grandTotal}
      </div>
      {rows.map((row) => (
        <div key={row.month_key}>
          <button
            onClick={() => toggle(row.month_key)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px]">
                {expanded.has(row.month_key) ? "▼" : "▶"}
              </span>
              <span className="text-xs font-semibold text-foreground">
                {row.month_label}
              </span>
            </div>
            <span className="text-xs font-bold tabular-nums text-foreground">
              {row.total}
            </span>
          </button>
          {expanded.has(row.month_key) && (
            <div className="ml-4 mt-1 space-y-0.5">
              {row.teams.map((t) => (
                <div
                  key={t.team_name}
                  className="flex items-center justify-between px-3 py-1.5 rounded border-l-2"
                  style={{ borderColor: teamHex(t.team_color) }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: teamHex(t.team_color) }}
                    />
                    <span className="text-xs text-foreground">
                      {t.team_name}
                    </span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {t.case_count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── WorksheetLinkModal ───────────────────────────────────────────────────────

function WorksheetLinkModal({
  hearing,
  onClose,
  onSaved,
}: {
  hearing: Hearing;
  onClose: () => void;
  onSaved: (id: number, link: string) => void;
}) {
  const [link, setLink] = useState(hearing.medical_record_link ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateWorksheetLink(hearing.id, link);
    onSaved(hearing.id, link);
    setSaving(false);
    onClose();
  }

  async function handleRemove() {
    if (!confirm("Remove the MR Worksheet link for this hearing?")) return;
    setSaving(true);
    await updateWorksheetLink(hearing.id, "");
    onSaved(hearing.id, "");
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
          <h3 className="text-sm font-semibold">📄 Medical Record Link</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {hearing.claimant}
            </span>
            {hearing.hearing_date && (
              <>
                {" "}
                ·{" "}
                {new Date(
                  hearing.hearing_date + "T00:00:00",
                ).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </>
            )}
          </p>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
              Google Sheet URL
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/…"
              className="w-full text-xs rounded-lg border border-border bg-muted px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div>
            {hearing.medical_record_link && (
              <button
                onClick={handleRemove}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 flex items-center gap-1"
            >
              {saving && <Loader2 size={10} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WithdrawnModal ────────────────────────────────────────────────────────────

function WithdrawnModal({
  open,
  count,
  // teams,
  onClose,
  userName,
  userRole,
}: {
  open: boolean;
  count: number;
  teams: MrPivotPageData["medical_teams"];
  onClose: () => void;
  userName: string;
  userRole: UserRole;
}) {
  const [entries, setEntries] = useState<Hearing[]>([]);
  const [total, setTotal] = useState(count);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, startTransition] = useTransition();
  const [postHrgHearing, setPostHrgHearing] = useState<Hearing | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p: number, q: string) => {
    startTransition(async () => {
      const r = await getWithdrawnHearings({
        page: p,
        search: q,
        per_page: 50,
      });
      setEntries(r.hearings);
      setTotal(r.total);
      setTotalPages(r.total_pages);
    });
  }, []);

  useEffect(() => {
    if (open) load(1, "");
  }, [open, load]);

  function handleSearch(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      load(1, v);
    }, 300);
  }

  function exportCsv() {
    const headers = [
      "Month",
      "Hearing Date",
      "Time",
      "Claimant",
      "Rep",
      "MR Team",
      "MR Status",
      "Status",
      "Post HRG",
      "Link",
    ];
    const rows = entries.map((h) => {
      const d = new Date(h.hearing_date + "T00:00:00");
      return [
        d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        fmtTime(h.converted_time_est) ?? "",
        h.claimant,
        h.rep_name ?? "",
        h.mr_team_name ?? "Unassigned",
        h.medical_record_status ?? "",
        h.hearing_decision_status ?? "",
        h.post_hrg_review ? "Yes" : "",
        h.medical_record_link ?? "",
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "withdrawn-hearings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-3.5 shrink-0">
          <span className="text-sm font-bold text-foreground">
            🔴 Withdrawn Hearings ({total})
          </span>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-muted-foreground italic hidden sm:block">
              Excluded from statistics and main view
            </p>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
            >
              <Download size={11} /> CSV
            </button>
            <button
              onClick={onClose}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border-b px-4 py-2 shrink-0">
          <Search size={13} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search claimant…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
                load(1, "");
              }}
            >
              <X
                size={12}
                className="text-muted-foreground hover:text-foreground"
              />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-[11px]" style={{ minWidth: "920px" }}>
            <thead>
              <tr className="bg-muted border-b sticky top-0">
                {[
                  "Month",
                  "Hearing Date",
                  "Time",
                  "Claimant",
                  "Rep",
                  "MR Team",
                  "MR Status",
                  "Status",
                  "Post HRG",
                  "Link",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wide whitespace-nowrap text-center"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center">
                    <Loader2
                      size={20}
                      className="animate-spin mx-auto text-muted-foreground"
                    />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No withdrawn hearings found.
                  </td>
                </tr>
              ) : (
                entries.map((h) => {
                  const d = new Date(h.hearing_date + "T00:00:00");
                  const teamColor = h.mr_team_id
                    ? teamHex(h.mr_team_color)
                    : "#e5e7eb";
                  const teamText = h.mr_team_id ? "#fff" : "#374151";
                  return (
                    <tr
                      key={h.id}
                      className={cn(
                        "border-b border-border/40",
                        // Hover overlay — matches the PHD / dashboard /
                        // rep-docs tables. Translucent blue inset box-shadow
                        // applied to every direct <td> via arbitrary variant.
                        "[&>td]:transition-shadow [&>td]:duration-150",
                        "hover:[&>td]:shadow-[inset_0_0_0_9999px_rgb(59_130_246/0.10)]",
                        "dark:hover:[&>td]:shadow-[inset_0_0_0_9999px_rgb(96_165_250/0.18)]",
                      )}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap text-center">
                        {d.toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap text-center">
                        {d.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap text-center">
                        {fmtTime(h.converted_time_est) || "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="font-semibold text-foreground">
                          {h.claimant}
                        </div>
                        {h.rep_name && (
                          <div className="text-[9px] text-muted-foreground">
                            {h.rep_name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-[10px] text-muted-foreground max-w-20 truncate text-center">
                        {h.rep_name ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {h.mr_team_name ? (
                          <span
                            className="inline-block text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                            style={{
                              backgroundColor: teamColor,
                              color: teamText,
                            }}
                          >
                            {h.mr_team_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {h.medical_record_status ? (
                          <span
                            className={cn(
                              "inline-block text-[9px] px-1.5 py-0.5 rounded",
                              MR_STATUS_CLS[h.medical_record_status] ??
                                "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                            )}
                          >
                            {h.medical_record_status}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-[10px] text-muted-foreground text-center">
                        {h.hearing_decision_status ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <PostHrgReviewBadge
                          h={h}
                          onClick={() => setPostHrgHearing(h)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        {h.medical_record_link ? (
                          <a
                            href={h.medical_record_link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded hover:bg-blue-700"
                          >
                            📋
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground hover:text-foreground cursor-default">
                            + Link
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-2.5 shrink-0 bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            {total > 0
              ? `Showing ${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total}`
              : "No results"}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                load(p, search);
              }}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"
            >
              ← Prev
            </button>
            <span className="text-[11px] text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                load(p, search);
              }}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
      {postHrgHearing && (
        <PostHrgReviewModal
          mode="hearing"
          hearingId={postHrgHearing.id}
          claimant={postHrgHearing.claimant ?? ""}
          hearingDateText={new Date(
            postHrgHearing.hearing_date + "T00:00:00",
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          assignedRep={postHrgHearing.rep_name}
          userName={userName}
          userRole={userRole}
          initialNotes={null}
          initialDeadline={postHrgHearing.post_hrg_deadline}
          initialRequirements={null}
          initialDeadlinePrev={null}
          initialDeadlineChangedBy={null}
          onClose={() => setPostHrgHearing(null)}
          onHearingPatch={(patch) => {
            const mrPatch: Partial<Hearing> = {};
            if (patch.post_hrg_deadline !== undefined) {
              mrPatch.post_hrg_deadline = patch.post_hrg_deadline;
            }
            if (patch.post_hrg_review !== undefined) {
              mrPatch.post_hrg_review = patch.post_hrg_review ? "true" : null;
            }
            setEntries((prev) =>
              prev.map((h) =>
                h.id === postHrgHearing.id ? { ...h, ...mrPatch } : h,
              ),
            );
            setPostHrgHearing((h) =>
              h && h.id === postHrgHearing.id ? { ...h, ...mrPatch } : h,
            );
          }}
        />
      )}
    </div>
  );
}

// ─── HearingRow ───────────────────────────────────────────────────────────────
// Inline selects/checkboxes inside the fixed-column data grid stay as native
// HTML elements intentionally — shadcn Select would break the compact layout.

// Shared grid template — must match columnHeaders exactly.
// Month(120) | MR Specialist(150) | Task(52) | Date(96) | Claimant(200) |
// MR Status(160) | Credited(60) | Status(120) | MOA(110) | 5Day(48) | Post HRG(110) | MR Worksheet(130)
const GRID_COLS =
  "200px 1.2fr 70px 110px 1.5fr 1.2fr 60px 1fr 100px 48px 100px 120px";
const MIN_W = "1280px";

function HearingRow({
  h,
  teams,
  mrStatusOptions,
  hearingDecisionOptions,
  mannerOptions,
  permissions,
  onUpdate,
  onOpenPostHrg,
  onOpenWorksheet,
  onRowClick,
}: {
  h: Hearing;
  teams: MrPivotPageData["medical_teams"];
  mrStatusOptions: string[];
  hearingDecisionOptions: string[];
  mannerOptions: string[];
  permissions: MrPivotPageData["permissions"];
  onUpdate: (id: number, field: string, value: unknown) => void;
  onOpenPostHrg: (h: Hearing) => void;
  onOpenWorksheet: (h: Hearing) => void;
  onRowClick: (h: Hearing) => void;
}) {
  const dateStr = new Date(h.hearing_date + "T00:00:00").toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );

  const mrCls =
    MR_STATUS_CLS[h.medical_record_status ?? ""] ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  const hrgCls =
    HRG_STATUS_CLS[h.hearing_decision_status ?? ""] ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  const moaCls =
    MOA_CLS[h.manner_of_appearance ?? ""] ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <div
      className="grid gap-x-2 px-4 border-b border-border/40 cursor-pointer transition-colors text-[11px] items-center hover:bg-blue-500/10 dark:hover:bg-blue-400/15"
      style={{
        gridTemplateColumns: GRID_COLS,
        minWidth: MIN_W,
        height: "44px",
      }}
      onClick={(e) => {
        // Open the detail panel on row click, but ignore clicks on the
        // inline editors / buttons / links inside the row.
        const tag = (e.target as HTMLElement).tagName;
        if (
          ["INPUT", "SELECT", "OPTION", "BUTTON", "A", "SVG", "PATH"].includes(
            tag,
          )
        )
          return;
        onRowClick(h);
      }}
    >
      {/* Month — blank spacer in data rows */}
      <div />

      {/* MR Specialist — colored pill select */}
      {permissions.canEditMrTeam ? (
        <select
          className="w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer font-medium [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100"
          style={{
            backgroundColor: !h.mr_team_id
              ? "#9ca3af"
              : h.mr_team_type === "leadership_lead" ||
                  h.mr_team_type === "leadership_asst"
                ? "#ffffff"
                : teamHex(h.mr_team_color),
            color: !h.mr_team_id
              ? "#fff"
              : h.mr_team_type === "leadership_lead" ||
                  h.mr_team_type === "leadership_asst"
                ? "#1f2937"
                : "#fff",
          }}
          value={h.mr_team_id ?? ""}
          onChange={(e) =>
            onUpdate(
              h.id,
              "mr_team",
              e.target.value ? Number(e.target.value) : null,
            )
          }
        >
          <option value="" className="text-muted-foreground bg-card">
            Unassigned
          </option>
          {teams
            .filter((t) => (t.team_type as string) !== "shared")
            .map((t) => (
              <option
                key={t.id}
                value={t.id}
                className="text-foreground bg-card"
              >
                {t.team_name}
              </option>
            ))}
        </select>
      ) : (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-medium"
          style={{
            backgroundColor: teamHex(h.mr_team_color),
            color: h.mr_team_id ? "#fff" : "#6b7280",
          }}
        >
          {h.mr_team_name ?? "—"}
        </span>
      )}

      {/* Task Assigned — checkbox centered */}
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={h.task_assigned}
          disabled={!permissions.canEditTask}
          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer disabled:cursor-default"
          onChange={(e) => onUpdate(h.id, "task_assigned", e.target.checked)}
        />
      </div>

      {/* Hearing Date — date + time stacked, centered */}
      <div className="text-center">
        <div className="text-foreground font-medium">{dateStr}</div>
        {h.converted_time_est && (
          <div className="text-[9px] text-muted-foreground">
            {fmtTime(h.converted_time_est)}
          </div>
        )}
      </div>

      {/* Claimant — hyperlinked name if claimant_link exists + rep below */}
      <div className="min-w-0">
        <div className="font-semibold truncate flex items-center gap-1">
          {h.claimant_link ? (
            <a
              href={h.claimant_link}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 hover:text-blue-400 underline truncate"
            >
              {h.claimant}
            </a>
          ) : (
            <span className="text-foreground truncate">{h.claimant}</span>
          )}
          <ClaimantCopyButton name={h.claimant} />
          {h.mr_team_id && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: teamHex(h.mr_team_color) }}
            />
          )}
        </div>
        {(h.rep_name || h.chronicle_link) && (
          <div className="text-[9px] text-muted-foreground truncate flex items-center gap-1">
            {h.rep_name && <span className="truncate">{h.rep_name}</span>}
            {h.rep_name && h.chronicle_link && (
              <span className="text-border">·</span>
            )}
            {h.chronicle_link && (
              <a
                href={h.chronicle_link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-violet-600 hover:underline dark:text-violet-400"
              >
                Chronicle
              </a>
            )}
          </div>
        )}
      </div>

      {/* MR Status — colored pill select */}
      {permissions.canEditMrStatus ? (
        <select
          value={h.medical_record_status ?? ""}
          className={cn(
            "w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100",
            h.medical_record_status ? mrCls : "bg-card text-muted-foreground",
          )}
          onChange={(e) =>
            onUpdate(h.id, "medical_record_status", e.target.value)
          }
        >
          <option value="" className="text-muted-foreground bg-card">
            No Status
          </option>
          {mrStatusOptions.map((s) => (
            <option key={s} value={s} className="text-foreground bg-card">
              {s}
            </option>
          ))}
        </select>
      ) : (
        <span
          className={cn("inline-block text-[9px] px-1.5 py-0.5 rounded", mrCls)}
        >
          {h.medical_record_status ?? "No Status"}
        </span>
      )}

      {/* Credited — checkbox centered */}
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={h.credited}
          disabled={!permissions.canEditCredited}
          className="w-3.5 h-3.5 accent-blue-500 cursor-pointer disabled:cursor-default"
          onChange={(e) => onUpdate(h.id, "credited", e.target.checked)}
        />
      </div>

      {/* HRG Decision Status — colored badge select */}
      {permissions.canEditDecisionStatus ? (
        <select
          value={h.hearing_decision_status ?? ""}
          className={cn(
            "w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100",
            h.hearing_decision_status
              ? hrgCls
              : "bg-card text-muted-foreground",
          )}
          onChange={(e) =>
            onUpdate(h.id, "hearing_decision_status", e.target.value)
          }
        >
          <option value="" className="text-muted-foreground bg-card">
            — Status —
          </option>
          {hearingDecisionOptions.map((s) => (
            <option key={s} value={s} className="text-foreground bg-card">
              {s}
            </option>
          ))}
        </select>
      ) : (
        <span
          className={cn(
            "inline-block text-[9px] px-1.5 py-0.5 rounded",
            hrgCls,
          )}
        >
          {h.hearing_decision_status ?? "—"}
        </span>
      )}

      {/* MOA — dropdown select */}
      {permissions.canEditMoa ? (
        <select
          value={h.manner_of_appearance ?? ""}
          className={cn(
            "w-full text-[9px] px-1.5 py-1 rounded border-0 cursor-pointer [&>option]:bg-white [&>option]:text-black dark:[&>option]:bg-zinc-800 dark:[&>option]:text-zinc-100",
            h.manner_of_appearance ? moaCls : "bg-card text-muted-foreground",
          )}
          onChange={(e) =>
            onUpdate(h.id, "manner_of_appearance", e.target.value)
          }
        >
          <option value="" className="text-muted-foreground bg-card">
            —
          </option>
          {mannerOptions.map((m) => (
            <option key={m} value={m} className="text-foreground bg-card">
              {m}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-[9px] text-muted-foreground">
          {h.manner_of_appearance ?? "—"}
        </span>
      )}

      {/* 5-Day — checkbox centered */}
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={h.five_day_notice}
          disabled={!permissions.canEditFiveDay}
          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer disabled:cursor-default"
          onChange={(e) => onUpdate(h.id, "five_day_notice", e.target.checked)}
        />
      </div>

      {/* Post HRG — deadline-aware badge (matches dashboard / PHD pages) */}
      <div className="flex justify-center">
        <PostHrgReviewBadge h={h} onClick={() => onOpenPostHrg(h)} />
      </div>

      {/* MR Worksheet — 📄 opens link + ✏️ opens edit modal; "+ Link" when empty */}
      <div className="flex items-center justify-center gap-1.5">
        {h.medical_record_link ? (
          <>
            <a
              href={h.medical_record_link}
              target="_blank"
              rel="noreferrer"
              title="Open MR Worksheet"
              className="text-[15px] leading-none hover:opacity-70 transition-opacity"
            >
              📄
            </a>
            {permissions.canEditWorksheet && (
              <button
                onClick={() => onOpenWorksheet(h)}
                title="Edit MR Worksheet link"
                className="text-[15px] leading-none hover:opacity-70 transition-opacity"
              >
                ✏️
              </button>
            )}
          </>
        ) : permissions.canEditWorksheet ? (
          <button
            onClick={() => onOpenWorksheet(h)}
            className="text-[9px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
          >
            + Link
          </button>
        ) : (
          <span className="text-[9px] text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = MrPivotPageData & { userRole: UserRole; userName: string };

// ─── Main Component ───────────────────────────────────────────────────────────

export function MrPivotClient({ userRole, userName, ...data }: Props) {
  const router = useRouter();

  // Only sys admin, mr_admin, and mr_lead may see No Specialist / No Task Assigned cards
  const canViewAdminCards = (
    ["system_admin", "admin", "mr_admin", "mr_lead"] as UserRole[]
  ).includes(userRole);
  // Post HRG admin gets read-only access; hide cross-page navigation
  // (Patient Portal, RFC Docs) since those pages aren't in their scope.
  const isPostHearingAdmin = userRole === "post_hearing_admin";
  const [isPending, startTransition] = useTransition();

  // ── Portal mount guard ────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // ── Field update toast ────────────────────────────────────────────────────
  const [updateToast, setUpdateToast] = useState<string | null>(null);
  const updateToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TOAST_LABELS: Record<string, string> = {
    medical_record_status: "MR Status",
    hearing_decision_status: "Decision",
    mr_team: "MR Team",
    task_assigned: "Task Assigned",
    credited: "Credited",
    manner_of_appearance: "MOA",
    medical_record_link: "MR Worksheet",
    five_day_notice: "5-Day Notice",
    post_hrg_review: "Post HRG",
  };

  function showToast(field: string, value: unknown, claimant: string) {
    const label = TOAST_LABELS[field] ?? field.replace(/_/g, " ");
    let display = String(value ?? "cleared");

    if (["task_assigned", "credited", "five_day_notice"].includes(field))
      display = value ? "✓ checked" : "unchecked";
    else if (!value) display = "cleared";

    const msg = `${label} → ${display}${claimant ? ` • ${claimant}` : ""}`;

    if (updateToastTimer.current) clearTimeout(updateToastTimer.current);

    setUpdateToast(msg);
    updateToastTimer.current = setTimeout(() => setUpdateToast(null), 3000);
  }

  // ── Hearings ─────────────────────────────────────────────────────────────
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [totalHearings, setTotalHearings] = useState(
    data.statCards.totalHearings,
  );
  const [totalPages, setTotalPages] = useState(1);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<HearingFilters>({
    search: "",
    month_filter: "",
    team_filter: "",
    status_filter: "",
    assignment_filter: "",
    sort_order: "asc",
    page: 1,
    per_page: 50,
  });

  // ── Round robin ───────────────────────────────────────────────────────────
  const [roundRobin, setRoundRobin] = useState<RoundRobinState>(
    data.roundRobin,
  );

  // ── View mode ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"date" | "team">("date");

  // ── Modal visibility ──────────────────────────────────────────────────────
  const [showHearings, setShowHearings] = useState(false);
  const [showPostHrg, setShowPostHrg] = useState(false);
  const [showTeamStats, setShowTeamStats] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  // ── Per-row modal state ───────────────────────────────────────────────────
  const [postHrgHearing, setPostHrgHearing] = useState<Hearing | null>(null);
  const [worksheetHearing, setWorksheetHearing] = useState<Hearing | null>(
    null,
  );
  // Slide-over detail panel — opened on row click.
  const [detailPanel, setDetailPanel] = useState<Hearing | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadHearings = useCallback((f: HearingFilters) => {
    startTransition(async () => {
      const res = await getHearingsPaginated(f);
      setHearings(res.hearings);
      setTotalHearings(res.total);
      setTotalPages(res.total_pages);
    });
  }, []);

  useEffect(() => {
    loadHearings(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand months that contain search results
  useEffect(() => {
    if (!filters.search?.trim()) return;
    const matchedMonths = new Set(
      hearings.map((h) => h.hearing_date.slice(0, 7)),
    );
    if (matchedMonths.size > 0) setExpandedMonths(matchedMonths);
  }, [hearings, filters.search]);

  // ── Refresh round robin every 30s ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      const rr = await getRoundRobinState();
      setRoundRobin(rr);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

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
    const hearing = hearings.find((h) => h.id === id);
    const claimant = hearing?.claimant ?? "";

    const actions: Record<string, (v: unknown) => Promise<unknown>> = {
      medical_record_status: (v) => updateMrStatus(id, v as string),
      hearing_decision_status: (v) =>
        updateHearingDecisionStatus(id, v as string),
      mr_team: (v) => updateMrTeam(id, v as number | null),
      task_assigned: (v) => toggleTaskAssigned(id, v as boolean),
      credited: (v) => toggleCredited(id, v as boolean),
      manner_of_appearance: (v) => updateMoa(id, v as string),
      medical_record_link: (v) => updateWorksheetLink(id, v as string),
    };
    await actions[field]?.(value);

    // Show feedback toast
    showToast(field, value, claimant);

    // mr_team needs to update mr_team_id + derive mr_team_name/color from teams list
    if (field === "mr_team") {
      const teamId = value as number | null;
      const team = teamId
        ? data.medical_teams.find((t) => t.id === teamId)
        : null;
      setHearings((prev) =>
        prev.map((h) =>
          h.id === id
            ? {
                ...h,
                mr_team_id: teamId,
                mr_team_name: team?.team_name ?? null,
                mr_team_color: team?.team_color ?? null,
                mr_team_type: team?.team_type ?? null,
              }
            : h,
        ),
      );
      // Refresh round robin immediately so the indicator reflects the new assignment
      getRoundRobinState().then(setRoundRobin);
    } else {
      setHearings((prev) =>
        prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)),
      );
    }
  }

  async function handleAssignJerome() {
    if (
      !confirm(
        "Assign Jerome's Team to all urgent unassigned hearings (next 4 weeks)?",
      )
    )
      return;
    const res = await assignJeromeUrgent();
    if (res.success) {
      alert(res.message);
      loadHearings(filters);
    }
  }

  // ── Group hearings ────────────────────────────────────────────────────────
  const groupedByMonth = hearings.reduce<Record<string, Hearing[]>>(
    (acc, h) => {
      const key = h.hearing_date.slice(0, 7);
      (acc[key] ??= []).push(h);
      return acc;
    },
    {},
  );

  const groupedByTeam = hearings.reduce<Record<string, Hearing[]>>((acc, h) => {
    const key = h.mr_team_name ?? "Unassigned";
    (acc[key] ??= []).push(h);
    return acc;
  }, {});

  // ── Virtualizer — flatten visible items into a single array ───────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  // Manual refresh — re-pulls the current view (same `filters`, so search /
  // status / page / sort are preserved) and restores scroll on the next
  // frame so the user stays exactly where they were working.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    setRefreshing(true);
    try {
      const res = await getHearingsPaginated(filters);
      setHearings(res.hearings);
      setTotalHearings(res.total);
      setTotalPages(res.total_pages);
    } finally {
      setRefreshing(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollTop;
      });
    }
  }, [filters]);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const ROW_H = 44;
  const GROUP_H = 33;

  type FlatItem =
    | {
        kind: "group-date";
        key: string;
        count: number;
        completeCount: number;
        inProgressCount: number;
      }
    | {
        kind: "group-team";
        key: string;
        color: string | null;
        count: number;
        completeCount: number;
        inProgressCount: number;
      }
    | { kind: "row"; hearing: Hearing };

  const flatItems = useMemo<FlatItem[]>(() => {
    if (viewMode === "date") {
      return Object.entries(groupedByMonth).flatMap(([key, rows]) => {
        const completeCount = rows.filter(
          (h) => h.medical_record_status === "Complete",
        ).length;
        const inProgressCount = rows.filter(
          (h) => h.medical_record_status === "In Progress",
        ).length;
        const header: FlatItem = {
          kind: "group-date",
          key,
          count: rows.length,
          completeCount,
          inProgressCount,
        };
        if (!expandedMonths.has(key)) return [header];
        return [
          header,
          ...rows.map((h): FlatItem => ({ kind: "row", hearing: h })),
        ];
      });
    }
    return Object.entries(groupedByTeam).flatMap(([key, rows]) => {
      const color = rows[0]?.mr_team_color ?? null;
      const completeCount = rows.filter(
        (h) => h.medical_record_status === "Complete",
      ).length;
      const inProgressCount = rows.filter(
        (h) => h.medical_record_status === "In Progress",
      ).length;
      const header: FlatItem = {
        kind: "group-team",
        key,
        color,
        count: rows.length,
        completeCount,
        inProgressCount,
      };
      if (!expandedTeams.has(key)) return [header];
      return [
        header,
        ...rows.map((h): FlatItem => ({ kind: "row", hearing: h })),
      ];
    });
  }, [viewMode, groupedByMonth, groupedByTeam, expandedMonths, expandedTeams]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (flatItems[i]?.kind === "row" ? ROW_H : GROUP_H),
    overscan: 15,
  });

  function toggleMonth(key: string) {
    toggleSetKey(setExpandedMonths, key);
  }
  function toggleTeam(key: string) {
    toggleSetKey(setExpandedTeams, key);
  }
  function expandAll() {
    if (viewMode === "date")
      setExpandedMonths(new Set(Object.keys(groupedByMonth)));
    else setExpandedTeams(new Set(Object.keys(groupedByTeam)));
  }
  function collapseAll() {
    if (viewMode === "date") setExpandedMonths(new Set());
    else setExpandedTeams(new Set());
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <AppHeader
        title="Medical Records"
        subtitle="MR Status Tracking &amp; Analytics"
      />
      <div className="flex min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6">
        <DashboardNav userRole={userRole} />
        {/* ── Summary Section ──────────────────────────────────────────────── */}
        {/* Admin view  → 4 columns:
              Col 1: Total Hearings / In Progress / Ready   (compact)
              Col 2: Complete / Not Started / Urgent        (compact)
              Col 3: No Specialist / No Task Assigned       (admin only)
              Col 4: Team Assignments
            Non-admin → 3 columns (cols 1-2 normal size, col 3 = Team Assignments) */}
        <div
          className={cn(
            "grid gap-3 items-stretch",
            canViewAdminCards
              ? "grid-cols-1 lg:grid-cols-[1fr_1fr_220px_320px]"
              : "grid-cols-1 lg:grid-cols-[1fr_1fr_280px]",
          )}
        >
          {/* ── Col 1: Total Hearings / In Progress / Ready ── */}
          <div className="flex flex-col gap-3 h-full">
            <SummaryCard
              label="Total Hearings"
              value={totalHearings}
              bg="bg-gradient-to-br from-[#667eea] to-[#764ba2]"
              compact={canViewAdminCards}
              className="flex-1"
            />
            <SummaryCard
              label="In Progress"
              value={data.statCards.inProgress}
              bg="bg-gradient-to-br from-[#4facfe] to-[#00f2fe]"
              compact={canViewAdminCards}
              className="flex-1"
            />
            <SummaryCard
              label="Ready"
              value={data.statCards.ready}
              bg="bg-gradient-to-br from-[#56ab2f] to-[#a8e063]"
              compact={canViewAdminCards}
              className="flex-1"
            />
          </div>

          {/* ── Col 2: Complete / Not Started / Urgent ── */}
          <div className="flex flex-col gap-3 h-full">
            <SummaryCard
              label="Complete"
              value={data.statCards.complete}
              bg="bg-gradient-to-br from-[#11998e] to-[#38ef7d]"
              compact={canViewAdminCards}
              className="flex-1"
            />
            <SummaryCard
              label="Not Started"
              value={data.statCards.notStarted}
              bg="bg-gradient-to-br from-[#f093fb] to-[#f5576c]"
              compact={canViewAdminCards}
              className="flex-1"
            />
            <SummaryCard
              label="Urgent"
              value={data.statCards.urgent}
              bg="bg-gradient-to-br from-[#ff416c] to-[#ff4b2b]"
              compact={canViewAdminCards}
              className="flex-1"
            />
          </div>

          {/* ── Col 3: No Specialist / No Task Assigned (admin only) ── */}
          {canViewAdminCards && (
            <div className="flex flex-col gap-3 h-full">
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
          )}

          {/* ── Col 4 (admin) / Col 3 (non-admin): Team Assignments ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-muted/30 border-b border-border shrink-0">
              <span className="text-[11px] font-semibold text-foreground">
                👥 Team Assignments
              </span>
            </div>
            <div
              className="px-2 py-1.5 space-y-0.5 overflow-y-auto flex-1"
              style={{ maxHeight: "220px" }}
            >
              {data.teamGrandTotals.map((t) => (
                <div
                  key={t.team_name}
                  className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.team_color ?? "#9ca3af" }}
                    />
                    <span className="text-[10px] font-medium text-foreground">
                      {t.team_name}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold tabular-nums text-foreground">
                    {t.total}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-2 py-1.5 border-t border-border bg-muted/20 shrink-0">
              <div className="flex items-center justify-between px-1.5">
                <span className="text-[10px] font-bold text-foreground">
                  Grand Total
                </span>
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
            <div className="relative min-w-35">
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
              onValueChange={(v) =>
                applyFilter({ sort_order: v as "asc" | "desc" })
              }
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
              onValueChange={(v) =>
                applyFilter({ month_filter: v === "__all__" ? "" : v })
              }
            >
              <SelectTrigger className="h-9 w-auto min-w-36 text-xs">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Months</SelectItem>
                {data.availableMonths.map((m) => (
                  <SelectItem key={m.month_value} value={m.month_value}>
                    {m.month_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Team */}
            <Select
              value={filters.team_filter || "__all__"}
              onValueChange={(v) =>
                applyFilter({ team_filter: v === "__all__" ? "" : v })
              }
            >
              <SelectTrigger className="h-9 w-auto min-w-36 text-xs">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Teams</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {data.medical_teams
                  .filter((t) => (t.team_type as string) !== "shared")
                  .map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.team_name}
                      {t.team_type === "leadership_lead"
                        ? " 👑"
                        : t.team_type === "leadership_asst"
                          ? " ⭐"
                          : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* MR Status */}
            <Select
              value={filters.status_filter || "__all__"}
              onValueChange={(v) =>
                applyFilter({ status_filter: v === "__all__" ? "" : v })
              }
            >
              <SelectTrigger className="h-9 w-auto min-w-36 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                <SelectItem value="unassigned">No Status</SelectItem>
                {data.medical_record_status_options.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Assignment */}
            <Select
              value={filters.assignment_filter || "__all__"}
              onValueChange={(v) =>
                applyFilter({ assignment_filter: v === "__all__" ? "" : v })
              }
            >
              <SelectTrigger className="h-9 w-auto min-w-40 text-xs">
                <SelectValue placeholder="All Assignments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Assignments</SelectItem>
                <SelectItem value="no_specialist">No Specialist</SelectItem>
                <SelectItem value="no_task">No Task Assigned</SelectItem>
                <SelectItem value="no_both">
                  No Specialist &amp; No Task
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Clear */}
            <button
              onClick={() =>
                applyFilter({
                  search: "",
                  month_filter: "",
                  team_filter: "",
                  status_filter: "",
                  assignment_filter: "",
                })
              }
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 transition-colors"
            >
              <RefreshCw size={11} /> Clear
            </button>

            {/* Round Robin — pushed to right end, matching PHP filter bar */}
            <div className="ml-auto">
              <div className="flex items-center px-3 py-1.5 rounded-lg bg-muted/70 dark:bg-zinc-800 border border-border shadow-sm">
                <RoundRobinBanner rr={roundRobin} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Hearings Card ────────────────────────────────────────── */}
        <div
          className="bg-card border border-border rounded-xl overflow-hidden flex flex-col"
          style={{ maxHeight: "min(calc(100vh - 240px), 75vh)" }}
        >
          {/* Card header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                📁 Hearings
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({totalHearings})
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
                {(["date", "team"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className={cn(
                      "px-3 py-1 text-[11px] font-medium rounded-md transition-all",
                      viewMode === v
                        ? "bg-card text-foreground shadow-sm border border-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v === "date" ? "📅 By Date" : "👥 By Team"}
                  </button>
                ))}
              </div>

              {/* Jerome assign — canEditMrTeam only */}
              {data.permissions.canEditMrTeam &&
                data.jeromeTeamInfo &&
                roundRobin.urgentUnassignedCount > 0 && (
                  <button
                    onClick={handleAssignJerome}
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors"
                  >
                    <AlertTriangle size={12} />
                    <span className="hidden sm:inline">⚡ &lt;4wk Jerome</span>
                    <span className="sm:hidden">Jerome</span>(
                    {roundRobin.urgentUnassignedCount})
                  </button>
                )}

              {/* Post HRG */}
              {data.postHrgCount > 0 && (
                <button
                  onClick={() => setShowPostHrg(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-semibold transition-colors"
                >
                  <FileText size={12} /> Post HRG ({data.postHrgCount})
                </button>
              )}

              {/* Withdrawn */}
              {data.withdrawnCount > 0 && (
                <button
                  onClick={() => setShowWithdrawn(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                >
                  🔴 Withdrawn ({data.withdrawnCount})
                </button>
              )}
              {/* Patient Portal */}
              {!isPostHearingAdmin && (
                <a
                  href="/patient-portal"
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
                >
                  🏥 Patient Portal
                </a>
              )}

              {/* RFC Documents */}
              {!isPostHearingAdmin && (
                <button
                  onClick={() => router.push("/rfc")}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#6A4C93] hover:bg-[#5a3d80] text-white font-semibold transition-colors"
                >
                  <ClipboardList size={12} />
                  <span className="hidden sm:inline">RFC Docs</span>
                  <span className="sm:hidden">RFC</span>
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh table data without losing scroll, filters, or sort"
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-colors bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 hover:border-sky-300 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/50 dark:hover:border-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  size={12}
                  className={cn(refreshing && "animate-spin")}
                />
                <span className="hidden sm:inline">
                  {refreshing ? "Refreshing…" : "Refresh"}
                </span>
              </button>

              <button
                onClick={() => setShowActivityLog(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors"
              >
                <ClipboardList size={12} />
                <span className="hidden sm:inline">Activity Log</span>
                <span className="sm:hidden">Log</span>
              </button>

              <button
                onClick={() => setShowTeamStats(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors"
              >
                <BarChart3 size={12} /> Stats
              </button>

              <button
                onClick={() => exportHearingsToCsv(hearings)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
              >
                <Download size={12} /> Export
              </button>

              <button
                onClick={() => setShowHearings(true)}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
              >
                🔍 Details
              </button>

              <button
                onClick={expandAll}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
              >
                + Expand
              </button>
              <button
                onClick={collapseAll}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold transition-colors"
              >
                − Collapse
              </button>
            </div>
          </div>

          {/* Scrollable body + sticky header — single scroll container */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto relative min-h-0"
            onScroll={() => {
              if (!isScrolling) setIsScrolling(true);
              if (scrollTimer.current) clearTimeout(scrollTimer.current);
              scrollTimer.current = setTimeout(
                () => setIsScrolling(false),
                150,
              );
            }}
          >
            {/* Column headers — sticky so they stay visible */}
            <div
              className="grid gap-x-2 px-4 py-2.5 bg-muted text-foreground text-[9px] font-semibold uppercase tracking-wide shrink-0 border-b border-border items-center sticky top-0 z-5"
              style={{ gridTemplateColumns: GRID_COLS, minWidth: MIN_W }}
            >
              <div className="text-left font-bold whitespace-nowrap">
                {viewMode === "date" ? "Month" : "Team"}
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                MR Specialist
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                Task Assigned
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                Hearing Date
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                Claimant
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                MR Status
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                Credited
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                Status
              </div>
              <div className="text-center font-bold whitespace-nowrap">MOA</div>
              <div className="text-center font-bold whitespace-nowrap">
                5Day
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                Post HRG
              </div>
              <div className="text-center font-bold whitespace-nowrap">
                MR Worksheet
              </div>
            </div>
            {/* Full-page loader during server action transitions */}
            {isPending && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-10">
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            )}

            {/* Fast-scroll skeleton overlay — subtle, doesn't block interaction */}
            {isScrolling && !isPending && (
              <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5 bg-card/80 border border-border rounded-full px-2.5 py-1 shadow-sm pointer-events-none">
                <Loader2
                  size={11}
                  className="animate-spin text-muted-foreground"
                />
                <span className="text-[10px] text-muted-foreground">
                  Loading...
                </span>
              </div>
            )}

            {!isPending && hearings.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                No hearings match the current filters.
              </div>
            ) : (
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: "relative",
                  minWidth: MIN_W,
                }}
              >
                {virtualizer.getVirtualItems().map((vRow) => {
                  const item = flatItems[vRow.index];
                  if (!item) return null;

                  if (item.kind === "group-date") {
                    return (
                      <div
                        key={`gd-${item.key}`}
                        style={{
                          position: "absolute",
                          top: vRow.start,
                          left: 0,
                          right: 0,
                          height: GROUP_H,
                          minWidth: MIN_W,
                        }}
                        className="flex items-center gap-2 px-4 bg-muted/40 border-b border-border cursor-pointer hover:bg-muted/60 select-none"
                        onClick={() => toggleMonth(item.key)}
                      >
                        <span className="w-4 h-4 flex items-center justify-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded text-sm font-bold shrink-0">
                          {expandedMonths.has(item.key) ? "−" : "+"}
                        </span>
                        <span className="text-xs font-bold text-foreground min-w-0">
                          {new Date(
                            item.key + "-01T00:00:00",
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                          Total: {item.count}
                        </span>
                        {item.completeCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold whitespace-nowrap">
                            {item.completeCount}✓
                          </span>
                        )}
                        {item.inProgressCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold whitespace-nowrap">
                            {item.inProgressCount}⏳
                          </span>
                        )}
                      </div>
                    );
                  }

                  if (item.kind === "group-team") {
                    return (
                      <div
                        key={`gt-${item.key}`}
                        style={{
                          position: "absolute",
                          top: vRow.start,
                          left: 0,
                          right: 0,
                          height: GROUP_H,
                          minWidth: MIN_W,
                        }}
                        className="flex items-center gap-2 px-4 border-b border-border cursor-pointer hover:bg-muted/50 select-none bg-muted/40"
                        onClick={() => toggleTeam(item.key)}
                      >
                        <span className="w-4 h-4 flex items-center justify-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded text-sm font-bold shrink-0">
                          {expandedTeams.has(item.key) ? "−" : "+"}
                        </span>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: teamHex(item.color) }}
                        />
                        <span className="text-xs font-bold text-foreground">
                          {item.key}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Total: {item.count}
                        </span>
                        {item.completeCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold whitespace-nowrap">
                            {item.completeCount}✓
                          </span>
                        )}
                        {item.inProgressCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold whitespace-nowrap">
                            {item.inProgressCount}⏳
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`r-${item.hearing.id}`}
                      style={{
                        position: "absolute",
                        top: vRow.start,
                        left: 0,
                        right: 0,
                        height: ROW_H,
                      }}
                    >
                      <HearingRow
                        h={item.hearing}
                        teams={data.medical_teams}
                        mrStatusOptions={data.medical_record_status_options}
                        hearingDecisionOptions={
                          data.hearing_decision_status_options
                        }
                        mannerOptions={data.manner_options}
                        permissions={data.permissions}
                        onUpdate={handleUpdate}
                        onOpenPostHrg={(h) => setPostHrgHearing(h)}
                        onOpenWorksheet={(h) => setWorksheetHearing(h)}
                        onRowClick={(h) => setDetailPanel(h)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-t border-border bg-muted/20 shrink-0">
            <span className="text-[11px] text-muted-foreground">
              Showing{" "}
              {((filters.page ?? 1) - 1) * (filters.per_page as number) + 1}–
              {Math.min(
                (filters.page ?? 1) * (filters.per_page as number),
                totalHearings,
              )}{" "}
              of {totalHearings}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={filters.per_page}
                onChange={(e) =>
                  applyFilter({ per_page: Number(e.target.value), page: 1 })
                }
                className="text-xs px-2 py-1 rounded-lg border border-border bg-card text-foreground cursor-pointer"
              >
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
                <option value={200}>200/page</option>
                <option value={500}>500/page</option>
              </select>
              <button
                onClick={() => goPage((filters.page ?? 1) - 1)}
                disabled={(filters.page ?? 1) <= 1}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-200 font-semibold disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              {/* Page jump select */}
              <select
                value={String(filters.page ?? 1)}
                onChange={(e) => goPage(Number(e.target.value))}
                className="text-[11px] px-2 py-1 rounded-lg border border-border bg-card text-foreground cursor-pointer tabular-nums"
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted-foreground">
                of {totalPages}
              </span>
              <button
                onClick={() => goPage((filters.page ?? 1) + 1)}
                disabled={(filters.page ?? 1) >= totalPages}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 transition-colors"
              >
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
              <span className="text-sm font-bold text-foreground">
                📊 Medical Records Status
              </span>
              <button
                onClick={() => exportPivotToCsv(data.mrStatusByTeam)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
              >
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
              <span className="text-sm font-bold text-foreground">
                📅 Assigned Cases by Month
              </span>
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
        userRole={userRole}
        userName={userName}
      />

      {/* Per-row Post HRG modal — opened from the 📝 button in each row */}
      {postHrgHearing && (
        <PostHrgReviewModal
          mode="hearing"
          hearingId={postHrgHearing.id}
          claimant={postHrgHearing.claimant ?? ""}
          hearingDateText={new Date(
            postHrgHearing.hearing_date + "T00:00:00",
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          assignedRep={postHrgHearing.rep_name}
          userName={userName}
          userRole={userRole}
          initialNotes={null}
          initialDeadline={postHrgHearing.post_hrg_deadline}
          initialRequirements={null}
          initialDeadlinePrev={null}
          initialDeadlineChangedBy={null}
          onClose={() => setPostHrgHearing(null)}
          onHearingPatch={(patch) => {
            const mrPatch: Partial<Hearing> = {};
            if (patch.post_hrg_deadline !== undefined) {
              mrPatch.post_hrg_deadline = patch.post_hrg_deadline;
            }
            if (patch.post_hrg_review !== undefined) {
              mrPatch.post_hrg_review = patch.post_hrg_review ? "true" : null;
            }
            setHearings((prev) =>
              prev.map((h) =>
                h.id === postHrgHearing.id ? { ...h, ...mrPatch } : h,
              ),
            );
            setPostHrgHearing((h) =>
              h && h.id === postHrgHearing.id ? { ...h, ...mrPatch } : h,
            );
          }}
        />
      )}

      {/* Global Post HRG modal — opened from the header button */}
      {showPostHrg && !postHrgHearing && (
        <PostHrgModal
          open={showPostHrg}
          onClose={() => setShowPostHrg(false)}
          teams={data.medical_teams}
          mrStatusOptions={data.medical_record_status_options}
          userName={userName}
          userRole={userRole}
        />
      )}

      {/* Per-row MR Worksheet link edit modal */}
      {worksheetHearing && (
        <WorksheetLinkModal
          hearing={worksheetHearing}
          onClose={() => setWorksheetHearing(null)}
          onSaved={(id, link) => {
            setHearings((prev) =>
              prev.map((h) =>
                h.id === id ? { ...h, medical_record_link: link || null } : h,
              ),
            );
          }}
        />
      )}

      <TeamStatsModal
        open={showTeamStats}
        onClose={() => setShowTeamStats(false)}
        teams={data.medical_teams}
      />
      {showActivityLog && (
        <ActivityLogModal
          onClose={() => setShowActivityLog(false)}
          title="📋 Medical Records Activity Log"
          tabs={[
            {
              key: "all",
              label: "📋 All Changes",
              actions: [...PAGE_ACTION_SCOPES.medical_records],
            },
            {
              key: "status",
              label: "📊 Status",
              actions: ["mr_status_updated"],
            },
            {
              key: "team",
              label: "👥 Team",
              actions: ["mr_team_assigned"],
            },
            {
              key: "link",
              label: "🔗 MR Link",
              actions: ["mr_link_updated"],
            },
            {
              key: "tasks",
              label: "✅ Tasks",
              actions: ["task_assigned_updated", "five_day_notice_updated"],
            },
          ]}
        />
      )}
      <WithdrawnModal
        open={showWithdrawn}
        count={data.withdrawnCount}
        teams={data.medical_teams}
        onClose={() => setShowWithdrawn(false)}
        userName={userName}
        userRole={userRole}
      />

      {/* Slide-over detail panel — opened on row click */}
      <MedicalRecordsDetailPanel
        row={detailPanel}
        onClose={() => setDetailPanel(null)}
      />

      {/* ── Field update toast ── */}
      {updateToast &&
        mounted &&
        createPortal(
          <div className="fixed top-4 right-4 z-200 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-lg dark:border-emerald-800 dark:bg-emerald-950/80 animate-in fade-in slide-in-from-top-2 duration-200">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm">
              ✓
            </span>
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              {updateToast}
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}
