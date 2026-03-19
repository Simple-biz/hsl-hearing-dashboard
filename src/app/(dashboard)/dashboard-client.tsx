"use client";

import {
  useState,
  memo,
  useCallback,
  useTransition,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Download,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  MessageSquare,
  CalendarClock,
  AlertTriangle as AlertTriangleIcon,
  X as XIcon,
  Trash,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard, StatCardGrid } from "@/components/stat-card";
import {
  canEditField,
  canManage,
  canSeeCheckbox,
  canSeeAdminButtons,
  canSeeActivityLog,
  canSeeRepStats,
  canSeeCsvCompare,
  canSeeRepFilter,
  canSeeNextUnassigned,
  canExport,
  getVisibleColumns,
  type UserRole,
} from "@/lib/roles";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AddHearingModal,
  EmailAllModal,
  AutoAssignModal,
  UnassignAllModal,
  ActivityLogModal,
  RepStatsModal,
} from "@/components/modals";
import {
  updateHearing,
  deleteHearing,
  autoAssignSingle,
  fetchHearingsPage,
  bulkAutoAssignSelected,
  bulkEmailSelected,
  fetchAllHearingsForCompare,
  importChronicleEntries,
  exportHearingsCsv,
} from "./actions";
import type {
  HearingRow,
  RepRow,
  MrTeamRow,
  ConfigOptionRow,
  RepDocsAssigneeRow,
  NextUnassignedRow,
  RepWithCount,
} from "./actions";

// ── Types ──
interface HearingFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  month: string;
  year: string;
  repId: string;
  decisionStatus: string;
  mrTeamId: string;
  medicalRecordStatus: string;
  assignmentStatus: string;
  datePreset: string;
}
const EMPTY_FILTERS: HearingFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  month: "",
  year: "",
  repId: "",
  decisionStatus: "",
  mrTeamId: "",
  medicalRecordStatus: "",
  assignmentStatus: "",
  datePreset: "",
};
type HearingBoolField =
  | "task_assigned"
  | "rep_docs_complete"
  | "fee_agreement_complete"
  | "five_day_notice"
  | "phi_sheet_complete";
type UpdateValue = string | number | boolean | null;
interface PostHrgNote {
  user?: string;
  date?: string;
  note: string;
}

function parseNotes(raw: string | null): PostHrgNote[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [{ note: raw }];
  } catch {
    return raw ? [{ note: raw }] : [];
  }
}

// ── Color maps ──
const SEL =
  "h-8 rounded-md border border-input bg-card px-2 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring";
const SEL_SM =
  "h-7 rounded-md border border-input bg-card px-2 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring";

// Press-feel class for action buttons — standard Tailwind values, targeted transition
const BTN_PRESS =
  "active:scale-95 active:brightness-90 transition-transform duration-75";

const FIELD_LABELS: Record<string, string> = {
  assigned_rep_id: "Representative",
  mr_team_id: "Medical Team",
  hearing_decision_status: "Decision",
  medical_record_status: "MR Status",
  brief_assigned_to: "Brief",
  rep_docs_assigned_to: "Docs Assigned",
  rfc_status: "RFC",
  manner_of_appearance: "MOA",
  assignment_status: "Status",
  task_assigned: "Task Assigned",
  rep_docs_complete: "Rep Docs",
  fee_agreement_complete: "Fee Agreement",
  five_day_notice: "5-Day Notice",
  phi_sheet_complete: "PHI Sheet",
  post_hrg_review: "Post HRG Review",
  post_hrg_notes: "Post HRG Notes",
  post_hrg_deadline: "Post HRG Deadline",
  claimant: "Claimant",
  hearing_date: "Hearing Date",
  hearing_time: "Hearing Time",
  alj: "ALJ",
  city: "City",
  state: "State",
};

// ── Safe date parsing (avoids UTC midnight → local timezone day shift) ──
function parseDate(dateStr: string): Date {
  // "2026-05-01" → Date at noon UTC so it stays May 1 in any timezone
  return new Date(dateStr + "T12:00:00");
}
function fmtDate(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  return parseDate(dateStr).toLocaleDateString(
    "en-US",
    opts || { month: "short", day: "numeric", year: "2-digit" },
  );
}

function fmtTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const parts = timeStr.slice(0, 5).split(":");
  if (parts.length !== 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}
// function getDateMonth(dateStr: string): number {
//   return parseDate(dateStr).getMonth();
// }
// function getDateYear(dateStr: string): number {
//   return parseDate(dateStr).getFullYear();
// }
const DECISION_COLORS: Record<string, string> = {
  "Fully Favorable":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Partially Favorable":
    "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  Unfavorable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  Dismissed:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "Pending Decision":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Scheduled: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "Post HRG Review/ Dev":
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Continued:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "OTR AT HRG":
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
};
const MR_STATUS_COLORS: Record<string, string> = {
  Complete:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "In Progress":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Missing: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
const TEAM_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  orange:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  green:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  yellow:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  purple:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};
const RFC_COLORS: Record<string, string> = {
  Sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  Received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};
const MOA_COLORS: Record<string, string> = {
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

function StatusBadge({
  value,
  colorMap,
}: {
  value: string | null;
  colorMap: Record<string, string>;
}) {
  if (!value) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
        colorMap[value] || "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}
function TeamBadge({
  name,
  color,
}: {
  name: string | null;
  color: string | null;
}) {
  if (!name) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
        TEAM_COLORS[color || ""] || "bg-muted text-muted-foreground",
      )}
    >
      {name}
    </span>
  );
}

// ── Inline components ──
function InlineCheck({
  checked,
  onToggle,
  editable = true,
  color = "green",
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  editable?: boolean;
  color?: "green" | "purple";
}) {
  const accent = color === "purple" ? "accent-purple-600" : "accent-green-600";
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          if (editable) onToggle(e.target.checked);
        }}
        readOnly={!editable}
        className={cn(
          "h-4 w-4 rounded",
          accent,
          editable ? "cursor-pointer" : "cursor-default pointer-events-none",
        )}
      />
    </div>
  );
}

function InlineDropdown({
  value,
  options,
  onSave,
  editable,
  colorMap,
  placeholder = "-",
}: {
  value: string | number | null;
  options: { value: string; label: string }[];
  onSave: (v: string | null) => void;
  editable: boolean;
  colorMap?: Record<string, string>;
  placeholder?: string;
}) {
  if (!editable) {
    const display =
      options.find((o) => o.value === String(value ?? ""))?.label ||
      (value ? String(value) : null);
    if (colorMap && display)
      return <StatusBadge value={display} colorMap={colorMap} />;
    return (
      <span className="text-xs text-muted-foreground">
        {display || placeholder}
      </span>
    );
  }
  const currentLabel =
    options.find((o) => o.value === String(value ?? ""))?.label || null;
  const currentColor = colorMap && currentLabel ? colorMap[currentLabel] : null;

  return (
    <select
      value={value != null ? String(value) : ""}
      onChange={(e) => onSave(e.target.value || null)}
      className={cn(
        "h-6 w-full rounded border px-1 text-[11px] font-semibold cursor-pointer transition-colors bg-card",
        "focus:outline-none focus:ring-1 focus:ring-blue-400",
        currentColor
          ? cn(currentColor, "border-current")
          : "border-transparent hover:border-border text-foreground",
      )}
    >
      <option value="" className="text-foreground bg-card font-normal">
        {placeholder}
      </option>
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          className="text-foreground bg-card font-normal"
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}
// ── Rep badge (read-only, colored by type — matches old dashboard) ──
const REP_BADGE_COLORS: Record<string, string> = {
  "in-house":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  internal_advocates:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  contract:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  external_advocates:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

function RepBadge({ hearing }: { hearing: HearingRow }) {
  if (hearing.assigned_rep_id && hearing.rep_name) {
    const isInternal =
      hearing.rep_type === "in-house" ||
      hearing.rep_type === "internal_advocates";
    const icon = isInternal ? "🏠" : "📋";
    const colorClass =
      REP_BADGE_COLORS[hearing.rep_type || ""] ||
      "bg-muted text-muted-foreground";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
          colorClass,
        )}
      >
        {icon} {hearing.rep_name}
      </span>
    );
  }
  if (hearing.assignment_status === "wd_never_assigned") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        📋 WD - Never Assigned
      </span>
    );
  }
  if (hearing.assignment_status === "withdrawal") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
        🚫 Withdrawal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
      —
    </span>
  );
}

// ── Actions menu (context-sensitive like old dashboard) ──
// ── Withdrawal types (matches old dashboard) ──
const WITHDRAWAL_TYPES = [
  "Withdrawal",
  "Withdrawal - No Contact",
  "Withdrawal - SGA",
  "Withdrawal - Client Terminated Rep",
  "Withdrawal - In-Person",
  "Withdrawal - Client Working/ Doing Better/WD Hrg Req",
  "Withdrawal - UFD",
  "Withdrawal - Receiving Benefits",
  "Withdrawal - Misc",
];

// ── Actions menu (context-sensitive like old dashboard) ──
function ActionMenu({
  hearing,
  userRole,
  onUpdate,
  onDelete,
  representatives,
  onEdit,
  onAutoAssign,
}: {
  hearing: HearingRow;
  userRole: UserRole;
  onUpdate: (id: number, field: string, value: UpdateValue) => void;
  onDelete: (id: number) => void;
  representatives: RepRow[];
  onEdit: (h: HearingRow) => void;
  onAutoAssign: (id: number) => void;
}) {
  const isActionAdmin = canManage(userRole);
  const isUnassigned = !hearing.assigned_rep_id && !hearing.assignment_status;
  const isAssigned = !!hearing.assigned_rep_id;
  const hasStatus = !!hearing.assignment_status;
  const [showAssign, setShowAssign] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openMenu = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuH = 250; // estimated max menu height
      const spaceBelow = window.innerHeight - r.bottom;
      const top =
        spaceBelow < menuH ? Math.max(8, r.top - menuH) : r.bottom + 4;
      setPos({ top, left: Math.min(r.right, window.innerWidth - 200) });
    }
    setMenuOpen(true);
  };

  const handleWithdrawal = (type: string) => {
    onUpdate(hearing.id, "assignment_status", "withdrawal");
    onUpdate(hearing.id, "hearing_decision_status", type);
    setShowWithdrawal(false);
  };

  const menuAction = (fn: () => void) => () => {
    fn();
    setMenuOpen(false);
  };

  const openSub = (setter: (v: boolean) => void) => () => {
    setMenuOpen(false);
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const subH = 350; // estimated sub-popover height
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow < subH ? Math.max(8, r.top - subH) : r.bottom + 4;
      setPos({ top, left: Math.min(r.right - 288, window.innerWidth - 300) });
    }
    setter(true);
  };

  return (
    <>
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={openMenu}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>

      {/* Main menu — portal */}
      {menuOpen &&
        !showAssign &&
        !showWithdrawal &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-100"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="fixed z-101 w-48 max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border bg-card py-1 shadow-xl"
              style={{ top: pos.top, left: pos.left - 192 }}
            >
              {isActionAdmin && (
                <>
                  {isUnassigned && (
                    <>
                      <button
                        onClick={openSub(setShowAssign)}
                        className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        📋 Assign
                      </button>
                      <button
                        onClick={menuAction(() => onAutoAssign(hearing.id))}
                        className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        ⚡ Auto-Assign
                      </button>
                    </>
                  )}
                  {isAssigned && (
                    <>
                      <button
                        onClick={menuAction(() => {})}
                        className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        📧 Send Email
                      </button>
                      <button
                        onClick={menuAction(() =>
                          onUpdate(hearing.id, "assigned_rep_id", null),
                        )}
                        className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        🔄 Unassign
                      </button>
                      <button
                        onClick={openSub(setShowWithdrawal)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        🚫 Withdrawal <ChevronRight className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  {hasStatus && !isAssigned && (
                    <>
                      <button
                        onClick={openSub(setShowAssign)}
                        className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        📋 Change Assignment
                      </button>
                      <button
                        onClick={menuAction(() => {
                          onUpdate(hearing.id, "assignment_status", null);
                          onUpdate(hearing.id, "assigned_rep_id", null);
                        })}
                        className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
                      >
                        🔄 Clear Status
                      </button>
                    </>
                  )}
                  <div className="my-1 border-t" />
                </>
              )}
              <button
                onClick={menuAction(() => onEdit(hearing))}
                className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
              >
                {isActionAdmin ? (
                  <>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-3.5 w-3.5" /> View
                  </>
                )}
              </button>
              <button
                onClick={menuAction(() => {})}
                className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted/50"
              >
                📝 Activity Log
              </button>
              {isActionAdmin && (
                <>
                  <div className="my-1 border-t" />
                  <button
                    onClick={menuAction(() => {
                      if (
                        confirm(
                          `Delete hearing #${hearing.id} (${hearing.claimant})?`,
                        )
                      )
                        onDelete(hearing.id);
                    })}
                    className="flex w-full items-center px-3 py-1.5 text-xs text-destructive hover:bg-muted/50"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}

      {/* Withdrawal submenu — portal */}
      {showWithdrawal &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-100"
              onClick={() => setShowWithdrawal(false)}
            />
            <div
              className="fixed z-101 w-72 max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border bg-card p-1 shadow-xl"
              style={{ top: pos.top, left: pos.left - 288 }}
            >
              <div className="px-3 py-2 border-b">
                <p className="text-xs font-semibold">🚫 Withdrawal Type</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {hearing.claimant} —{" "}
                  {fmtDate(hearing.hearing_date, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              {WITHDRAWAL_TYPES.map((wt) => (
                <button
                  key={wt}
                  onClick={() => handleWithdrawal(wt)}
                  className="flex w-full items-center px-3 py-1.5 text-xs text-left hover:bg-muted/50 rounded transition-colors"
                >
                  {wt}
                </button>
              ))}
              <div className="border-t mt-1 pt-1 px-1">
                <button
                  onClick={() => {
                    onUpdate(
                      hearing.id,
                      "assignment_status",
                      "wd_never_assigned",
                    );
                    setShowWithdrawal(false);
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-xs text-left hover:bg-muted/50 rounded text-amber-700 font-medium"
                >
                  WD - Never Assigned
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* Assign popover — portal */}
      {showAssign &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-100"
              onClick={() => setShowAssign(false)}
            />
            <div
              className="fixed z-101 w-72 max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border bg-card p-4 shadow-xl"
              style={{ top: pos.top, left: pos.left - 288 }}
            >
              <p className="mb-0.5 text-xs font-semibold">📋 Assign</p>
              <p className="mb-2 text-[10px] text-muted-foreground">
                {hearing.claimant} —{" "}
                {fmtDate(hearing.hearing_date, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <select
                className="h-9 w-full rounded border bg-card px-2 text-sm"
                autoFocus
                onChange={(e) => {
                  if (e.target.value) {
                    onUpdate(
                      hearing.id,
                      "assigned_rep_id",
                      Number(e.target.value),
                    );
                    onUpdate(hearing.id, "assignment_status", null);
                    setShowAssign(false);
                  }
                }}
              >
                <option value="">Select representative...</option>
                <optgroup label="Internal">
                  {representatives
                    .filter(
                      (r) => r.is_active && r.rep_type === "internal_advocates",
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="External">
                  {representatives
                    .filter(
                      (r) => r.is_active && r.rep_type === "external_advocates",
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 w-full text-xs"
                onClick={() => setShowAssign(false)}
              >
                Cancel
              </Button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// ── Claimant cell — link if claimant_link exists ──
function ClaimantCell({ hearing }: { hearing: HearingRow }) {
  return (
    <div className="min-w-0 pr-1">
      {hearing.claimant_link ? (
        <a
          href={hearing.claimant_link}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {hearing.claimant}
        </a>
      ) : (
        <p className="truncate text-xs font-medium">{hearing.claimant}</p>
      )}
      <p className="truncate text-[10px] text-muted-foreground">
        {hearing.claim_type}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// POST HRG MODAL
// ══════════════════════════════════════════════════════════════
function PostHrgModal({
  hearing,
  onClose,
  onSave,
  userName,
}: {
  hearing: HearingRow;
  onClose: () => void;
  onSave: (id: number, field: string, value: UpdateValue) => void;
  userName: string;
}) {
  const notes = parseNotes(hearing.post_hrg_notes);
  const [newNote, setNewNote] = useState("");
  const [deadline, setDeadline] = useState(hearing.post_hrg_deadline || "");
  const [saving, setSaving] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    const updated: PostHrgNote[] = [
      { user: userName, date: new Date().toISOString(), note: newNote.trim() },
      ...notes,
    ];
    await onSave(hearing.id, "post_hrg_notes", JSON.stringify(updated));
    if (deadline && deadline !== hearing.post_hrg_deadline) {
      await onSave(hearing.id, "post_hrg_deadline", deadline);
    }
    setNewNote("");
    setSaving(false);
  };

  const handleUpdateDeadline = async () => {
    await onSave(hearing.id, "post_hrg_deadline", deadline || null);
  };

  const handleClearDeadline = async () => {
    setDeadline("");
    await onSave(hearing.id, "post_hrg_deadline", null);
  };

  const handleDeleteNote = async (index: number) => {
    const updated = notes.filter((_, i) => i !== index);
    await onSave(
      hearing.id,
      "post_hrg_notes",
      updated.length > 0 ? JSON.stringify(updated) : null,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Post HRG Review</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Hearing info */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Claimant:{" "}
              <span className="font-medium text-foreground">
                {hearing.claimant}
              </span>
            </span>
            <span>
              Hearing:{" "}
              <span className="font-medium text-foreground">
                {fmtDate(hearing.hearing_date, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
          </div>

          {/* Deadline */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Deadline Date</label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-8 w-auto text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleUpdateDeadline}
              >
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleClearDeadline}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Add note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Add New Note</label>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              placeholder="Enter your note..."
              className="w-full rounded-md border bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleAddNote}
              disabled={saving || !newNote.trim()}
            >
              {saving ? "Saving..." : "Add Note"}
            </Button>
          </div>

          {/* Notes history */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              Notes History{" "}
              <span className="text-muted-foreground">({notes.length})</span>
            </label>
            {notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No notes yet
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((note, i) => (
                  <div
                    key={i}
                    className="rounded-lg border bg-muted/30 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {note.user || "System"}
                        </span>
                        {note.date && (
                          <span>
                            {new Date(note.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteNote(i)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-xs whitespace-pre-wrap">{note.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Post HRG cell badge ──
function PostHrgCell({
  hearing,
  onClick,
}: {
  hearing: HearingRow;
  onClick: () => void;
}) {
  const notes = parseNotes(hearing.post_hrg_notes);
  const noteCount = notes.length;
  const deadline = hearing.post_hrg_deadline;

  let badgeClass = "bg-muted/50 text-muted-foreground hover:bg-muted";
  let icon = <MessageSquare className="h-3 w-3" />;
  let text = "+ Add";

  if (deadline) {
    const dd = parseDate(deadline);
    const today = parseDate(new Date().toISOString().split("T")[0]);
    if (dd < today) {
      badgeClass =
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200";
      icon = <AlertTriangleIcon className="h-3 w-3" />;
      text = fmtDate(deadline, { month: "short", day: "numeric" });
    } else {
      badgeClass =
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200";
      icon = <CalendarClock className="h-3 w-3" />;
      text = fmtDate(deadline, { month: "short", day: "numeric" });
    }
  } else if (noteCount > 0) {
    badgeClass =
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200";
    icon = <MessageSquare className="h-3 w-3" />;
    text = "Notes";
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer",
        badgeClass,
      )}
      title={
        noteCount > 0
          ? `${noteCount} note${noteCount > 1 ? "s" : ""} - Click to view`
          : "Click to add note"
      }
    >
      {icon} {text}
      {noteCount > 0 && (
        <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 text-[9px] font-bold">
          {noteCount}
        </span>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// STAT CARDS — gradient, matching original
// ══════════════════════════════════════════════════════════════
const StatsRow = memo(function StatsRow({
  stats,
  userRole,
}: {
  stats: {
    total: number;
    assigned: number;
    unassigned: number;
    wdStatus: number;
    next7Days: number;
    thisMonth: number;
  };
  userRole: UserRole;
}) {
  const isRep = userRole === "rep";
  const adminCards = [
    {
      label: "Total",
      value: stats.total,
      gradient: "from-indigo-500 to-purple-600",
    },
    {
      label: "Assigned",
      value: stats.assigned,
      gradient: "from-emerald-500 to-green-400",
    },
    {
      label: "Unassigned",
      value: stats.unassigned,
      gradient: "from-pink-400 to-rose-500",
    },
    {
      label: "WD/Status",
      value: stats.wdStatus,
      gradient: "from-amber-500 to-amber-600",
    },
    {
      label: "Next 7 Days",
      value: stats.next7Days,
      gradient: "from-blue-400 to-cyan-400",
    },
  ];
  const repCards = [
    {
      label: "My Total Hearings",
      value: stats.total,
      gradient: "from-emerald-500 to-green-400",
    },
    {
      label: "My Upcoming",
      value: stats.next7Days,
      gradient: "from-blue-400 to-cyan-400",
    },
    {
      label: "This Month",
      value: stats.thisMonth,
      gradient: "from-indigo-500 to-purple-600",
    },
  ];
  const cards = isRep ? repCards : adminCards;
  return (
    <StatCardGrid
      className={
        isRep ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      }
    >
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          gradient={card.gradient}
        />
      ))}
    </StatCardGrid>
  );
});

// ── Filter bar — matches old dashboard: search, sort, rep (with counts), year, month, date presets, next unassigned ──
const FilterBar = memo(function FilterBar({
  filters,
  onFilterChange,
  repCounts,
  nextUnassigned,
  showRepFilter: showRepFilterProp,
  showNextUnassigned: showNextUnassignedProp,
}: {
  filters: HearingFilters;
  onFilterChange: (f: HearingFilters) => void;
  repCounts: RepWithCount[];
  nextUnassigned: NextUnassignedRow | null;
  showRepFilter: boolean;
  showNextUnassigned: boolean;
}) {
  const update = (key: keyof HearingFilters, value: string) => {
    const v = value;
    const next = { ...filters, [key]: v };
    // Date presets auto-fill dateFrom/dateTo
    if (key === "datePreset") {
      const today = new Date();
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      switch (value) {
        case "today":
          next.dateFrom = fmt(today);
          next.dateTo = fmt(today);
          break;
        case "tomorrow": {
          const t = new Date(today);
          t.setDate(t.getDate() + 1);
          next.dateFrom = fmt(t);
          next.dateTo = fmt(t);
          break;
        }
        case "this-week": {
          const mon = new Date(today);
          mon.setDate(mon.getDate() - mon.getDay() + 1);
          const fri = new Date(mon);
          fri.setDate(fri.getDate() + 4);
          next.dateFrom = fmt(mon);
          next.dateTo = fmt(fri);
          break;
        }
        case "next-week": {
          const mon = new Date(today);
          mon.setDate(mon.getDate() - mon.getDay() + 8);
          const fri = new Date(mon);
          fri.setDate(fri.getDate() + 4);
          next.dateFrom = fmt(mon);
          next.dateTo = fmt(fri);
          break;
        }
        case "this-month": {
          next.dateFrom = fmt(
            new Date(today.getFullYear(), today.getMonth(), 1),
          );
          next.dateTo = fmt(
            new Date(today.getFullYear(), today.getMonth() + 1, 0),
          );
          break;
        }
        case "next-30": {
          next.dateFrom = fmt(today);
          const d = new Date(today);
          d.setDate(d.getDate() + 30);
          next.dateTo = fmt(d);
          break;
        }
        case "custom":
          next.dateFrom = "";
          next.dateTo = "";
          break;
        default:
          next.dateFrom = "";
          next.dateTo = "";
          break;
      }
    }
    onFilterChange(next);
  };

  const activeCount = [
    filters.month,
    filters.year,
    filters.repId,
    filters.decisionStatus,
    filters.mrTeamId,
    filters.medicalRecordStatus,
    filters.assignmentStatus,
    filters.datePreset,
  ].filter(Boolean).length;
  // Using showRepFilterProp and showNextUnassignedProp from parent

  return (
    <div className="space-y-2">
      {/* Row 1: Search + Rep filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-55">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search Claimant, ALJ, City..."
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {showRepFilterProp && (
          <select
            className={SEL + " w-full sm:w-auto sm:min-w-40"}
            value={filters.repId || ""}
            onChange={(e) => update("repId", e.target.value)}
          >
            <option value="">All Reps</option>
            <option value="unassigned">Unassigned</option>
            <option value="wd_never_assigned">WD - Never Assigned</option>
            <option value="withdrawal">Withdrawal</option>
            {repCounts.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name} ({r.hearing_count})
              </option>
            ))}
          </select>
        )}

        {/* Row 2 on mobile, inline on desktop: Year, Month, Date preset */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={SEL + " min-w-25"}
            value={filters.year || ""}
            onChange={(e) => update("year", e.target.value)}
          >
            <option value="">All Years</option>
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>

          <select
            className={SEL + " min-w-30"}
            value={filters.month || ""}
            onChange={(e) => update("month", e.target.value)}
          >
            <option value="">All Months</option>
            {[
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
            ].map((m, i) => (
              <option key={i} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>

          <select
            className={SEL + " min-w-32.5"}
            value={filters.datePreset || ""}
            onChange={(e) => update("datePreset", e.target.value)}
          >
            <option value="">All Dates</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="this-week">This Week</option>
            <option value="next-week">Next Week</option>
            <option value="this-month">This Month</option>
            <option value="next-30">Next 30 Days</option>
            <option value="custom">Custom Range...</option>
          </select>

          {filters.datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  onFilterChange({ ...filters, dateFrom: e.target.value })
                }
                className="h-8 w-31.25 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  onFilterChange({ ...filters, dateTo: e.target.value })
                }
                className="h-8 w-31.25 text-xs"
              />
            </div>
          )}

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={() => onFilterChange(EMPTY_FILTERS)}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>

        {/* Next Unassigned Indicator */}
        {nextUnassigned && showNextUnassignedProp && (
          <div className="sm:ml-auto flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 dark:border-amber-700 dark:bg-amber-950/50">
            <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
              Next Unassigned:
            </span>
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {fmtDate(nextUnassigned.hearing_date, {
                month: "short",
                day: "numeric",
              })}
              {nextUnassigned.converted_time_est &&
                ` @ ${fmtTime(nextUnassigned.converted_time_est)}`}
              <span className="ml-1 font-normal text-amber-700 dark:text-amber-400">
                — {nextUnassigned.claimant?.substring(0, 20)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Frozen column config ──
interface ColumnDef {
  key: string;
  label: string;
  w: number;
  sortable?: boolean;
  frozen?: boolean;
}
const COL_W = {
  checkbox: 36,
  assigned_rep_id: 155,
  hearing_date: 88,
  hearing_time: 78,
  claimant: 175,
  ssn_last_4: 62,
  actions: 44,
};
const ALL_COLUMNS: ColumnDef[] = [
  { key: "checkbox", label: "", w: COL_W.checkbox, frozen: true },
  {
    key: "assigned_rep_id",
    label: "Representative",
    w: COL_W.assigned_rep_id,
    sortable: true,
    frozen: true,
  },
  {
    key: "hearing_date",
    label: "Date",
    w: COL_W.hearing_date,
    sortable: true,
    frozen: true,
  },
  { key: "hearing_time", label: "Time", w: COL_W.hearing_time, frozen: true },
  {
    key: "claimant",
    label: "Claimant",
    w: COL_W.claimant,
    sortable: true,
    frozen: true,
  },
  { key: "ssn_last_4", label: "SSN", w: COL_W.ssn_last_4, frozen: true },
  { key: "actions", label: "", w: COL_W.actions, frozen: true },
  { key: "alj", label: "ALJ", w: 150, sortable: true },
  { key: "location", label: "Location", w: 120, sortable: true },
  { key: "manner_of_appearance", label: "MOA", w: 75 },
  { key: "rep_docs_complete", label: "Rep Docs", w: 65 },
  { key: "rep_docs_assigned_to", label: "Docs Assigned", w: 110 },
  { key: "fee_agreement_complete", label: "Fee Agmt", w: 65 },
  { key: "mr_team_id", label: "Medical Team", w: 110 },
  { key: "medical_record_link", label: "MR Worksheet", w: 95 },
  { key: "medical_record_status", label: "MR Status", w: 90 },
  { key: "rfc_status", label: "RFC", w: 80 },
  { key: "five_day_notice", label: "5-Day", w: 55 },
  { key: "task_assigned", label: "Task Assigned", w: 95 },
  { key: "brief_assigned_to", label: "Brief", w: 100 },
  { key: "phi_sheet_complete", label: "PHI", w: 55 },
  { key: "hearing_decision_status", label: "Decision", w: 125, sortable: true },
  { key: "post_hrg_review", label: "Post Hrg Review", w: 130 },
];

// ── Mobile card ──
function HearingCard({
  hearing,
  userRole,
  onUpdate,
  onOpenPostHrg,
}: {
  hearing: HearingRow;
  userRole: UserRole;
  onUpdate: (id: number, field: string, value: UpdateValue) => void;
  onOpenPostHrg: (h: HearingRow) => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {hearing.claimant_link ? (
              <a
                href={hearing.claimant_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold leading-tight text-blue-600 hover:underline dark:text-blue-400"
              >
                {hearing.claimant}
              </a>
            ) : (
              <p className="text-sm font-semibold leading-tight">
                {hearing.claimant}
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              #{hearing.id} {hearing.ssn_last_4 ? `${hearing.ssn_last_4}` : ""}
            </p>
          </div>
          <StatusBadge
            value={hearing.hearing_decision_status}
            colorMap={DECISION_COLORS}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {fmtDate(hearing.hearing_date)} at{" "}
            {fmtTime(hearing.converted_time_est)}
          </span>
          {hearing.city && (
            <span>
              {hearing.city}, {hearing.state}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TeamBadge
            name={hearing.mr_team_name}
            color={hearing.mr_team_color}
          />
          <StatusBadge
            value={hearing.medical_record_status}
            colorMap={MR_STATUS_COLORS}
          />
          <PostHrgCell
            hearing={hearing}
            onClick={() => onOpenPostHrg(hearing)}
          />
        </div>
        <div className="flex items-center gap-3 border-t pt-2">
          {(
            [
              "task_assigned",
              "rep_docs_complete",
              "fee_agreement_complete",
              "five_day_notice",
              "phi_sheet_complete",
            ] as const
          ).map((field) => {
            const labels: Record<string, string> = {
              task_assigned: "Task",
              rep_docs_complete: "Docs",
              fee_agreement_complete: "Fee",
              five_day_notice: "5-Day",
              phi_sheet_complete: "PHI",
            };
            return (
              <label
                key={field}
                className="flex items-center gap-1 text-[10px] text-muted-foreground"
              >
                <Checkbox
                  checked={hearing[field]}
                  onCheckedChange={(v) =>
                    onUpdate(hearing.id, field, v === true)
                  }
                  disabled={!canEditField(userRole, field)}
                  className="h-3.5 w-3.5"
                />
                {labels[field]}
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Desktop table ──
// ── Memoized table row — only re-renders when its own data or selection changes ──
interface MemoRowProps {
  hearing: HearingRow;
  ri: number;
  isSelected: boolean;
  isAdmin: boolean;
  evenBg: string;
  oddBg: string;
  getLeftPos: (key: string) => number | undefined;
  lastFrozenKey: string;
  renderCell: (h: HearingRow, col: ColumnDef) => React.ReactNode;
  columns: ColumnDef[];
}

const MemoRow = memo(
  function MemoRow({
    hearing,
    ri,
    isSelected,
    isAdmin,
    evenBg,
    oddBg,
    getLeftPos,
    lastFrozenKey,
    renderCell,
    columns,
  }: MemoRowProps) {
    const rb = ri % 2 === 0 ? evenBg : oddBg;
    return (
      <tr className={cn("group border-b border-border/40 last:border-0", rb)}>
        {columns.map((col) => {
          const lp = getLeftPos(col.key);
          const isLF = col.key === lastFrozenKey;
          return (
            <td
              key={col.key}
              className={cn(
                "px-2 py-1.5",
                col.frozen && cn("sticky z-10 overflow-hidden", rb),
                isLF &&
                  "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
              )}
              style={{
                width: col.w,
                minWidth: col.w,
                maxWidth: col.frozen ? col.w : undefined,
                ...(lp !== undefined ? { left: lp } : {}),
              }}
            >
              {col.key === "checkbox" ? (
                isAdmin ? (
                  <input
                    type="checkbox"
                    data-row-checkbox
                    data-hearing-id={hearing.id}
                    defaultChecked={isSelected}
                    className="h-4 w-4 accent-purple-600 cursor-pointer"
                  />
                ) : null
              ) : (
                renderCell(hearing, col)
              )}
            </td>
          );
        })}
      </tr>
    );
  },
  (prev, next) => prev.hearing === next.hearing && prev.ri === next.ri,
);

const HearingTable = memo(function HearingTable({
  hearings,
  userRole,
  onUpdate,
  onDelete,
  sortKey,
  sortDir,
  onSort,
  onOpenPostHrg,
  onEdit,
  onAutoAssign,
  configOptions,
  representatives,
  mrTeams,
  repDocsAssignees,
  showCheckbox: showCheckboxProp,
  onToggleAll,
  scrollRef,
}: {
  hearings: HearingRow[];
  userRole: UserRole;
  onUpdate: (id: number, field: string, value: UpdateValue) => void;
  onDelete: (id: number) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onOpenPostHrg: (h: HearingRow) => void;
  onEdit: (h: HearingRow) => void;
  onAutoAssign: (id: number) => void;
  configOptions: ConfigOptionRow[];
  representatives: RepRow[];
  mrTeams: MrTeamRow[];
  repDocsAssignees: RepDocsAssigneeRow[];
  showCheckbox: boolean;
  onToggleAll: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  "use no memo";

  // Filter columns based on role visibility
  const visibleKeys = getVisibleColumns(userRole) || ["ALL"];
  const columns =
    visibleKeys[0] === "ALL"
      ? ALL_COLUMNS
      : ALL_COLUMNS.filter((col) => {
          if (col.key === "checkbox") return showCheckboxProp;
          if (col.key === "actions") return true;
          if (col.key === "location")
            return (
              visibleKeys.includes("city") || visibleKeys.includes("state")
            );
          return visibleKeys.includes(col.key);
        });

  // Build option lists for dropdowns
  const moaOptions = configOptions
    .filter((o) => o.option_type === "manner_of_appearance")
    .map((o) => ({ value: o.option_value, label: o.option_value }));
  const decisionOptions = configOptions
    .filter((o) => o.option_type === "hearing_decision_status")
    .map((o) => ({ value: o.option_value, label: o.option_value }));
  const mrStatusOptions = configOptions
    .filter((o) => o.option_type === "medical_record_status")
    .map((o) => ({ value: o.option_value, label: o.option_value }));
  const rfcOptions = configOptions
    .filter((o) => o.option_type === "rfc_status")
    .map((o) => ({ value: o.option_value, label: o.option_value }));
  const briefOptions = configOptions
    .filter((o) => o.option_type === "brief_assignment")
    .map((o) => ({ value: o.option_value, label: o.option_value }));
  const docsAssigneeOptions = repDocsAssignees.map((d) => ({
    value: d.name,
    label: d.name,
  }));
  const teamOptions = mrTeams
    .filter((t) => t.is_active)
    .map((t) => ({
      value: String(t.id),
      label: t.team_name,
    }));
  // All teams including inactive — for displaying existing assignments

  const teamColorMap: Record<string, string> = {};
  for (const t of mrTeams) {
    if (t.team_color) {
      teamColorMap[t.team_name] =
        `bg-[${t.team_color}]/20 text-[${t.team_color}] border-[${t.team_color}]/30`;
    }
  }

  // If no config options loaded for a field, provide sensible defaults
  const moaFallback =
    moaOptions.length > 0
      ? moaOptions
      : [
          { value: "Phone", label: "Phone" },
          { value: "In Person", label: "In Person" },
          { value: "OVH", label: "OVH" },
        ];
  const rfcFallback =
    rfcOptions.length > 0
      ? rfcOptions
      : [
          { value: "Sent", label: "Sent" },
          { value: "Received", label: "Received" },
        ];

  const isAdmin = showCheckboxProp;
  // Checkboxes are uncontrolled — allSelected header defaults to unchecked
  // toggleAll handles DOM sync directly

  const evenBg = "bg-white dark:bg-zinc-950";
  const oddBg = "bg-zinc-50 dark:bg-zinc-900";
  const headerBg = "bg-zinc-100 dark:bg-zinc-900";
  // Compute frozen column left positions dynamically based on visible columns
  const frozenCols = columns.filter((c) => c.frozen);
  const dynamicLeft: Record<string, number> = {};
  let leftAccum = 0;
  for (const col of frozenCols) {
    dynamicLeft[col.key] = leftAccum;
    leftAccum += col.w;
  }
  const lastFrozenKey =
    frozenCols.length > 0 ? frozenCols[frozenCols.length - 1].key : "";
  const getLeftPos = (key: string): number | undefined => dynamicLeft[key];
  const renderCell = (hearing: HearingRow, col: ColumnDef) => {
    const editable = canEditField(userRole, col.key);
    switch (col.key) {
      case "checkbox":
        return null; // Handled directly in MemoRow
      case "assigned_rep_id":
        return <RepBadge hearing={hearing} />;
      case "hearing_date":
        return (
          <span className="text-xs tabular-nums">
            {fmtDate(hearing.hearing_date)}
          </span>
        );
      case "hearing_time":
        return (
          <span className="text-xs tabular-nums">
            {fmtTime(hearing.converted_time_est)}
          </span>
        );
      case "claimant":
        return <ClaimantCell hearing={hearing} />;
      case "ssn_last_4":
        return (
          <span className="text-xs font-mono text-muted-foreground">
            {hearing.ssn_last_4 ? `${hearing.ssn_last_4}` : "-"}
          </span>
        );
      case "actions":
        return (
          <ActionMenu
            hearing={hearing}
            userRole={userRole}
            onUpdate={onUpdate}
            onDelete={onDelete}
            representatives={representatives}
            onEdit={onEdit}
            onAutoAssign={onAutoAssign}
          />
        );
      case "location":
        return (
          <span className="text-xs">
            {hearing.city && hearing.state
              ? `${hearing.city}, ${hearing.state}`
              : hearing.city || hearing.state || "-"}
          </span>
        );
      case "alj":
        return (
          <span className="block max-w-37.5 truncate text-xs">
            {hearing.alj || "-"}
          </span>
        );
      case "manner_of_appearance":
        return (
          <InlineDropdown
            value={hearing.manner_of_appearance}
            options={moaFallback}
            onSave={(v) => onUpdate(hearing.id, "manner_of_appearance", v)}
            editable={editable}
            colorMap={MOA_COLORS}
          />
        );
      case "rep_docs_assigned_to":
        return (
          <InlineDropdown
            value={hearing.rep_docs_assigned_to}
            options={docsAssigneeOptions}
            onSave={(v) => onUpdate(hearing.id, "rep_docs_assigned_to", v)}
            editable={editable}
          />
        );
      case "mr_team_id": {
        // Show team name with color badge for display, active-only dropdown for editing
        const teamName = hearing.mr_team_name;
        const teamColor = hearing.mr_team_color;
        const isInactiveTeam = hearing.mr_team_id
          ? !mrTeams.find((t) => t.id === hearing.mr_team_id && t.is_active)
          : false;

        // Badge colors (read-only): light pastel bg + dark text — matches PHP .team-badge
        const TEAM_BADGE: Record<string, { bg: string; fg: string }> = {
          blue: { bg: "#dbeafe", fg: "#1e40af" },
          orange: { bg: "#ffedd5", fg: "#c2410c" },
          green: { bg: "#d1fae5", fg: "#065f46" },
          yellow: { bg: "#fef3c7", fg: "#92400e" },
          purple: { bg: "#ede9fe", fg: "#5b21b6" },
          red: { bg: "#fee2e2", fg: "#991b1b" },
          pink: { bg: "#fce7f3", fg: "#9d174d" },
          teal: { bg: "#ccfbf1", fg: "#0f766e" },
          indigo: { bg: "#e0e7ff", fg: "#3730a3" },
          cyan: { bg: "#cffafe", fg: "#0e7490" },
        };
        // Select colors (editable): solid bg + white text — matches PHP .team-select
        const TEAM_SELECT: Record<string, { bg: string; fg: string }> = {
          blue: { bg: "#3b82f6", fg: "#fff" },
          orange: { bg: "#f97316", fg: "#fff" },
          green: { bg: "#22c55e", fg: "#fff" },
          yellow: { bg: "#eab308", fg: "#1f2937" },
          purple: { bg: "#a855f7", fg: "#fff" },
          red: { bg: "#ef4444", fg: "#fff" },
          pink: { bg: "#ec4899", fg: "#fff" },
          teal: { bg: "#14b8a6", fg: "#fff" },
          indigo: { bg: "#6366f1", fg: "#fff" },
          cyan: { bg: "#06b6d4", fg: "#fff" },
        };

        const badge = teamColor ? TEAM_BADGE[teamColor] : null;
        const sel = teamColor ? TEAM_SELECT[teamColor] : null;

        if (!editable) {
          if (!teamName)
            return <span className="text-xs text-muted-foreground">-</span>;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                isInactiveTeam && "opacity-60",
              )}
              style={
                badge
                  ? { backgroundColor: badge.bg, color: badge.fg }
                  : { backgroundColor: "#f1f5f9", color: "#64748b" }
              }
            >
              {teamName}
              {isInactiveTeam && " ⏸"}
            </span>
          );
        }
        return (
          <select
            value={hearing.mr_team_id != null ? String(hearing.mr_team_id) : ""}
            onChange={(e) =>
              onUpdate(
                hearing.id,
                "mr_team_id",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="h-6 w-full rounded border border-transparent px-1 text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
            style={
              sel
                ? { backgroundColor: sel.bg, color: sel.fg }
                : isInactiveTeam
                  ? { backgroundColor: "#f1f5f9", color: "#64748b" }
                  : undefined
            }
          >
            <option value="" className="text-foreground bg-card font-normal">
              -
            </option>
            {teamOptions.map((o) => (
              <option
                key={o.value}
                value={o.value}
                className="text-foreground bg-card font-normal"
              >
                {o.label}
              </option>
            ))}
            {hearing.mr_team_id &&
              !teamOptions.find(
                (o) => o.value === String(hearing.mr_team_id),
              ) && (
                <option
                  value={String(hearing.mr_team_id)}
                  disabled
                  className="text-muted-foreground bg-card font-normal"
                >
                  {teamName} (inactive)
                </option>
              )}
          </select>
        );
      }
      case "medical_record_status":
        return (
          <InlineDropdown
            value={hearing.medical_record_status}
            options={mrStatusOptions}
            onSave={(v) => onUpdate(hearing.id, "medical_record_status", v)}
            editable={editable}
            colorMap={MR_STATUS_COLORS}
          />
        );
      case "rfc_status":
        return (
          <InlineDropdown
            value={hearing.rfc_status}
            options={rfcFallback}
            onSave={(v) => onUpdate(hearing.id, "rfc_status", v)}
            editable={editable}
            colorMap={RFC_COLORS}
          />
        );
      case "brief_assigned_to":
        return (
          <InlineDropdown
            value={hearing.brief_assigned_to}
            options={briefOptions}
            onSave={(v) => onUpdate(hearing.id, "brief_assigned_to", v)}
            editable={editable}
          />
        );
      case "hearing_decision_status":
        return (
          <InlineDropdown
            value={hearing.hearing_decision_status}
            options={decisionOptions}
            onSave={(v) => onUpdate(hearing.id, "hearing_decision_status", v)}
            editable={editable}
            colorMap={DECISION_COLORS}
          />
        );
      case "post_hrg_review":
        return (
          <PostHrgCell
            hearing={hearing}
            onClick={() => onOpenPostHrg(hearing)}
          />
        );
      case "medical_record_link":
        return hearing.medical_record_link ? (
          <a
            href={hearing.medical_record_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      case "task_assigned":
      case "rep_docs_complete":
      case "fee_agreement_complete":
      case "five_day_notice":
      case "phi_sheet_complete":
        return (
          <InlineCheck
            checked={hearing[col.key as HearingBoolField]}
            onToggle={(val) => onUpdate(hearing.id, col.key, val)}
            editable={editable}
          />
        );
      default:
        return <span className="text-xs">-</span>;
    }
  };

  // Calculate total table width for the scrollbar
  // const tableWidth = columns.reduce((s, c) => s + c.w, 0);

  // ── Virtualization — only render visible rows ──
  const ROW_H = 36;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: hearings.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  return (
    <>
      <div className="w-full overflow-hidden rounded-lg border">
        <div
          ref={(node) => {
            (
              parentRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node;
            if (typeof scrollRef === "object" && scrollRef !== null) {
              (
                scrollRef as React.MutableRefObject<HTMLDivElement | null>
              ).current = node;
            }
          }}
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 320px)" }}
          onWheel={(e) => {
            if (e.shiftKey) {
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          <table
            data-hearing-table
            className="border-collapse text-sm"
            style={{ minWidth: columns.reduce((s, c) => s + c.w, 0) }}
          >
            <thead className="sticky top-0 z-30">
              <tr>
                {columns.map((col) => {
                  const leftPos = getLeftPos(col.key);
                  const isLF = col.key === lastFrozenKey;
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "h-10 whitespace-nowrap border-b-2 border-border px-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground/80",
                        headerBg,
                        col.sortable &&
                          "cursor-pointer select-none hover:text-foreground",
                        col.frozen && "sticky z-20 overflow-hidden",
                        isLF &&
                          "border-r-2 border-r-blue-400/40 dark:border-r-blue-500/40",
                      )}
                      style={{
                        width: col.w,
                        minWidth: col.w,
                        maxWidth: col.frozen ? col.w : undefined,
                        ...(leftPos !== undefined ? { left: leftPos } : {}),
                      }}
                      onClick={() => col.sortable && onSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {col.key === "checkbox" && isAdmin ? (
                          <input
                            type="checkbox"
                            defaultChecked={false}
                            data-select-all-checkbox
                            onChange={onToggleAll}
                            className="h-4 w-4 accent-purple-600 cursor-pointer"
                          />
                        ) : (
                          col.label
                        )}
                        {col.sortable &&
                          sortKey === col.key &&
                          (sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          ))}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {hearings.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No hearings found.
                  </td>
                </tr>
              ) : (
                <>
                  {/* Top spacer — uses a single cell spanning all columns */}
                  {(virtualizer.getVirtualItems()[0]?.start ?? 0) > 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        style={{
                          height: virtualizer.getVirtualItems()[0]?.start ?? 0,
                          padding: 0,
                          border: "none",
                        }}
                      />
                    </tr>
                  )}
                  {virtualizer.getVirtualItems().map((vRow) => {
                    const h = hearings[vRow.index];
                    return (
                      <MemoRow
                        key={h.id}
                        hearing={h}
                        ri={vRow.index}
                        isSelected={false}
                        isAdmin={isAdmin}
                        evenBg={evenBg}
                        oddBg={oddBg}
                        getLeftPos={getLeftPos}
                        lastFrozenKey={lastFrozenKey}
                        renderCell={renderCell}
                        columns={columns}
                      />
                    );
                  })}
                  {/* Bottom spacer */}
                  {(() => {
                    const items = virtualizer.getVirtualItems();
                    const lastEnd = items[items.length - 1]?.end ?? 0;
                    const remaining = virtualizer.getTotalSize() - lastEnd;
                    return remaining > 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          style={{
                            height: remaining,
                            padding: 0,
                            border: "none",
                          }}
                        />
                      </tr>
                    ) : null;
                  })()}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
});

// ══════════════════════════════════════════════════════════════
// MAIN — SERVER-SIDE PAGINATION
// ══════════════════════════════════════════════════════════════
interface DashboardClientProps {
  initialHearings: HearingRow[];
  initialTotalFiltered: number;
  totalCount: number;
  stats: {
    total: number;
    assigned: number;
    unassigned: number;
    wdStatus: number;
    next7Days: number;
    thisMonth: number;
  };
  representatives: RepRow[];
  mrTeams: MrTeamRow[];
  configOptions: ConfigOptionRow[];
  repDocsAssignees: RepDocsAssigneeRow[];
  repCounts: RepWithCount[];
  nextUnassigned: NextUnassignedRow | null;
  userRole: UserRole;
  userEmail: string;
  userName: string;
}

export function DashboardClient({
  initialHearings = [],
  initialTotalFiltered = 0,
  totalCount = 0,
  stats,
  representatives = [],
  mrTeams = [],
  configOptions = [],
  repDocsAssignees = [],
  repCounts = [],
  nextUnassigned = null,
  userRole,
  userEmail,
  userName,
}: DashboardClientProps) {
  const [filters, setFilters] = useState<HearingFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [hearings, setHearings] = useState(initialHearings);
  const [totalFiltered, setTotalFiltered] = useState(initialTotalFiltered);
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [, startTransition] = useTransition();
  const [postHrgHearing, setPostHrgHearing] = useState<HearingRow | null>(null);
  const [showAddHearing, setShowAddHearing] = useState(false);
  const [showEmailAll, setShowEmailAll] = useState(false);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [showUnassignAll, setShowUnassignAll] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showRepStats, setShowRepStats] = useState(false);
  const [showCsvCompare, setShowCsvCompare] = useState(false);
  // Selection is 100% DOM-based — no React state at all for checkbox clicks
  // The bulk action bar reads from the ref only when the user clicks an action
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const bulkBarRef = useRef<HTMLDivElement>(null);
  const bulkCountRef = useRef<HTMLSpanElement>(null);

  const syncBulkBar = useCallback(() => {
    const count = selectedIdsRef.current.size;
    if (bulkBarRef.current)
      bulkBarRef.current.style.display = count > 0 ? "flex" : "none";
    if (bulkCountRef.current)
      bulkCountRef.current.textContent = `${count} selected`;
    // Adjust fake scroll spacer
    const spacer = document.querySelector(
      "[data-scroll-spacer]",
    ) as HTMLElement | null;
    if (spacer) spacer.style.bottom = count > 0 ? "48px" : "0px";
  }, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-side fetch
  const fetchPage = useCallback(
    async (
      f: HearingFilters,
      p: number,
      ps: number,
      sk: string,
      sd: "asc" | "desc",
    ) => {
      setLoading(true);
      try {
        const res = await fetchHearingsPage({
          page: p,
          pageSize: ps,
          search: f.search || undefined,
          dateFrom: f.dateFrom || undefined,
          dateTo: f.dateTo || undefined,
          month: f.month || undefined,
          year: f.year || undefined,
          repId: f.repId || undefined,
          decisionStatus: f.decisionStatus || undefined,
          mrTeamId: f.mrTeamId || undefined,
          medicalRecordStatus: f.medicalRecordStatus || undefined,
          assignmentStatus: f.assignmentStatus || undefined,
          datePreset: f.datePreset || undefined,
          sortKey: sk || undefined,
          sortDir: sk ? sd : undefined,
          userRole,
          userEmail,
        });
        setHearings(res.hearings);
        setTotalFiltered(res.totalFiltered);
      } catch (e) {
        console.error("Fetch failed:", e);
      }
      setLoading(false);
    },
    [userRole, userEmail],
  );

  // Debounced filter change
  const handleFilterChange = useCallback(
    (newFilters: HearingFilters) => {
      setFilters(newFilters);
      setPage(1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchPage(newFilters, 1, pageSize, sortKey, sortDir);
      }, 300);
    },
    [fetchPage, pageSize, sortKey, sortDir],
  );

  // Instant page/pageSize/sort change
  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      fetchPage(filters, p, pageSize, sortKey, sortDir);
    },
    [fetchPage, filters, pageSize, sortKey, sortDir],
  );
  const handlePageSizeChange = useCallback(
    (ps: number) => {
      setPageSize(ps);
      setPage(1);
      fetchPage(filters, 1, ps, sortKey, sortDir);
    },
    [fetchPage, filters, sortKey, sortDir],
  );
  const handleSort = useCallback(
    (key: string) => {
      const newDir =
        sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
      setSortKey(key);
      setSortDir(newDir as "asc" | "desc");
      fetchPage(filters, page, pageSize, key, newDir as "asc" | "desc");
    },
    [sortKey, sortDir, fetchPage, filters, page, pageSize],
  );

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  // Field update notification toast
  const [updateToast, setUpdateToast] = useState<string | null>(null);
  const updateToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpdate = useCallback(
    async (hearingId: number, field: string, value: UpdateValue) => {
      // Find claimant name for toast
      const hearing = hearings.find((h) => h.id === hearingId);
      const claimantName = hearing?.claimant || "";

      // Resolve display value for toast
      let displayValue = String(value ?? "");
      if (field === "assigned_rep_id" && value) {
        displayValue =
          representatives.find((r) => r.id === Number(value))?.name ||
          displayValue;
      } else if (field === "mr_team_id" && value) {
        displayValue =
          mrTeams.find((t) => t.id === Number(value))?.team_name ||
          displayValue;
      } else if (
        [
          "task_assigned",
          "rep_docs_complete",
          "fee_agreement_complete",
          "five_day_notice",
          "phi_sheet_complete",
        ].includes(field)
      ) {
        displayValue = value ? "✓ checked" : "unchecked";
      } else if (!value) {
        displayValue = "cleared";
      }

      const label = FIELD_LABELS[field] || field.replace(/_/g, " ");
      const toastMsg = `${label} → ${displayValue}${claimantName ? ` • ${claimantName}` : ""}`;

      // Show toast
      if (updateToastTimer.current) clearTimeout(updateToastTimer.current);
      setUpdateToast(toastMsg);
      updateToastTimer.current = setTimeout(() => setUpdateToast(null), 3000);

      // Optimistic update — immediately reflect in UI
      setHearings((prev) =>
        prev.map((h) => {
          if (h.id !== hearingId) return h;
          const updated = { ...h, [field]: value };
          if (field === "assigned_rep_id") {
            const rep = representatives.find((r) => r.id === Number(value));
            updated.rep_name = rep?.name ?? null;
            updated.rep_type = rep?.rep_type ?? null;
          }
          if (field === "mr_team_id") {
            const team = mrTeams.find((t) => t.id === Number(value));
            updated.mr_team_name = team?.team_name ?? null;
            updated.mr_team_color = team?.team_color ?? null;
          }
          return updated;
        }),
      );
      if (
        postHrgHearing?.id === hearingId &&
        (field === "post_hrg_notes" || field === "post_hrg_deadline")
      ) {
        setPostHrgHearing((prev) =>
          prev ? { ...prev, [field]: value } : null,
        );
      }
      // Server update in background
      updateHearing(hearingId, field, value).catch((e) =>
        console.error("Update failed:", e),
      );
    },
    [representatives, mrTeams, postHrgHearing, hearings],
  );

  const handleDelete = useCallback(async (hearingId: number) => {
    setHearings((prev) => prev.filter((h) => h.id !== hearingId));
    setTotalFiltered((p) => p - 1);
    startTransition(async () => {
      try {
        await deleteHearing(hearingId);
      } catch (e) {
        console.error("Delete failed:", e);
      }
    });
  }, []);

  const [editHearing, setEditHearing] = useState<HearingRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const editFormRef = useRef<HTMLFormElement>(null);

  const handleEdit = useCallback((hearing: HearingRow) => {
    setEditHearing(hearing);
  }, []);

  const handleEditSave = async () => {
    if (!editHearing || !editFormRef.current) return;
    setEditSaving(true);
    try {
      const fd = new FormData(editFormRef.current);
      const original = editHearing as unknown as Record<string, unknown>;
      const textFields = [
        "claimant",
        "ssn_last_4",
        "claim_type",
        "hearing_date",
        "hearing_time",
        "time_zone",
        "alj",
        "city",
        "state",
        "claimant_location",
        "representative_location",
        "medical_expert",
        "vocational_expert",
        "status_date",
        "entered_hearing_level_date",
        "download_type",
      ];
      const boolFields = [
        "task_assigned",
        "rep_docs_complete",
        "fee_agreement_complete",
        "five_day_notice",
        "phi_sheet_complete",
      ];

      for (const key of textFields) {
        const val = fd.get(key) as string | null;
        const newVal = val === "" ? null : val;
        if (original[key] !== newVal)
          await updateHearing(editHearing.id, key, newVal);
      }
      for (const key of boolFields) {
        const checked = fd.get(key) === "on";
        if (original[key] !== checked)
          await updateHearing(editHearing.id, key, checked);
      }
      // Refetch current page to reflect changes
      await fetchPage(filters, page, pageSize, sortKey, sortDir);
      setEditHearing(null);
    } catch (e) {
      console.error("Save failed:", e);
      alert("Save failed");
    }
    setEditSaving(false);
  };

  // Auto-assign loading state
  const [autoAssignStatus, setAutoAssignStatus] = useState<{
    hearingId: number;
    state: "loading" | "success" | "error";
    message: string;
  } | null>(null);

  const handleAutoAssign = useCallback(
    async (hearingId: number) => {
      const hearing = hearings.find((h) => h.id === hearingId);
      setAutoAssignStatus({
        hearingId,
        state: "loading",
        message: `Finding best rep for ${hearing?.claimant || `#${hearingId}`}...`,
      });
      try {
        const result = await autoAssignSingle(hearingId);
        if (result.success) {
          const rep = representatives.find((r) => r.name === result.rep_name);
          if (rep) {
            setHearings((prev) =>
              prev.map((h) =>
                h.id === hearingId
                  ? {
                      ...h,
                      assigned_rep_id: rep.id,
                      rep_name: rep.name,
                      rep_type: rep.rep_type,
                      assignment_status: null,
                    }
                  : h,
              ),
            );
          }
          const repCount =
            hearings.filter((h) => h.rep_name === result.rep_name).length + 1;
          setAutoAssignStatus({
            hearingId,
            state: "success",
            message: `Assigned to ${result.rep_name} (${repCount} total)`,
          });
        } else {
          setAutoAssignStatus({
            hearingId,
            state: "error",
            message: result.message || "No eligible reps",
          });
        }
      } catch {
        setAutoAssignStatus({
          hearingId,
          state: "error",
          message: "Auto-assign failed",
        });
      }
      setTimeout(() => setAutoAssignStatus(null), 3000);
    },
    [representatives, hearings],
  );

  // Granular permissions matching PHP dashboard
  const showCheckbox = canSeeCheckbox(userRole);
  const showAdminButtons = canSeeAdminButtons(userRole);
  const showActivityLogBtn = canSeeActivityLog(userRole);
  const showRepStatsBtn = canSeeRepStats(userRole);
  const canCsvCompare = canSeeCsvCompare(userRole);
  const showRepFilter = canSeeRepFilter(userRole);
  const showNextUnassigned = canSeeNextUnassigned(userRole);
  const showExport = canExport(userRole);
  const hasManageAccess = canManage(userRole);

  // const handleRefresh = () => {
  //   fetchPage(filters, page, pageSize, sortKey, sortDir);
  // };

  // Scroll sync for sticky horizontal scrollbar
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Native event delegation for checkbox clicks — zero React overhead
  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (
        target.matches("input[data-row-checkbox]") &&
        target.dataset.hearingId
      ) {
        const id = Number(target.dataset.hearingId);
        const s = selectedIdsRef.current;
        if (s.has(id)) s.delete(id);
        else s.add(id);
        syncBulkBar();
      }
    };
    const table = document.querySelector("[data-hearing-table]");
    if (table) table.addEventListener("change", handler);
    return () => {
      if (table) table.removeEventListener("change", handler);
    };
  }, [syncBulkBar]);

  // Bulk selection — pure DOM, zero React re-renders on checkbox click
  const toggleAll = useCallback(() => {
    const s = selectedIdsRef.current;
    const wasAll = s.size === hearings.length;
    if (wasAll) {
      s.clear();
    } else {
      hearings.forEach((h) => s.add(h.id));
    }
    syncBulkBar();
    const container = document.querySelector("[data-hearing-table]");
    if (container) {
      container
        .querySelectorAll<HTMLInputElement>("input[data-row-checkbox]")
        .forEach((cb) => {
          cb.checked = !wasAll;
        });
      const selectAllCb = container.querySelector<HTMLInputElement>(
        "input[data-select-all-checkbox]",
      );
      if (selectAllCb) selectAllCb.checked = !wasAll;
    }
  }, [hearings, syncBulkBar]);
  const clearSelection = useCallback(() => {
    selectedIdsRef.current.clear();
    syncBulkBar();
    const container = document.querySelector("[data-hearing-table]");
    if (container) {
      container
        .querySelectorAll<HTMLInputElement>(
          "input[data-row-checkbox], input[data-select-all-checkbox]",
        )
        .forEach((cb) => {
          cb.checked = false;
        });
    }
  }, [syncBulkBar]);

  const handleBulkUnassign = useCallback(async () => {
    if (!confirm(`Unassign ${selectedIdsRef.current.size} hearings?`)) return;
    const ids = Array.from(selectedIdsRef.current);
    for (const id of ids) {
      await updateHearing(id, "assigned_rep_id", null);
    }
    clearSelection();
    fetchPage(filters, page, pageSize, sortKey, sortDir);
  }, [filters, page, pageSize, sortKey, sortDir, fetchPage, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    if (
      !confirm(
        `Delete ${selectedIdsRef.current.size} hearings? This cannot be undone.`,
      )
    )
      return;
    const ids = Array.from(selectedIdsRef.current);
    for (const id of ids) {
      await deleteHearing(id);
    }
    clearSelection();
    fetchPage(filters, page, pageSize, sortKey, sortDir);
  }, [filters, page, pageSize, sortKey, sortDir, fetchPage, clearSelection]);

  return (
    <div suppressHydrationWarning>
      <AppHeader
        title="Hearing Dashboard"
        subtitle={`${totalCount} total hearings`}
        actions={
          showExport ? (
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 gap-1.5 text-xs", BTN_PRESS)}
              onClick={async () => {
                try {
                  const csvRows = await exportHearingsCsv({
                    ...filters,
                    page: 1,
                    pageSize: 999999,
                    sortKey,
                    sortDir,
                  });
                  if (!csvRows.length) {
                    alert("No data to export");
                    return;
                  }
                  const headers = Object.keys(csvRows[0]);
                  const csv = [
                    headers.join(","),
                    ...csvRows.map((r) =>
                      headers
                        .map(
                          (h) =>
                            `"${String((r as Record<string, string>)[h] || "").replace(/"/g, '""')}"`,
                        )
                        .join(","),
                    ),
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `hearings-export-${new Date().toISOString().split("T")[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  alert("Export failed");
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          ) : undefined
        }
      />
      <div className="flex min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6">
        {/* Navbar with page links + action buttons (matches old dashboard) */}
        <DashboardNav userRole={userRole}>
          {showAdminButtons && (
            <>
              <Button
                size="sm"
                className={cn("h-7 gap-1.5 text-[11px]", BTN_PRESS)}
                onClick={() => setShowEmailAll(true)}
              >
                📧 Email All
              </Button>
              <Button
                size="sm"
                className={cn(
                  "h-7 gap-1.5 text-[11px] bg-purple-600 hover:bg-purple-700",
                  BTN_PRESS,
                )}
                onClick={() => setShowAutoAssign(true)}
              >
                ⚡ Auto-Assign All
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className={cn("h-7 gap-1.5 text-[11px]", BTN_PRESS)}
                onClick={() => setShowUnassignAll(true)}
              >
                🗑️ Unassign All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 gap-1.5 text-[11px] text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950",
                  BTN_PRESS,
                )}
                onClick={() => setShowAddHearing(true)}
              >
                + Add Hearing
              </Button>
            </>
          )}
          {canCsvCompare && (
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 gap-1.5 text-[11px]", BTN_PRESS)}
              onClick={() => setShowCsvCompare(true)}
            >
              📊 CSV Compare
            </Button>
          )}
        </DashboardNav>

        <StatsRow stats={stats} userRole={userRole} />
        <FilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          repCounts={repCounts}
          nextUnassigned={nextUnassigned}
          showRepFilter={showRepFilter}
          showNextUnassigned={showNextUnassigned}
        />

        {/* Pagination bar */}
        <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-xs text-muted-foreground tabular-nums">
            Showing {totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, totalFiltered)} of {totalFiltered}
            {totalFiltered !== totalCount && ` (filtered from ${totalCount})`}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {showActivityLogBtn && (
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 gap-1.5 text-xs", BTN_PRESS)}
                onClick={() => setShowActivityLog(true)}
              >
                <ClipboardList className="h-3.5 w-3.5" /> Activity Log
              </Button>
            )}
            {showRepStatsBtn && (
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 gap-1.5 text-xs", BTN_PRESS)}
                onClick={() => setShowRepStats(true)}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Rep Stats
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <select
              className={SEL_SM + " min-w-17.5"}
              value={String(page)}
              onChange={(e) => handlePageChange(Number(e.target.value))}
            >
              {Array.from({ length: Math.max(1, totalPages) }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  Page {i + 1}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <select
              className={SEL_SM + " min-w-21.25"}
              value={String(pageSize)}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            >
              {[25, 50, 100, 200, 500].map((s) => (
                <option key={s} value={String(s)}>
                  {s} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="hidden items-center gap-2 text-[10px] text-muted-foreground md:flex">
          <span>Left columns frozen</span>
          <span className="text-border">|</span>
          <span>Shift + scroll to pan right</span>
          {userRole !== "rep" && (
            <>
              <span className="text-border">|</span>
              <span>Claimants without Case Link appear at top</span>
            </>
          )}
        </div>

        {/* Mobile: Cards */}
        {/* Mobile cards — only mount on small screens */}
        {isMobile && (
          <div
            className={cn(
              "relative flex flex-col gap-2",
              loading && "opacity-50 pointer-events-none",
            )}
          >
            {hearings.map((h) => (
              <HearingCard
                key={h.id}
                hearing={h}
                userRole={userRole}
                onUpdate={handleUpdate}
                onOpenPostHrg={setPostHrgHearing}
              />
            ))}
            {hearings.length === 0 && !loading && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No hearings found.
              </div>
            )}
          </div>
        )}

        {/* Desktop table */}
        {/* Desktop: Table */}
        <div
          className={cn(
            "relative hidden min-w-0 md:block",
            loading && "opacity-50 pointer-events-none",
          )}
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          <HearingTable
            hearings={hearings}
            userRole={userRole}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onOpenPostHrg={setPostHrgHearing}
            onEdit={handleEdit}
            onAutoAssign={handleAutoAssign}
            configOptions={configOptions}
            representatives={representatives}
            mrTeams={mrTeams}
            repDocsAssignees={repDocsAssignees}
            showCheckbox={showCheckbox}
            onToggleAll={toggleAll}
            scrollRef={tableScrollRef}
          />
        </div>
      </div>

      {/* Post HRG Modal */}
      {postHrgHearing && (
        <PostHrgModal
          hearing={postHrgHearing}
          onClose={() => setPostHrgHearing(null)}
          onSave={handleUpdate}
          userName={userName}
        />
      )}

      {/* Action Modals */}
      {showAddHearing && (
        <AddHearingModal
          onClose={() => setShowAddHearing(false)}
          onSuccess={() => fetchPage(filters, page, pageSize, sortKey, sortDir)}
        />
      )}
      {showEmailAll && <EmailAllModal onClose={() => setShowEmailAll(false)} />}
      {showAutoAssign && (
        <AutoAssignModal
          representatives={representatives}
          onClose={() => setShowAutoAssign(false)}
          onSuccess={() => fetchPage(filters, page, pageSize, sortKey, sortDir)}
        />
      )}
      {showUnassignAll && (
        <UnassignAllModal
          onClose={() => setShowUnassignAll(false)}
          onSuccess={() => fetchPage(filters, page, pageSize, sortKey, sortDir)}
        />
      )}
      {showActivityLog && (
        <ActivityLogModal onClose={() => setShowActivityLog(false)} />
      )}
      {showRepStats && <RepStatsModal onClose={() => setShowRepStats(false)} />}
      {showCsvCompare && (
        <CsvCompareModal
          onClose={() => {
            setShowCsvCompare(false);
            fetchPage(filters, page, pageSize, sortKey, sortDir);
          }}
        />
      )}

      {/* Edit hearing modal */}
      {editHearing &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditHearing(null)}
          >
            <div
              className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
                <h2 className="text-sm font-semibold">
                  {hasManageAccess ? "✏️ Edit Hearing" : "👁️ View Hearing"} #
                  {editHearing.id}
                </h2>
                <button
                  onClick={() => setEditHearing(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              <form
                ref={editFormRef}
                className="flex-1 overflow-y-auto p-5 space-y-4"
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Basic Info
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Claimant *
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="claimant"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.claimant ?? ""}
                      />
                    ) : (
                      <p className="text-sm font-medium">
                        {editHearing.claimant}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      SSN (Last 4)
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="ssn_last_4"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        maxLength={4}
                        defaultValue={editHearing.ssn_last_4 ?? ""}
                      />
                    ) : (
                      <p className="text-sm">{editHearing.ssn_last_4 || "-"}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Claim Type
                    </label>
                    {hasManageAccess ? (
                      <select
                        name="claim_type"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.claim_type ?? ""}
                      >
                        <option value="">Select</option>
                        {[
                          "Title II",
                          "Title XVI",
                          "Overpayment",
                          "Concurrent Title II",
                          "Concurrent",
                          "DIB",
                          "SSI",
                        ].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm">{editHearing.claim_type || "-"}</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pt-2">
                  Hearing Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Date *
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="hearing_date"
                        type="date"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.hearing_date ?? ""}
                      />
                    ) : (
                      <p className="text-sm tabular-nums">
                        {editHearing.hearing_date}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Time *
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="hearing_time"
                        type="time"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.hearing_time ?? ""}
                      />
                    ) : (
                      <p className="text-sm tabular-nums">
                        {editHearing.hearing_time}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Timezone *
                    </label>
                    {hasManageAccess ? (
                      <select
                        name="time_zone"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.time_zone ?? ""}
                      >
                        <option value="">Select</option>
                        {[
                          ["ET", "Eastern"],
                          ["CT", "Central"],
                          ["MT", "Mountain"],
                          ["PT", "Pacific"],
                          ["HA", "Hawaii"],
                          ["MSTA", "AZ"],
                        ].map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm">{editHearing.time_zone}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      ALJ
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="alj"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.alj ?? ""}
                      />
                    ) : (
                      <p className="text-sm">{editHearing.alj || "-"}</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pt-2">
                  Location
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      City
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="city"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.city ?? ""}
                      />
                    ) : (
                      <p className="text-sm">{editHearing.city || "-"}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      State
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="state"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        maxLength={2}
                        defaultValue={editHearing.state ?? ""}
                      />
                    ) : (
                      <p className="text-sm">{editHearing.state || "-"}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Claimant Location
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="claimant_location"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.claimant_location ?? ""}
                      />
                    ) : (
                      <p className="text-sm">
                        {editHearing.claimant_location || "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Rep Location
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="representative_location"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.representative_location ?? ""}
                      />
                    ) : (
                      <p className="text-sm">
                        {editHearing.representative_location || "-"}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pt-2">
                  Additional
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Medical Expert
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="medical_expert"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.medical_expert ?? ""}
                      />
                    ) : (
                      <p className="text-sm">
                        {editHearing.medical_expert || "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Vocational Expert
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="vocational_expert"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.vocational_expert ?? ""}
                      />
                    ) : (
                      <p className="text-sm">
                        {editHearing.vocational_expert || "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Status Date
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="status_date"
                        type="date"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.status_date ?? ""}
                      />
                    ) : (
                      <p className="text-sm">
                        {editHearing.status_date || "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Entered Hearing Level
                    </label>
                    {hasManageAccess ? (
                      <input
                        name="entered_hearing_level_date"
                        type="date"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={
                          editHearing.entered_hearing_level_date ?? ""
                        }
                      />
                    ) : (
                      <p className="text-sm">
                        {editHearing.entered_hearing_level_date || "-"}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Download Type
                    </label>
                    {hasManageAccess ? (
                      <select
                        name="download_type"
                        className="h-9 w-full rounded border bg-card px-2 text-sm"
                        defaultValue={editHearing.download_type ?? ""}
                      >
                        <option value="">Select</option>
                        {[
                          "Exhibited",
                          "Exhibited & All",
                          "No Exhibited",
                          "No Exhibited & All",
                          "No SSN Match",
                          "Exhibited & No SSN Match",
                          "No SSN Match & All",
                          "OCR Pre-processing",
                          "Failed & All",
                          "All",
                          "In ERE Queue...",
                          "No Exhibited & Completed",
                          "No Exhibited & No SSN Match",
                        ].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm">
                        {editHearing.download_type || "-"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2 pt-2 border-t">
                  {(
                    [
                      "task_assigned",
                      "rep_docs_complete",
                      "fee_agreement_complete",
                      "five_day_notice",
                      "phi_sheet_complete",
                    ] as const
                  ).map((field) => {
                    const labels: Record<string, string> = {
                      task_assigned: "Task",
                      rep_docs_complete: "Docs",
                      fee_agreement_complete: "Fee",
                      five_day_notice: "5-Day",
                      phi_sheet_complete: "PHI",
                    };
                    return (
                      <label
                        key={field}
                        className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          name={field}
                          defaultChecked={editHearing[field]}
                          className="h-4 w-4 accent-green-600"
                          disabled={!hasManageAccess}
                        />
                        {labels[field]}
                      </label>
                    );
                  })}
                </div>
              </form>
              <div className="flex items-center justify-between border-t bg-muted/50 px-5 py-3 shrink-0">
                <div>
                  {hasManageAccess && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        if (confirm(`Delete hearing #${editHearing.id}?`)) {
                          handleDelete(editHearing.id);
                          setEditHearing(null);
                        }
                      }}
                    >
                      🗑️ Delete
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setEditHearing(null)}
                  >
                    Cancel
                  </Button>
                  {hasManageAccess && (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleEditSave}
                      disabled={editSaving}
                    >
                      {editSaving ? "Saving..." : "💾 Save"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Bulk action bar — only after hydration to avoid SSR mismatch */}
      {mounted &&
        createPortal(
          <div
            ref={bulkBarRef}
            style={{ display: "none" }}
            className="fixed bottom-0 left-0 right-0 z-90 flex items-center justify-between gap-3 border-t bg-card px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]"
          >
            <div className="flex items-center gap-3">
              <span
                ref={bulkCountRef}
                className="flex h-7 items-center rounded-md bg-purple-100 px-3 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              >
                0 selected
              </span>
              <Button
                size="sm"
                className={cn(
                  "h-7 gap-1.5 text-[11px] bg-purple-600 hover:bg-purple-700",
                  BTN_PRESS,
                )}
                onClick={async () => {
                  if (
                    !confirm(
                      `Auto-assign ${selectedIdsRef.current.size} selected hearings?`,
                    )
                  )
                    return;
                  const ids = Array.from(selectedIdsRef.current);
                  setAutoAssignStatus({
                    hearingId: 0,
                    state: "loading",
                    message: `Assigning ${ids.length} hearings...`,
                  });
                  try {
                    const result = await bulkAutoAssignSelected(ids);
                    setAutoAssignStatus({
                      hearingId: 0,
                      state: "success",
                      message: `${result.assigned} assigned, ${result.failed} failed`,
                    });
                    clearSelection();
                    fetchPage(filters, page, pageSize, sortKey, sortDir);
                  } catch (e: unknown) {
                    setAutoAssignStatus({
                      hearingId: 0,
                      state: "error",
                      message: e instanceof Error ? e.message : "Failed",
                    });
                  }
                  setTimeout(() => setAutoAssignStatus(null), 4000);
                }}
              >
                ⚡ Auto-Assign
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 gap-1.5 text-[11px]", BTN_PRESS)}
                onClick={handleBulkUnassign}
              >
                🔄 Unassign
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className={cn("h-7 gap-1.5 text-[11px]", BTN_PRESS)}
                onClick={handleBulkDelete}
              >
                🗑️ Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 gap-1.5 text-[11px]", BTN_PRESS)}
                onClick={async () => {
                  if (
                    !confirm(
                      `Email reps for ${selectedIdsRef.current.size} selected hearings?`,
                    )
                  )
                    return;
                  const ids = Array.from(selectedIdsRef.current);
                  try {
                    const result = await bulkEmailSelected(ids);
                    alert(
                      `Emailed ${result.emailsSent} reps (${result.emailsFailed} failed${result.skippedNoRep > 0 ? `, ${result.skippedNoRep} unassigned` : ""})`,
                    );
                    clearSelection();
                  } catch (e: unknown) {
                    alert(e instanceof Error ? e.message : "Email failed");
                  }
                }}
              >
                📧 Email Selected
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={clearSelection}
            >
              ✕ Clear
            </Button>
          </div>,
          document.body,
        )}

      {/* Field update toast notification */}
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

      {/* Auto-assign toast */}
      {autoAssignStatus &&
        createPortal(
          <div
            className={cn(
              "fixed bottom-6 right-6 z-200 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg",
              autoAssignStatus.state === "loading" &&
                "bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800",
              autoAssignStatus.state === "success" &&
                "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800",
              autoAssignStatus.state === "error" &&
                "bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800",
            )}
          >
            {autoAssignStatus.state === "loading" && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            )}
            {autoAssignStatus.state === "success" && (
              <span className="text-lg text-emerald-600">✓</span>
            )}
            {autoAssignStatus.state === "error" && (
              <span className="text-lg text-red-600">✕</span>
            )}
            <div>
              <p
                className={cn(
                  "text-sm font-medium",
                  autoAssignStatus.state === "loading" &&
                    "text-blue-800 dark:text-blue-300",
                  autoAssignStatus.state === "success" &&
                    "text-emerald-800 dark:text-emerald-300",
                  autoAssignStatus.state === "error" &&
                    "text-red-800 dark:text-red-300",
                )}
              >
                {autoAssignStatus.state === "loading"
                  ? "⚡ Auto-Assigning..."
                  : autoAssignStatus.state === "success"
                    ? "⚡ Assigned!"
                    : "⚡ Failed"}
              </p>
              <p className="text-xs text-muted-foreground">
                {autoAssignStatus.message}
              </p>
            </div>
            <button
              onClick={() => setAutoAssignStatus(null)}
              className="ml-2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── CSV Compare Modal ──────────────────────────────────────────────────────

interface ChronicleEntry {
  claimant: string;
  ssn: string;
  claimType: string;
  hearingDate: string;
  time: string;
  timeZone: string;
  claimantLocation: string;
  repLocation: string;
  alj: string;
  medExpert: string;
  vocExpert: string;
  statusDate: string;
  enteredDate: string;
}

type CompareCategory = "new" | "rescheduled" | "duplicate";

function CsvCompareModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{
    msg: string;
    type: "loading" | "success" | "error";
  } | null>(null);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [results, setResults] = useState<{
    newEntries: (ChronicleEntry & { _cat: "new" })[];
    rescheduled: (ChronicleEntry & {
      _cat: "rescheduled";
      prevDate: string;
      prevClaimant: string;
    })[];
    duplicates: (ChronicleEntry & { _cat: "duplicate" })[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<CompareCategory>("new");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  // Load DB count on mount
  useEffect(() => {
    fetchAllHearingsForCompare().then((d) => setDbCount(d.totalCount));
  }, []);

  const stripSuffix = (name: string) =>
    name.replace(/\s*\([^)]+\)\s*$/g, "").trim();

  const normalizeTime = (t: string) => {
    if (!t) return "";
    const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
    if (!m) return t.toLowerCase().replace(/\s+/g, "");
    let h = parseInt(m[1], 10);
    const ampm = (m[3] || "").toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };

  const normalizeDate = (d: string) => {
    if (!d) return "";
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // MM/DD/YYYY
    const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
    return d;
  };

  const parseChronicleDateTime = (dt: string) => {
    if (!dt) return { date: "", time: "" };
    const parts = dt.trim().split(/\s+/);
    const datePart = normalizeDate(parts[0] || "");
    const timePart = parts.slice(1).join(" ");
    return { date: datePart, time: timePart };
  };

  const handleCompare = async () => {
    if (!file) return;
    setStatus({ msg: "Loading hearings from database...", type: "loading" });
    setResults(null);
    setImportResult(null);

    try {
      const { hearings: dbHearings } = await fetchAllHearingsForCompare();
      setDbCount(dbHearings.length);

      // Build lookup maps from DB
      const exactMap = new Map<string, boolean>();
      const personMap = new Map<string, { date: string; claimant: string }[]>();

      for (const h of dbHearings) {
        const base = stripSuffix(h.claimant || "").toLowerCase();
        const ssn = (h.ssn_last_4 || "").trim();
        const date = h.hearing_date || "";
        const time = normalizeTime(
          h.hearing_time || h.converted_time_est || "",
        );

        if (base && ssn) {
          exactMap.set(`${base}|${ssn}|${date}|${time}`, true);
          const pk = `${base}|${ssn}`;
          if (!personMap.has(pk)) personMap.set(pk, []);
          personMap.get(pk)!.push({ date, claimant: h.claimant });
        }
      }

      setStatus({ msg: "Parsing Chronicle CSV...", type: "loading" });

      // Parse CSV
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));

      const col = (row: string[], name: string) => {
        const idx = headers.findIndex((h) =>
          h.toLowerCase().includes(name.toLowerCase()),
        );
        return idx >= 0 ? (row[idx] || "").trim().replace(/^"|"$/g, "") : "";
      };

      const newEntries: (ChronicleEntry & { _cat: "new" })[] = [];
      const rescheduled: (ChronicleEntry & {
        _cat: "rescheduled";
        prevDate: string;
        prevClaimant: string;
      })[] = [];
      const duplicates: (ChronicleEntry & { _cat: "duplicate" })[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        // Simple CSV parse (handles basic quoting)
        const row =
          lines[i]
            .match(/(".*?"|[^,]*)/g)
            ?.map((c) => c.trim().replace(/^"|"$/g, "")) || [];

        const firstName = col(row, "client_firstName");
        const lastName = col(row, "client_lastName");
        const fullName = `${firstName} ${lastName}`.trim();
        if (!fullName || fullName === " ") continue;
        const ssn = col(row, "client_last4Ssn");
        const { date: hDate, time: hTime } = parseChronicleDateTime(
          col(row, "hearingScheduledDatetime"),
        );

        let claimType = col(row, "claimType");
        if (claimType.includes("TITLE 2") && claimType.includes("TITLE 16"))
          claimType = "Concurrent";
        else if (claimType.includes("TITLE 2")) claimType = "Title II";
        else if (claimType.includes("TITLE 16")) claimType = "Title XVI";

        const entry: ChronicleEntry = {
          claimant: fullName,
          ssn,
          claimType,
          hearingDate: hDate,
          time: hTime,
          timeZone: "ET",
          claimantLocation: col(row, "aljLocation") || "By Phone",
          repLocation: col(row, "aljLocation") || "By Phone",
          alj: col(row, "aljFullName"),
          medExpert: col(row, "medicalExpert"),
          vocExpert: col(row, "vocationalExpert"),
          statusDate: col(row, "statusDate"),
          enteredDate: col(row, "hearingRequestDate"),
        };

        const nameLower = fullName.toLowerCase();
        const normTime = normalizeTime(hTime);
        const normDate = normalizeDate(hDate);

        // Exact duplicate?
        if (exactMap.has(`${nameLower}|${ssn}|${normDate}|${normTime}`)) {
          duplicates.push({ ...entry, _cat: "duplicate" });
          continue;
        }

        // Rescheduled? (same person, different date)
        const pk = `${nameLower}|${ssn}`;
        if (personMap.has(pk)) {
          const prev = personMap
            .get(pk)!
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          rescheduled.push({
            ...entry,
            _cat: "rescheduled",
            prevDate: prev.date,
            prevClaimant: prev.claimant,
          });
          continue;
        }

        newEntries.push({ ...entry, _cat: "new" });
      }

      setResults({ newEntries, rescheduled, duplicates });
      const total = newEntries.length + rescheduled.length + duplicates.length;
      setStatus({
        msg: `Compared ${total} entries: ${newEntries.length} new, ${rescheduled.length} rescheduled, ${duplicates.length} duplicates`,
        type: "success",
      });
      setActiveTab(
        newEntries.length > 0
          ? "new"
          : rescheduled.length > 0
            ? "rescheduled"
            : "duplicate",
      );
    } catch (e: unknown) {
      setStatus({
        msg: e instanceof Error ? e.message : "Compare failed",
        type: "error",
      });
    }
  };

  const handleImport = async () => {
    if (!results) return;
    const toImport = [...results.newEntries, ...results.rescheduled].map(
      (e) => ({
        claimant:
          e._cat === "rescheduled" ? `${e.claimant} (Rescheduled)` : e.claimant,
        ssn_last_4: e.ssn,
        claim_type: e.claimType,
        hearing_date: e.hearingDate,
        hearing_time: e.time,
        time_zone: e.timeZone,
        claimant_location: e.claimantLocation,
        representative_location: e.repLocation,
        alj: e.alj,
        medical_expert: e.medExpert,
        vocational_expert: e.vocExpert,
        status_date: e.statusDate,
        entered_hearing_level_date: e.enteredDate,
      }),
    );
    if (!toImport.length) return;
    setImporting(true);
    try {
      const result = await importChronicleEntries(toImport);
      setImportResult(result);
    } catch {
      setImportResult({ imported: 0, skipped: toImport.length });
    }
    setImporting(false);
  };

  const migrateCount = results
    ? results.newEntries.length + results.rescheduled.length
    : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">
              📊 CSV Compare — Chronicle Legal
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload a Chronicle CSV export to compare against{" "}
              {dbCount?.toLocaleString() ?? "..."} hearings in DB
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Upload */}
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <span className="text-lg">📁</span>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {file ? file.name : "Choose Chronicle CSV file"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : "Export from Chronicle Legal → Upload here"}
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResults(null);
                  setImportResult(null);
                }}
              />
            </label>
            <Button
              size="sm"
              disabled={!file || status?.type === "loading"}
              onClick={handleCompare}
              className="h-10 gap-1.5"
            >
              {status?.type === "loading" ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Compare
            </Button>
          </div>

          {/* Status */}
          {status && (
            <div
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm",
                status.type === "loading" &&
                  "bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800",
                status.type === "success" &&
                  "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
                status.type === "error" &&
                  "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800",
              )}
            >
              {status.msg}
            </div>
          )}

          {/* Results */}
          {results && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-emerald-50/50 p-3 text-center dark:bg-emerald-950/20">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {results.newEntries.length}
                  </p>
                  <p className="text-xs text-muted-foreground">New</p>
                </div>
                <div className="rounded-lg border bg-blue-50/50 p-3 text-center dark:bg-blue-950/20">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                    {results.rescheduled.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Rescheduled</p>
                </div>
                <div className="rounded-lg border bg-amber-50/50 p-3 text-center dark:bg-amber-950/20">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {results.duplicates.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Duplicates</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1.5 border-b">
                {[
                  {
                    key: "new" as const,
                    label: "New",
                    count: results.newEntries.length,
                    color: "text-emerald-600",
                  },
                  {
                    key: "rescheduled" as const,
                    label: "Rescheduled",
                    count: results.rescheduled.length,
                    color: "text-blue-600",
                  },
                  {
                    key: "duplicate" as const,
                    label: "Duplicates",
                    count: results.duplicates.length,
                    color: "text-amber-600",
                  },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      "flex items-center gap-1.5 pb-2 px-3 text-xs font-medium border-b-2 transition-colors",
                      activeTab === t.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}{" "}
                    <span
                      className={cn(
                        "tabular-nums",
                        activeTab !== t.key && t.color,
                      )}
                    >
                      ({t.count})
                    </span>
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-auto max-h-75 rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        Claimant
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        SSN
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        Type
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        Date
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        Time
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold">
                        ALJ
                      </th>
                      {activeTab === "rescheduled" && (
                        <th className="px-2 py-1.5 text-left font-semibold">
                          Previous Date
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(activeTab === "new"
                      ? results.newEntries
                      : activeTab === "rescheduled"
                        ? results.rescheduled
                        : results.duplicates
                    ).map((entry, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-2 py-1.5 font-medium">
                          {entry.claimant}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                          {entry.ssn || "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {entry.claimType || "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {entry.hearingDate}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {entry.time || "—"}
                        </td>
                        <td className="px-2 py-1.5">{entry.alj || "—"}</td>
                        {activeTab === "rescheduled" && "prevDate" in entry && (
                          <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                            {entry.prevDate}
                          </td>
                        )}
                      </tr>
                    ))}
                    {(activeTab === "new"
                      ? results.newEntries
                      : activeTab === "rescheduled"
                        ? results.rescheduled
                        : results.duplicates
                    ).length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-6 text-center text-muted-foreground"
                        >
                          No entries in this category
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Import result */}
              {importResult && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                  ✅ Imported {importResult.imported} hearings
                  {importResult.skipped > 0 &&
                    ` (${importResult.skipped} skipped)`}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {results && migrateCount > 0 && !importResult && (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={importing}
              onClick={handleImport}
            >
              {importing ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                "🚀"
              )}
              Migrate {migrateCount} to Hearings
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
