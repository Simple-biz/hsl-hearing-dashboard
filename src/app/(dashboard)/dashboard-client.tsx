"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
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
import { canEditField, type UserRole } from "@/lib/roles";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AddHearingModal,
  EmailAllModal,
  AutoAssignModal,
  UnassignAllModal,
} from "@/components/modals";
import { updateHearing } from "./actions";
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
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  editable?: boolean;
}) {
  return (
    <div className="flex items-center justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => editable && onToggle(v === true)}
        disabled={!editable}
        className="h-4 w-4"
      />
    </div>
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
function ActionMenu({
  hearing,
  userRole,
  onUpdate,
}: {
  hearing: HearingRow;
  userRole: UserRole;
  onUpdate: (id: number, field: string, value: UpdateValue) => void;
}) {
  const isAdmin = !["rep", "staff"].includes(userRole);
  const isUnassigned = !hearing.assigned_rep_id && !hearing.assignment_status;
  const isAssigned = !!hearing.assigned_rep_id;
  const hasStatus = !!hearing.assignment_status;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {isAdmin && (
          <>
            {isUnassigned && (
              <>
                <DropdownMenuItem className="text-xs">
                  📋 Assign
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs">
                  ⚡ Auto-Assign
                </DropdownMenuItem>
              </>
            )}
            {isAssigned && (
              <>
                <DropdownMenuItem className="text-xs">
                  📧 Send Email
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => onUpdate(hearing.id, "assigned_rep_id", null)}
                >
                  🔄 Unassign
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs">
                  🚫 Withdrawal
                </DropdownMenuItem>
              </>
            )}
            {hasStatus && !isAssigned && (
              <>
                <DropdownMenuItem className="text-xs">
                  📋 Change Assignment
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => onUpdate(hearing.id, "assigned_rep_id", null)}
                >
                  🔄 Clear Status
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="text-xs">
          {isAdmin ? (
            <>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
            </>
          ) : (
            <>
              <Eye className="mr-2 h-3.5 w-3.5" /> View
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs">📝 Activity Log</DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
}: {
  hearing: HearingRow;
  onClose: () => void;
  onSave: (id: number, field: string, value: UpdateValue) => void;
}) {
  const notes = parseNotes(hearing.post_hrg_notes);
  const [newNote, setNewNote] = useState("");
  const [deadline, setDeadline] = useState(hearing.post_hrg_deadline || "");
  const [saving, setSaving] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    const updated: PostHrgNote[] = [
      {
        user: "Current User",
        date: new Date().toISOString(),
        note: newNote.trim(),
      },
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
                {new Date(hearing.hearing_date).toLocaleDateString("en-US", {
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dd = new Date(deadline + "T00:00:00");
    if (dd < today) {
      badgeClass =
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200";
      icon = <AlertTriangleIcon className="h-3 w-3" />;
      text = dd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      badgeClass =
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200";
      icon = <CalendarClock className="h-3 w-3" />;
      text = dd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
function StatsRow({
  hearings,
  userRole,
}: {
  hearings: HearingRow[];
  userRole: UserRole;
}) {
  const { today, next7, now } = useMemo(() => {
    const n = new Date();
    return {
      today: n.toISOString().split("T")[0],
      next7: new Date(n.getTime() + 7 * 86400000).toISOString().split("T")[0],
      now: n,
    };
  }, []);
  const total = hearings.length;
  const assigned = hearings.filter((h) => h.assigned_rep_id !== null).length;
  const unassigned = hearings.filter(
    (h) =>
      !h.assigned_rep_id &&
      (!h.assignment_status || h.assignment_status === ""),
  ).length;
  const wdStatus = hearings.filter(
    (h) => h.assignment_status && h.assignment_status !== "",
  ).length;
  const next7Days = hearings.filter(
    (h) => h.hearing_date >= today && h.hearing_date <= next7,
  ).length;
  const thisMonth = hearings.filter((h) => {
    const d = new Date(h.hearing_date);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  const isRep = userRole === "rep";
  const adminCards = [
    { label: "Total", value: total, gradient: "from-indigo-500 to-purple-600" },
    {
      label: "Assigned",
      value: assigned,
      gradient: "from-emerald-500 to-green-400",
    },
    {
      label: "Unassigned",
      value: unassigned,
      gradient: "from-pink-400 to-rose-500",
    },
    {
      label: "WD/Status",
      value: wdStatus,
      gradient: "from-amber-500 to-amber-600",
    },
    {
      label: "Next 7 Days",
      value: next7Days,
      gradient: "from-blue-400 to-cyan-400",
    },
  ];
  const repCards = [
    {
      label: "My Total Hearings",
      value: total,
      gradient: "from-emerald-500 to-green-400",
    },
    {
      label: "My Upcoming",
      value: hearings.filter((h) => h.hearing_date >= today).length,
      gradient: "from-blue-400 to-cyan-400",
    },
    {
      label: "This Month",
      value: thisMonth.length,
      gradient: "from-indigo-500 to-purple-600",
    },
  ];
  const cards = isRep ? repCards : adminCards;
  return (
    <div
      className={cn(
        "grid gap-3",
        isRep ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
      )}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "relative overflow-hidden rounded-xl bg-linear-to-br p-5 text-white",
            card.gradient,
          )}
        >
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <p className="text-[13px] font-medium uppercase opacity-90">
            {card.label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none">
            {card.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Filter bar — matches old dashboard: search, sort, rep (with counts), year, month, date presets, next unassigned ──
function FilterBar({
  filters,
  onFilterChange,
  // totalCount,
  // filteredCount,
  // representatives,
  // mrTeams,
  // configOptions,
  repCounts,
  nextUnassigned,
  userRole,
}: {
  filters: HearingFilters;
  onFilterChange: (f: HearingFilters) => void;
  totalCount: number;
  filteredCount: number;
  representatives: RepRow[];
  mrTeams: MrTeamRow[];
  configOptions: ConfigOptionRow[];
  repCounts: RepWithCount[];
  nextUnassigned: NextUnassignedRow | null;
  userRole: UserRole;
}) {
  const update = (key: keyof HearingFilters, value: string) => {
    const v = value === "__all__" ? "" : value;
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
  // const decisionOptions = configOptions.filter(
  //   (c) => c.option_type === "hearing_decision_status",
  // );
  // const mrStatusOptions = configOptions.filter(
  //   (c) => c.option_type === "medical_record_status",
  // );
  // const unassignedCount = useMemo(
  //   () =>
  //     totalCount -
  //     representatives.filter((r) => r.is_active).reduce((sum) => sum, 0),
  //   [totalCount, representatives],
  // );
  const isAdmin = !["rep", "staff"].includes(userRole);

  return (
    <div className="space-y-2">
      {/* Row 1: Search + main filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-55">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search Claimant, ALJ, City..."
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {isAdmin && (
          <Select
            value={filters.repId || "__all__"}
            onValueChange={(v) => update("repId", v)}
          >
            <SelectTrigger className="h-8 w-auto min-w-40 text-xs">
              <SelectValue placeholder="All Reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Reps</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="wd_never_assigned">
                WD - Never Assigned
              </SelectItem>
              <SelectItem value="withdrawal">Withdrawal</SelectItem>
              {repCounts.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name} ({r.hearing_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.year || "__all__"}
          onValueChange={(v) => update("year", v)}
        >
          <SelectTrigger className="h-8 w-auto min-w-25 text-xs">
            <SelectValue placeholder="All Years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Years</SelectItem>
            {[2024, 2025, 2026, 2027].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.month || "__all__"}
          onValueChange={(v) => update("month", v)}
        >
          <SelectTrigger className="h-8 w-auto min-w-30 text-xs">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Months</SelectItem>
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
              <SelectItem key={i} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.datePreset || "__all__"}
          onValueChange={(v) => update("datePreset", v)}
        >
          <SelectTrigger className="h-8 w-auto min-w-32.5 text-xs">
            <SelectValue placeholder="All Dates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="next-week">Next Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="next-30">Next 30 Days</SelectItem>
            <SelectItem value="custom">Custom Range...</SelectItem>
          </SelectContent>
        </Select>

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

        {/* Next Unassigned Indicator */}
        {nextUnassigned && isAdmin && (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 dark:border-amber-700 dark:bg-amber-950/50">
            <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
              Next Unassigned:
            </span>
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {new Date(nextUnassigned.hearing_date).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              )}
              {nextUnassigned.converted_time_est &&
                ` @ ${nextUnassigned.converted_time_est.slice(0, 5)}`}
              <span className="ml-1 font-normal text-amber-700 dark:text-amber-400">
                — {nextUnassigned.claimant?.substring(0, 20)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Frozen column config ──
interface ColumnDef {
  key: string;
  label: string;
  w: number;
  sortable?: boolean;
  frozen?: boolean;
}
const COL_W = {
  assigned_rep_id: 155,
  hearing_date: 88,
  hearing_time: 78,
  claimant: 175,
  ssn_last_4: 62,
  actions: 44,
};
const LEFT = {
  assigned_rep_id: 0,
  hearing_date: COL_W.assigned_rep_id,
  hearing_time: COL_W.assigned_rep_id + COL_W.hearing_date,
  claimant: COL_W.assigned_rep_id + COL_W.hearing_date + COL_W.hearing_time,
  ssn_last_4:
    COL_W.assigned_rep_id +
    COL_W.hearing_date +
    COL_W.hearing_time +
    COL_W.claimant,
  actions:
    COL_W.assigned_rep_id +
    COL_W.hearing_date +
    COL_W.hearing_time +
    COL_W.claimant +
    COL_W.ssn_last_4,
};
const ALL_COLUMNS: ColumnDef[] = [
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
            {new Date(hearing.hearing_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "2-digit",
            })}{" "}
            at {hearing.converted_time_est?.slice(0, 5)} {hearing.time_zone}
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
function HearingTable({
  hearings,
  userRole,
  onUpdate,
  sortKey,
  sortDir,
  onSort,
  onOpenPostHrg,
}: {
  hearings: HearingRow[];
  userRole: UserRole;
  onUpdate: (id: number, field: string, value: UpdateValue) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onOpenPostHrg: (h: HearingRow) => void;
}) {
  const evenBg = "bg-white dark:bg-zinc-950";
  const oddBg = "bg-zinc-50 dark:bg-zinc-900";
  const headerBg = "bg-zinc-100 dark:bg-zinc-900";
  const lastFrozenKey = "actions";
  const getLeftPos = (key: string): number | undefined =>
    (LEFT as Record<string, number | undefined>)[key];
  const renderCell = (hearing: HearingRow, col: ColumnDef) => {
    const editable = canEditField(userRole, col.key);
    switch (col.key) {
      case "assigned_rep_id":
        return <RepBadge hearing={hearing} />;
      case "hearing_date":
        return (
          <span className="text-xs tabular-nums">
            {new Date(hearing.hearing_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "2-digit",
            })}
          </span>
        );
      case "hearing_time":
        return (
          <span className="text-xs tabular-nums">
            {hearing.converted_time_est?.slice(0, 5)} {hearing.time_zone}
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
          <span className="text-xs">{hearing.manner_of_appearance || "-"}</span>
        );
      case "rep_docs_assigned_to":
        return (
          <span className="text-xs">{hearing.rep_docs_assigned_to || "-"}</span>
        );
      case "mr_team_id":
        return (
          <TeamBadge
            name={hearing.mr_team_name}
            color={hearing.mr_team_color}
          />
        );
      case "medical_record_status":
        return (
          <StatusBadge
            value={hearing.medical_record_status}
            colorMap={MR_STATUS_COLORS}
          />
        );
      case "rfc_status":
        return <StatusBadge value={hearing.rfc_status} colorMap={RFC_COLORS} />;
      case "brief_assigned_to":
        return (
          <span className="text-xs">{hearing.brief_assigned_to || "-"}</span>
        );
      case "hearing_decision_status":
        return (
          <StatusBadge
            value={hearing.hearing_decision_status}
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
  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr>
              {ALL_COLUMNS.map((col) => {
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
                      col.frozen && "sticky z-20",
                      isLF &&
                        "shadow-[inset_-3px_0_0_0_rgba(59,130,246,0.35),4px_0_8px_-3px_rgba(0,0,0,0.12)] dark:shadow-[inset_-3px_0_0_0_rgba(96,165,250,0.4),4px_0_8px_-3px_rgba(0,0,0,0.5)]",
                    )}
                    style={{
                      width: col.w,
                      minWidth: col.w,
                      ...(leftPos !== undefined ? { left: leftPos } : {}),
                    }}
                    onClick={() => col.sortable && onSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
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
                  colSpan={ALL_COLUMNS.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No hearings found.
                </td>
              </tr>
            ) : (
              hearings.map((h, ri) => {
                const rb = ri % 2 === 0 ? evenBg : oddBg;
                return (
                  <tr
                    key={h.id}
                    className={cn(
                      "group border-b border-border/40 last:border-0",
                      rb,
                    )}
                  >
                    {ALL_COLUMNS.map((col) => {
                      const lp = getLeftPos(col.key);
                      const isLF = col.key === lastFrozenKey;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-2 py-1.5",
                            col.frozen && cn("sticky z-10", rb),
                            isLF &&
                              "shadow-[inset_-3px_0_0_0_rgba(59,130,246,0.35),4px_0_8px_-3px_rgba(0,0,0,0.12)] dark:shadow-[inset_-3px_0_0_0_rgba(96,165,250,0.4),4px_0_8px_-3px_rgba(0,0,0,0.5)]",
                          )}
                          style={{
                            width: col.w,
                            minWidth: col.w,
                            ...(lp !== undefined ? { left: lp } : {}),
                          }}
                        >
                          {renderCell(h, col)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
interface DashboardClientProps {
  hearings: HearingRow[];
  representatives: RepRow[];
  mrTeams: MrTeamRow[];
  configOptions: ConfigOptionRow[];
  repDocsAssignees: RepDocsAssigneeRow[];
  repCounts: RepWithCount[];
  nextUnassigned: NextUnassignedRow | null;
  userRole: UserRole;
}

export function DashboardClient({
  hearings: initialHearings,
  representatives,
  mrTeams,
  configOptions,
  repCounts,
  nextUnassigned,
  userRole,
}: DashboardClientProps) {
  const [filters, setFilters] = useState<HearingFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [hearings, setHearings] = useState(initialHearings);
  const [sortKey, setSortKey] = useState(""); // empty = use DB order
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [, startTransition] = useTransition();
  const [postHrgHearing, setPostHrgHearing] = useState<HearingRow | null>(null);
  const [showAddHearing, setShowAddHearing] = useState(false);
  const [showEmailAll, setShowEmailAll] = useState(false);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [showUnassignAll, setShowUnassignAll] = useState(false);

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const filtered = useMemo(() => {
    return hearings.filter((h) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          ![h.claimant, h.ssn_last_4, h.alj, h.city, h.rep_name]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))
        )
          return false;
      }
      if (filters.dateFrom && h.hearing_date < filters.dateFrom) return false;
      if (filters.dateTo && h.hearing_date > filters.dateTo) return false;
      if (
        filters.month &&
        String(new Date(h.hearing_date).getMonth() + 1) !== filters.month
      )
        return false;
      if (
        filters.year &&
        String(new Date(h.hearing_date).getFullYear()) !== filters.year
      )
        return false;
      if (filters.repId) {
        if (filters.repId === "unassigned") {
          if (
            h.assigned_rep_id ||
            (h.assignment_status && h.assignment_status !== "")
          )
            return false;
        } else if (filters.repId === "wd_never_assigned") {
          if (h.assignment_status !== "wd_never_assigned") return false;
        } else if (filters.repId === "withdrawal") {
          if (h.assignment_status !== "withdrawal") return false;
        } else {
          if (String(h.assigned_rep_id) !== filters.repId) return false;
        }
      }
      if (
        filters.decisionStatus &&
        h.hearing_decision_status !== filters.decisionStatus
      )
        return false;
      if (filters.mrTeamId && String(h.mr_team_id) !== filters.mrTeamId)
        return false;
      if (
        filters.medicalRecordStatus &&
        h.medical_record_status !== filters.medicalRecordStatus
      )
        return false;
      if (filters.assignmentStatus) {
        if (filters.assignmentStatus === "assigned" && !h.assigned_rep_id)
          return false;
        if (filters.assignmentStatus === "unassigned" && h.assigned_rep_id)
          return false;
        if (
          filters.assignmentStatus === "wd_never_assigned" &&
          h.assignment_status !== "wd_never_assigned"
        )
          return false;
        if (
          filters.assignmentStatus === "withdrawal" &&
          h.assignment_status !== "withdrawal"
        )
          return false;
      }
      return true;
    });
  }, [hearings, filters]);

  // Sort: empty sortKey = preserve DB order (two-tier: no claimant_link first, then by date)
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal: string | number | boolean | null = null;
      let bVal: string | number | boolean | null = null;
      if (sortKey === "assigned_rep_id") {
        aVal = a.rep_name;
        bVal = b.rep_name;
      } else if (sortKey === "location") {
        aVal = a.city;
        bVal = b.city;
      } else {
        aVal = a[sortKey as keyof HearingRow] as
          | string
          | number
          | boolean
          | null;
        bVal = b[sortKey as keyof HearingRow] as
          | string
          | number
          | boolean
          | null;
      }
      return (
        (sortDir === "asc" ? 1 : -1) *
        String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, {
          numeric: true,
        })
      );
    });
  }, [filtered, sortKey, sortDir]);

  const paginated = useMemo(() => {
    const s = (page - 1) * pageSize;
    return sorted.slice(s, s + pageSize);
  }, [sorted, page, pageSize]);

  const handleUpdate = useCallback(
    async (hearingId: number, field: string, value: UpdateValue) => {
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
      // Also update the modal hearing if open
      if (
        postHrgHearing?.id === hearingId &&
        (field === "post_hrg_notes" || field === "post_hrg_deadline")
      ) {
        setPostHrgHearing((prev) =>
          prev ? { ...prev, [field]: value } : null,
        );
      }
      startTransition(async () => {
        try {
          await updateHearing(hearingId, field, value);
        } catch (e) {
          console.error("Update failed:", e);
        }
      });
    },
    [representatives, mrTeams, postHrgHearing],
  );

  const isAdmin = !["rep", "staff"].includes(userRole);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <>
      <AppHeader
        title="Hearing Dashboard"
        subtitle={`${hearings.length} total hearings`}
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        }
      />
      <div className="flex min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6">
        {/* Navbar with page links + action buttons (matches old dashboard) */}
        <DashboardNav userRole={userRole}>
          {isAdmin && (
            <>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => setShowEmailAll(true)}
              >
                📧 Email All
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-[11px] bg-purple-600 hover:bg-purple-700"
                onClick={() => setShowAutoAssign(true)}
              >
                ⚡ Auto-Assign All
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => setShowUnassignAll(true)}
              >
                🗑️ Unassign All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11px] text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                onClick={() => setShowAddHearing(true)}
              >
                + Add Hearing
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
              >
                📊 CSV Compare
              </Button>
            </>
          )}
        </DashboardNav>

        <StatsRow hearings={hearings} userRole={userRole} />
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          totalCount={hearings.length}
          filteredCount={filtered.length}
          representatives={representatives}
          mrTeams={mrTeams}
          configOptions={configOptions}
          repCounts={repCounts}
          nextUnassigned={nextUnassigned}
          userRole={userRole}
        />

        {/* Pagination bar — above table like old dashboard, with Activity Log + Rep Stats */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, filtered.length)} of {filtered.length}
            {filtered.length !== hearings.length &&
              ` (filtered from ${hearings.length})`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {userRole !== "rep" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                >
                  <ClipboardList className="h-3.5 w-3.5" /> Activity Log
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Rep Stats
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Select
              value={String(page)}
              onValueChange={(v) => setPage(Number(v))}
            >
              <SelectTrigger className="h-7 w-auto min-w-17.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  {
                    length: Math.max(1, Math.ceil(filtered.length / pageSize)),
                  },
                  (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      Page {i + 1}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= Math.ceil(filtered.length / pageSize)}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-7 w-auto min-w-21.25 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200, 500].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="hidden items-center gap-2 text-[10px] text-muted-foreground md:flex">
          <span>Left columns frozen</span>
          <span className="text-border">|</span>
          <span>Scroll right for more columns</span>
          {userRole !== "rep" && (
            <>
              <span className="text-border">|</span>
              <span>Claimants without Case Link appear at top</span>
            </>
          )}
        </div>

        {/* Mobile: Cards */}
        <div className="flex flex-col gap-2 md:hidden">
          {paginated.map((h) => (
            <HearingCard
              key={h.id}
              hearing={h}
              userRole={userRole}
              onUpdate={handleUpdate}
              onOpenPostHrg={setPostHrgHearing}
            />
          ))}
          {paginated.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No hearings found.
            </div>
          )}
        </div>
        {/* Desktop: Table */}
        <div className="hidden min-w-0 md:block">
          <HearingTable
            hearings={paginated}
            userRole={userRole}
            onUpdate={handleUpdate}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onOpenPostHrg={setPostHrgHearing}
          />
        </div>
      </div>

      {/* Post HRG Modal */}
      {postHrgHearing && (
        <PostHrgModal
          hearing={postHrgHearing}
          onClose={() => setPostHrgHearing(null)}
          onSave={handleUpdate}
        />
      )}

      {/* Action Modals */}
      {showAddHearing && (
        <AddHearingModal
          onClose={() => setShowAddHearing(false)}
          onSuccess={handleRefresh}
        />
      )}
      {showEmailAll && <EmailAllModal onClose={() => setShowEmailAll(false)} />}
      {showAutoAssign && (
        <AutoAssignModal
          representatives={representatives}
          onClose={() => setShowAutoAssign(false)}
          onSuccess={handleRefresh}
        />
      )}
      {showUnassignAll && (
        <UnassignAllModal
          onClose={() => setShowUnassignAll(false)}
          onSuccess={handleRefresh}
        />
      )}
    </>
  );
}
