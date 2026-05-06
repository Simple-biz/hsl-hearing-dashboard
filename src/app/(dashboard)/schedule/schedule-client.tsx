"use client";

import Link from "next/link";

import { useState, useMemo, useCallback, useEffect } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
  Save,
  RotateCcw,
  X,
  Plus,
  Trash2,
  Search,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { convertTimeFromEST } from "@/lib/timezone";
import type { UserRole } from "@/lib/roles";
import {
  getAvailability,
  getHearingsForMonth,
  getFederalHolidays,
  saveAvailability,
  unlockSchedule,
  resetSchedule,
  updateRepTimezone,
  fetchRepLockStatuses,
} from "./action";
import type {
  AvailabilityDay,
  HearingOnDay,
  RepOption,
  RepLockStatus,
} from "./action";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type AvailType =
  | "full_day"
  | "morning_only"
  | "afternoon_only"
  | "unavailable"
  | "custom_time"
  | "unset";
interface DayState {
  type: AvailType;
  timeSlots: { start: string; end: string }[];
  tzOverride?: string;
}

const TZ_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

const PRESETS: { label: string; slots: { start: string; end: string }[] }[] = [
  { label: "8am-10am", slots: [{ start: "08:00", end: "10:00" }] },
  { label: "8am-12pm", slots: [{ start: "08:00", end: "12:00" }] },
  { label: "1pm-5pm", slots: [{ start: "13:00", end: "17:00" }] },
  { label: "2pm-4pm", slots: [{ start: "14:00", end: "16:00" }] },
  {
    label: "8-10am & 2-4pm",
    slots: [
      { start: "08:00", end: "10:00" },
      { start: "14:00", end: "16:00" },
    ],
  },
  {
    label: "8-11am & 1-5pm",
    slots: [
      { start: "08:00", end: "11:00" },
      { start: "13:00", end: "17:00" },
    ],
  },
  {
    label: "9-12pm & 2-5pm",
    slots: [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ],
  },
];

const TYPE_LABELS: Record<string, string> = {
  internal_advocates: "Internal",
  external_advocates: "External",
  "in-house": "In-House",
};
const TYPE_COLORS: Record<string, string> = {
  internal_advocates:
    "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  external_advocates:
    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  "in-house":
    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
};

function buildEdits(avail: AvailabilityDay[]) {
  const map: Record<string, DayState> = {};
  for (const a of avail) {
    const type: AvailType = !a.is_available
      ? "unavailable"
      : a.time_slots.length > 0
        ? "custom_time"
        : (a.availability_type as AvailType) || "full_day";
    map[a.date] = { type, timeSlots: a.time_slots };
  }
  return map;
}

interface Props {
  userRole: UserRole;
  reps: RepOption[];
  initialRepId: number;
  initialMonth: string;
  initialAvailability: AvailabilityDay[];
  initialHearings: HearingOnDay[];
  initialHolidays: Record<string, string>;
  showRepSelector: boolean;
}

export function ScheduleClient({
  userRole,
  reps,
  initialRepId,
  initialMonth,
  initialAvailability,
  initialHearings,
  initialHolidays,
  showRepSelector,
}: Props) {
  const [selectedRepId, setSelectedRepId] = useState(initialRepId);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [availability, setAvailability] = useState(initialAvailability);
  const [hearings, setHearings] = useState(initialHearings);
  const [holidays, setHolidays] = useState(initialHolidays);
  const [saving, setSaving] = useState(false);
  const [repSearch, setRepSearch] = useState("");
  const [repLoaded, setRepLoaded] = useState(initialRepId > 0);
  const [showLockStatus, setShowLockStatus] = useState(false);
  const [edits, setEdits] = useState<Record<string, DayState>>(() =>
    buildEdits(initialAvailability),
  );

  // Modal state
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalType, setModalType] = useState<AvailType>("unset");
  const [modalSlots, setModalSlots] = useState<
    { start: string; end: string }[]
  >([]);
  const [modalTzOverride, setModalTzOverride] = useState("");
  const [tzSaved, setTzSaved] = useState(false);

  const isAdmin = !["rep", "staff"].includes(userRole);
  const isLocked = availability.some((a) => a.schedule_locked);
  const selectedRep = reps.find((r) => r.id === selectedRepId);
  // const repTz = selectedRep?.timezone || "America/New_York";
  const [repTz, setRepTz] = useState(
    selectedRep?.timezone || "America/New_York",
  );

  const [year, month] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const todayStr = new Date().toISOString().split("T")[0];
  const deadlineDate = new Date(year, month - 1, 1);
  deadlineDate.setDate(deadlineDate.getDate() - 45);
  const daysUntilDeadline = Math.ceil(
    (deadlineDate.getTime() - new Date().setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24),
  );
  const isPastDeadline = daysUntilDeadline < 0;
  // If deadline passed but schedule is NOT locked (admin explicitly unlocked), rep can edit
  // If deadline passed AND schedule IS locked, only admin can edit
  const canEditSchedule = isAdmin || !isLocked;
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const hearingsByDate = useMemo(() => {
    const map: Record<string, HearingOnDay[]> = {};
    for (const h of hearings) {
      if (!map[h.date]) map[h.date] = [];
      map[h.date].push(h);
    }
    return map;
  }, [hearings]);

  const availableDays = Object.values(edits).filter(
    (e) => e.type !== "unavailable" && e.type !== "unset",
  ).length;
  const unavailableDays = Object.values(edits).filter(
    (e) => e.type === "unavailable",
  ).length;

  const loadData = useCallback(async (repId: number, ym: string) => {
    const [avail, hrgs, hols] = await Promise.all([
      getAvailability(repId, ym),
      getHearingsForMonth(repId, ym),
      getFederalHolidays(ym),
    ]);
    setAvailability(avail);
    setHearings(hrgs);
    setHolidays(hols);
    setEdits(buildEdits(avail));
  }, []);

  const handleSelectRep = async (repId: number) => {
    setSelectedRepId(repId);
    setRepLoaded(true);
    const rep = reps.find((r) => r.id === repId);
    setRepTz(rep?.timezone || "America/New_York");
    await loadData(repId, selectedMonth);
  };
  const handleMonthNav = async (dir: number) => {
    const d = new Date(year, month - 1 + dir, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(ym);
    await loadData(selectedRepId, ym);
  };
  const handleMonthPick = async (ym: string) => {
    setSelectedMonth(ym);
    await loadData(selectedRepId, ym);
  };

  const handleTimezoneChange = async (tz: string) => {
    setRepTz(tz); // ← add this line
    await updateRepTimezone(selectedRepId, tz);
    setTzSaved(true);
    setTimeout(() => setTzSaved(false), 2000);
  };

  const openModal = (date: string) => {
    const e = edits[date];
    setModalDate(date);
    setModalType(e?.type || "unset");
    setModalSlots(
      e?.timeSlots?.length
        ? [...e.timeSlots]
        : [{ start: "08:00", end: "17:00" }],
    );
    setModalTzOverride(e?.tzOverride || "");
  };
  const closeModal = () => setModalDate(null);
  const applyModal = () => {
    if (!modalDate) return;
    setEdits((p) => ({
      ...p,
      [modalDate]: {
        type: modalType,
        timeSlots: modalType === "custom_time" ? modalSlots : [],
        tzOverride: modalTzOverride || undefined,
      },
    }));
    closeModal();
  };
  const clearDay = () => {
    if (!modalDate) return;
    setEdits((p) => {
      const n = { ...p };
      delete n[modalDate];
      return n;
    });
    closeModal();
  };

  const handleSave = async (lock: boolean) => {
    setSaving(true);
    const days = Object.entries(edits).map(([date, s]) => ({
      date,
      type: s.type === "unset" ? "unavailable" : s.type,
      timeSlots: s.timeSlots,
    }));
    await saveAvailability(selectedRepId, selectedMonth, days, lock);
    await loadData(selectedRepId, selectedMonth);
    setSaving(false);
  };
  const handleUnlock = async () => {
    await unlockSchedule(selectedRepId, selectedMonth);
    await loadData(selectedRepId, selectedMonth);
  };
  const handleReset = async () => {
    if (
      !confirm("Reset all availability for this month? This cannot be undone.")
    )
      return;
    await resetSchedule(selectedRepId, selectedMonth);
    await loadData(selectedRepId, selectedMonth);
  };

  const filteredReps = reps.filter(
    (r) =>
      !repSearch ||
      r.name.toLowerCase().includes(repSearch.toLowerCase()) ||
      r.email?.toLowerCase().includes(repSearch.toLowerCase()),
  );

  // ═════════ ADMIN REP SELECTION LANDING ═════════
  if (showRepSelector && !repLoaded) {
    return (
      <>
        <AppHeader
          title="Rep Schedule"
          subtitle="Select a representative to manage their schedule"
        />
        <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back to Dashboard
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setShowLockStatus(true)}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Lock Status
            </Button>
          </div>
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                🔍 Search by Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Type to filter representatives..."
                  value={repSearch}
                  onChange={(e) => setRepSearch(e.target.value)}
                  className="h-10 pl-9 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Select Representative
              </label>
              <div className="max-h-100 overflow-y-auto rounded-lg border">
                {filteredReps.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => handleSelectRep(rep.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {rep.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {rep.email}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        TYPE_COLORS[rep.rep_type] ||
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {TYPE_LABELS[rep.rep_type] || rep.rep_type}
                    </span>
                  </button>
                ))}
                {filteredReps.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No representatives found.
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Showing {filteredReps.length} of {reps.length} active
                representatives
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-sm font-semibold mb-3">📋 Instructions</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Click dates</strong> to open
                availability options
              </li>
              <li>
                <strong className="text-foreground">Custom Time Slots</strong>{" "}
                allows multiple time ranges (e.g., 8am-10am AND 2pm-4pm)
              </li>
              <li>
                <strong className="text-foreground">White (Unset)</strong> dates
                become <strong className="text-foreground">unavailable</strong>{" "}
                when locked
              </li>
              <li>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Green
                </span>{" "}
                = Available,{" "}
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  Red
                </span>{" "}
                = Unavailable,{" "}
                <span className="text-purple-600 dark:text-purple-400 font-semibold">
                  Purple
                </span>{" "}
                = Custom time slots
              </li>
              <li>Federal holidays and past dates cannot be changed</li>
              <li>
                <span className="text-blue-600 font-semibold">Blue boxes</span>{" "}
                show assigned hearings
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-900/40">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              ℹ️ Search by name or click a representative to view and manage
              their schedule.
            </p>
          </div>
        </div>

        {showLockStatus && (
          <LockStatusModal
            defaultMonth={selectedMonth || initialMonth}
            onClose={() => setShowLockStatus(false)}
            onSelectRep={(repId) => {
              setShowLockStatus(false);
              handleSelectRep(repId);
            }}
          />
        )}
      </>
    );
  }

  // ═════════ CALENDAR VIEW ═════════
  return (
    <>
      <AppHeader
        title="Rep Schedule"
        subtitle={
          selectedRep ? `${selectedRep.name} — ${monthName}` : monthName
        }
      />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Admin: back + rep info + timezone */}
        {isAdmin && repLoaded && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setRepLoaded(false);
                setSelectedRepId(0);
              }}
            >
              ← Back to Rep Selection
            </Button>
            {selectedRep && (
              <>
                <span className="text-sm font-semibold">
                  {selectedRep.name}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                    TYPE_COLORS[selectedRep.rep_type] || "bg-muted",
                  )}
                >
                  {TYPE_LABELS[selectedRep.rep_type]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedRep.email}
                </span>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {/* Timezone selector */}
              <label className="text-xs font-medium text-muted-foreground">
                Timezone:
              </label>
              <Select value={repTz} onValueChange={handleTimezoneChange}>
                <SelectTrigger className="h-8 w-auto min-w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TZ_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      🕐 {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tzSaved && (
                <span className="text-xs text-green-600">✓ Saved</span>
              )}
              {/* Quick rep switch */}
              <Select
                value={String(selectedRepId)}
                onValueChange={(v) => handleSelectRep(parseInt(v))}
              >
                <SelectTrigger className="h-8 w-auto min-w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Rep view: timezone */}
        {!isAdmin && selectedRep && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Timezone:
            </label>
            <Select value={repTz} onValueChange={handleTimezoneChange}>
              <SelectTrigger className="h-8 w-auto min-w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TZ_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    🕐 {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tzSaved && <span className="text-xs text-green-600">✓ Saved</span>}
          </div>
        )}

        {/* Collapsible instructions */}
        <details className="rounded-xl border bg-card">
          <summary className="px-4 py-3 text-sm font-semibold cursor-pointer hover:bg-muted/50">
            📋 Instructions
          </summary>
          <ul className="px-4 pb-3 space-y-1 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Click dates</strong> to open
              availability options
            </li>
            <li>
              <strong className="text-foreground">Custom Time Slots</strong> —
              set multiple time ranges
            </li>
            <li>
              <strong className="text-foreground">White (Unset)</strong> dates
              become <strong className="text-foreground">unavailable</strong>{" "}
              when locked
            </li>
            <li>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Green
              </span>{" "}
              = Available,{" "}
              <span className="text-red-600 dark:text-red-400 font-semibold">
                Red
              </span>{" "}
              = Unavailable,{" "}
              <span className="text-purple-600 dark:text-purple-400 font-semibold">
                Purple
              </span>{" "}
              = Custom
            </li>
            <li>Federal holidays and past dates cannot be changed</li>
            <li>
              <span className="text-blue-600 font-semibold">Blue boxes</span>{" "}
              show assigned hearings
            </li>
          </ul>
        </details>

        {/* Banners */}
        {isLocked && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/40 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🔒</span>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Schedule is Locked
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {!isAdmin
                    ? "Contact haya@hogansmith.com for changes."
                    : "You can unlock as admin to allow the rep to edit."}
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-amber-700 border-amber-400"
                onClick={handleUnlock}
              >
                <Lock className="h-3.5 w-3.5 mr-1" /> Unlock
              </Button>
            )}
          </div>
        )}
        {isPastDeadline && !isLocked && (
          <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/40 p-3 flex items-center gap-3">
            <span className="text-lg">⏰</span>
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                Submission Deadline Passed
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                The 45-day deadline for {monthName} was{" "}
                {deadlineDate.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                .
                {isAdmin
                  ? " You can still edit as admin."
                  : " Schedule has been unlocked by admin — you can make changes."}
              </p>
            </div>
          </div>
        )}
        {daysUntilDeadline >= 0 && daysUntilDeadline <= 15 && !isLocked && (
          <div
            className={cn(
              "rounded-lg border p-3 flex items-center gap-3",
              daysUntilDeadline === 0
                ? "bg-red-50 border-red-300 dark:bg-red-900/40 dark:border-red-800"
                : daysUntilDeadline <= 5
                  ? "bg-amber-50 border-amber-300 dark:bg-amber-900/40 dark:border-amber-800"
                  : "bg-blue-50 border-blue-300 dark:bg-blue-900/40 dark:border-blue-800",
            )}
          >
            <span className="text-lg">
              {daysUntilDeadline === 0
                ? "🚨"
                : daysUntilDeadline <= 5
                  ? "⚠️"
                  : "📅"}
            </span>
            <div>
              <p className="text-sm font-semibold">
                Deadline:{" "}
                {deadlineDate.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {daysUntilDeadline} day{daysUntilDeadline !== 1 ? "s" : ""}{" "}
                remaining
              </p>
            </div>
          </div>
        )}

        {/* Month nav — picker + arrows */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => handleMonthNav(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{monthName}</h2>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) =>
                e.target.value && handleMonthPick(e.target.value)
              }
              className="h-8 w-auto text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => handleMonthNav(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/40 p-3 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
              {hearings.length}
            </p>
            <p className="text-xs text-muted-foreground">Hearings</p>
          </div>
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/40 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {availableDays}
            </p>
            <p className="text-xs text-muted-foreground">Available</p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/40 p-3 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">
              {unavailableDays}
            </p>
            <p className="text-xs text-muted-foreground">Unavailable</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {[
            { cls: "bg-white dark:bg-zinc-800 border-border", l: "Unset" },
            {
              cls: "bg-emerald-100 dark:bg-emerald-800/60 border-emerald-300 dark:border-emerald-600",
              l: "Available",
            },
            {
              cls: "bg-red-100 dark:bg-red-800/60 border-red-300 dark:border-red-600",
              l: "Unavailable",
            },
            {
              cls: "bg-amber-100 dark:bg-amber-800/60 border-amber-300 dark:border-amber-600",
              l: "Morning",
            },
            {
              cls: "bg-orange-100 dark:bg-orange-800/60 border-orange-300 dark:border-orange-600",
              l: "Afternoon",
            },
            {
              cls: "bg-purple-100 dark:bg-purple-800/60 border-purple-300 dark:border-purple-600",
              l: "Custom",
            },
            {
              cls: "bg-zinc-200 dark:bg-zinc-600 border-zinc-300 dark:border-zinc-500",
              l: "Holiday",
            },
          ].map((x) => (
            <div key={x.l} className="flex items-center gap-1.5">
              <div className={cn("w-4 h-4 rounded border", x.cls)} />
              <span className="text-muted-foreground">{x.l}</span>
            </div>
          ))}
        </div>

        {/* Calendar */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-7">
            {DAYS.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-[11px] font-bold uppercase text-muted-foreground bg-muted/50 border-b"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: firstDayOfWeek }, (_, i) => (
              <div
                key={`e-${i}`}
                className="min-h-22.5 border-b border-r border-border/30 bg-zinc-50/50 dark:bg-zinc-900/50"
              />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${selectedMonth}-${String(day).padStart(2, "0")}`;
              const dow = new Date(year, month - 1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isHoliday = !!holidays[dateStr];
              const isPast = dateStr < todayStr;
              const edit = edits[dateStr];
              const type: AvailType = edit?.type || "unset";
              const dayHearings = hearingsByDate[dateStr] || [];
              const canClick =
                !isPast && !isHoliday && !isWeekend && canEditSchedule;
              const bg = isHoliday
                ? "bg-zinc-200 dark:bg-zinc-700"
                : isWeekend
                  ? "bg-zinc-100 dark:bg-zinc-800/60"
                  : isPast
                    ? "bg-zinc-50 dark:bg-zinc-900 opacity-50"
                    : type === "full_day"
                      ? "bg-emerald-50 dark:bg-emerald-900/50"
                      : type === "morning_only"
                        ? "bg-amber-50 dark:bg-amber-900/50"
                        : type === "afternoon_only"
                          ? "bg-orange-50 dark:bg-orange-900/50"
                          : type === "unavailable"
                            ? "bg-red-50 dark:bg-red-900/50"
                            : type === "custom_time"
                              ? "bg-purple-50 dark:bg-purple-900/50"
                              : "bg-card";
              const lbl: Record<string, string> = {
                full_day: "Available",
                morning_only: "AM Only",
                afternoon_only: "PM Only",
                unavailable: "Unavail",
                custom_time: "Custom",
              };
              return (
                <div
                  key={dateStr}
                  className={cn(
                    "min-h-22.5 border-b border-r border-border/30 p-1 transition-colors",
                    bg,
                    canClick &&
                      "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-blue-400",
                  )}
                  onClick={() => canClick && openModal(dateStr)}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-bold tabular-nums",
                        isPast ? "text-muted-foreground/50" : "text-foreground",
                      )}
                    >
                      {day}
                    </span>
                    {dayHearings.length > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                        {dayHearings.length}
                      </span>
                    )}
                  </div>
                  {isHoliday && (
                    <span className="block text-[9px] text-muted-foreground mt-0.5 leading-tight">
                      {holidays[dateStr]}
                    </span>
                  )}
                  {!isHoliday && !isWeekend && !isPast && type !== "unset" && (
                    <span className="block text-[9px] font-medium mt-0.5">
                      {lbl[type]}
                    </span>
                  )}
                  {edit?.timeSlots?.map((s, si) => (
                    <span
                      key={si}
                      className="block text-[8px] text-purple-600 dark:text-purple-400"
                    >
                      {s.start}-{s.end}
                    </span>
                  ))}
                  {dayHearings.slice(0, 2).map((h, hi) => (
                    <div
                      key={hi}
                      className="mt-0.5 rounded bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5"
                    >
                      <span className="block text-[8px] font-medium text-blue-700 dark:text-blue-300 truncate">
                        {convertTimeFromEST(h.time, h.date, "America/New_York")}{" "}
                        ET
                        {repTz !== "America/New_York" && (
                          <span className="text-purple-600 dark:text-purple-400">
                            {" "}
                            ({convertTimeFromEST(h.time, h.date, repTz)}{" "}
                            {TZ_OPTIONS.find(
                              (t) => t.value === repTz,
                            )?.label.match(/\((\w+)\)/)?.[1] ?? ""}
                            )
                          </span>
                        )}
                      </span>
                      <span className="block text-[8px] text-blue-600 dark:text-blue-400 truncate">
                        {h.claimant}
                      </span>
                    </div>
                  ))}
                  {dayHearings.length > 2 && (
                    <span className="block text-[8px] text-blue-500 dark:text-blue-400">
                      +{dayHearings.length - 2} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {canEditSchedule && (
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-9 gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              <Lock className="h-4 w-4" />{" "}
              {saving ? "Saving..." : "Lock Schedule"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              <Save className="h-4 w-4" /> Save Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        )}
      </div>

      {/* ═════════ AVAILABILITY MODAL ═════════ */}
      {modalDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4">
              <h2 className="text-sm font-semibold">
                Set Availability —{" "}
                {new Date(modalDate + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <button
                onClick={closeModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Quick options */}
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      type: "full_day" as const,
                      label: "✓ Available",
                      sub: "Full Day",
                      cls: "border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-800/50 text-emerald-800 dark:text-emerald-200",
                    },
                    {
                      type: "morning_only" as const,
                      label: "🌅 Morning",
                      sub: "AM Only",
                      cls: "border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-800/50 text-amber-800 dark:text-amber-200",
                    },
                    {
                      type: "afternoon_only" as const,
                      label: "🌇 Afternoon",
                      sub: "PM Only",
                      cls: "border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/50 hover:bg-orange-100 dark:hover:bg-orange-800/50 text-orange-800 dark:text-orange-200",
                    },
                    {
                      type: "unavailable" as const,
                      label: "✕ Unavailable",
                      sub: "All Day",
                      cls: "border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/50 hover:bg-red-100 dark:hover:bg-red-800/50 text-red-800 dark:text-red-200",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.type}
                    className={cn(
                      "rounded-lg border-2 p-3 text-center transition-all",
                      opt.cls,
                      modalType === opt.type && "ring-2 ring-blue-500",
                    )}
                    onClick={() => setModalType(opt.type)}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[10px] opacity-70">{opt.sub}</p>
                  </button>
                ))}
                <button
                  className={cn(
                    "col-span-2 rounded-lg border-2 p-3 text-center transition-all border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/50 hover:bg-purple-100 dark:hover:bg-purple-800/50 text-purple-800 dark:text-purple-200",
                    modalType === "custom_time" && "ring-2 ring-blue-500",
                  )}
                  onClick={() => setModalType("custom_time")}
                >
                  <p className="text-sm font-semibold">🕐 Custom Time Slots</p>
                  <p className="text-[10px] opacity-70">
                    Set multiple time ranges
                  </p>
                </button>
              </div>

              {/* Custom time slots editor + presets */}
              {modalType === "custom_time" && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-semibold">
                    📅 Available Time Slots:
                  </p>
                  {modalSlots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={slot.start}
                        onChange={(e) => {
                          const s = [...modalSlots];
                          s[i].start = e.target.value;
                          setModalSlots(s);
                        }}
                        className="h-8 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={slot.end}
                        onChange={(e) => {
                          const s = [...modalSlots];
                          s[i].end = e.target.value;
                          setModalSlots(s);
                        }}
                        className="h-8 text-xs"
                      />
                      {modalSlots.length > 1 && (
                        <button
                          onClick={() =>
                            setModalSlots(modalSlots.filter((_, j) => j !== i))
                          }
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setModalSlots([
                        ...modalSlots,
                        { start: "08:00", end: "17:00" },
                      ])
                    }
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    <Plus className="h-3 w-3" /> Add Another Slot
                  </button>

                  {/* Quick presets */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                      Quick Presets:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => {
                            setModalSlots([...p.slots]);
                            setModalType("custom_time");
                          }}
                          className="rounded border bg-card px-2 py-1 text-[10px] font-medium hover:bg-muted/50 transition-colors"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Per-day timezone override */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    🕐 Timezone for this day:
                  </label>
                  <Select
                    value={modalTzOverride || "__default__"}
                    onValueChange={(v) =>
                      setModalTzOverride(v === "__default__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        Use default (
                        {TZ_OPTIONS.find((t) => t.value === repTz)?.label ||
                          "ET"}
                        )
                      </SelectItem>
                      {TZ_OPTIONS.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          🕐 {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Override your default timezone if traveling. Leave as default
                  for normal days.
                </p>
              </div>

              {/* Clear day */}
              <button
                onClick={clearDay}
                className="w-full rounded-lg border border-border bg-card p-2.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                🗑️ Clear / Unset Day
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={closeModal}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={applyModal}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═════════ LOCK STATUS MODAL ═════════

function LockStatusModal({
  defaultMonth,
  onClose,
  onSelectRep,
}: {
  defaultMonth: string;
  onClose: () => void;
  onSelectRep: (repId: number) => void;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [statuses, setStatuses] = useState<RepLockStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterLock, setFilterLock] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    fetchRepLockStatuses(month).then((data) => {
      if (!cancelled) {
        setStatuses(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const handleMonthChange = (ym: string) => {
    setMonth(ym);
    setLoading(true);
  };

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  })();

  const filtered = useMemo(() => {
    return statuses.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.name.toLowerCase().includes(q) &&
          !(s.email ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (filterType !== "all" && s.repType !== filterType) return false;
      if (filterLock === "locked" && !s.locked) return false;
      if (filterLock === "unlocked" && s.locked) return false;
      if (filterLock === "not_started" && (s.locked || s.daysSet > 0))
        return false;
      return true;
    });
  }, [statuses, search, filterType, filterLock]);

  const lockedCount = statuses.filter((s) => s.locked).length;
  const unlockedCount = statuses.filter(
    (s) => !s.locked && s.daysSet > 0,
  ).length;
  const notStartedCount = statuses.filter(
    (s) => !s.locked && s.daysSet === 0,
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Schedule Lock Status</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{monthLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 px-5 pt-4 shrink-0">
          <button
            onClick={() =>
              setFilterLock(filterLock === "locked" ? "all" : "locked")
            }
            className={cn(
              "rounded-lg p-2.5 text-center transition-colors border",
              filterLock === "locked"
                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 ring-2 ring-emerald-400"
                : "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50",
            )}
          >
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {lockedCount}
            </p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              Locked
            </p>
          </button>
          <button
            onClick={() =>
              setFilterLock(filterLock === "unlocked" ? "all" : "unlocked")
            }
            className={cn(
              "rounded-lg p-2.5 text-center transition-colors border",
              filterLock === "unlocked"
                ? "border-amber-400 bg-amber-50 dark:bg-amber-900/40 ring-2 ring-amber-400"
                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50",
            )}
          >
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
              {unlockedCount}
            </p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              In Progress
            </p>
          </button>
          <button
            onClick={() =>
              setFilterLock(
                filterLock === "not_started" ? "all" : "not_started",
              )
            }
            className={cn(
              "rounded-lg p-2.5 text-center transition-colors border",
              filterLock === "not_started"
                ? "border-red-400 bg-red-50 dark:bg-red-900/40 ring-2 ring-red-400"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50",
            )}
          >
            <p className="text-xl font-bold text-red-700 dark:text-red-400 tabular-nums">
              {notStartedCount}
            </p>
            <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">
              Not Started
            </p>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-2 shrink-0">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Input
            type="month"
            value={month}
            onChange={(e) =>
              e.target.value && handleMonthChange(e.target.value)
            }
            className="h-8 w-auto text-xs"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 w-auto min-w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="internal_advocates">Internal</SelectItem>
              <SelectItem value="in-house">In-House</SelectItem>
              <SelectItem value="external_advocates">External</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No representatives match your filters.
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {filtered.map((rep) => (
                <button
                  key={rep.repId}
                  onClick={() => onSelectRep(rep.repId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  {/* Lock icon */}
                  <div
                    className={cn(
                      "shrink-0 flex items-center justify-center rounded-full h-7 w-7",
                      rep.locked
                        ? "bg-emerald-100 dark:bg-emerald-900/40"
                        : rep.daysSet > 0
                          ? "bg-amber-100 dark:bg-amber-900/40"
                          : "bg-red-100 dark:bg-red-900/40",
                    )}
                  >
                    {rep.locked ? (
                      <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : rep.daysSet > 0 ? (
                      <LockOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                    )}
                  </div>

                  {/* Name & email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{rep.name}</p>
                    {rep.email && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {rep.email}
                      </p>
                    )}
                  </div>

                  {/* Type badge */}
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                      TYPE_COLORS[rep.repType] ||
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {TYPE_LABELS[rep.repType] || rep.repType}
                  </span>

                  {/* Status badge */}
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                      rep.locked
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : rep.daysSet > 0
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                    )}
                  >
                    {rep.locked
                      ? "Locked"
                      : rep.daysSet > 0
                        ? `${rep.daysSet} days set`
                        : "Not started"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-3 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {filtered.length} of {statuses.length} reps shown
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
