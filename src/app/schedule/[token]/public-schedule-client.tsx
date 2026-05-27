"use client";

import { useState, useMemo, useCallback } from "react";
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
  Save,
  RotateCcw,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  authenticateToken,
  getPublicAvailability,
  getPublicHearings,
  getPublicHolidays,
  savePublicAvailability,
  resetPublicSchedule,
  getRepTimezone,
  updatePublicRepTimezone,
} from "./action";
import type { PublicRepInfo } from "./action";

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
}
interface AvailDay {
  date: string;
  is_available: boolean;
  availability_type: string;
  time_slots: { start: string; end: string }[];
  schedule_locked: boolean;
}
interface HearingDay {
  date: string;
  claimant: string;
  time: string;
  alj: string | null;
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
];

function buildEdits(avail: AvailDay[]) {
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
  token: string;
  initialValid: boolean;
  repName?: string;
  initialError?: string;
}

export function PublicScheduleClient({
  token,
  initialValid,
  repName,
  initialError,
}: Props) {
  const [authenticated, setAuthenticated] = useState(false);
  const [rep, setRep] = useState<PublicRepInfo | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(initialError || "");
  const [authLoading, setAuthLoading] = useState(false);

  // Schedule state
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [availability, setAvailability] = useState<AvailDay[]>([]);
  const [hearings, setHearings] = useState<HearingDay[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, DayState>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Modal
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalType, setModalType] = useState<AvailType>("unset");
  const [modalSlots, setModalSlots] = useState<
    { start: string; end: string }[]
  >([]);
  const [modalTzOverride, setModalTzOverride] = useState("");

  // Timezone
  const [repTz, setRepTz] = useState("America/New_York");
  const [tzSaved, setTzSaved] = useState(false);

  const isLocked = availability.some((a) => a.schedule_locked);
  const [year, month] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const todayStr = now.toISOString().split("T")[0];
  const deadlineDate = new Date(year, month - 1, 1);
  deadlineDate.setDate(deadlineDate.getDate() - 45);
  const daysUntilDeadline = Math.ceil(
    (deadlineDate.getTime() - new Date().setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24),
  );
  const isPastDeadline = daysUntilDeadline < 0;
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const hearingsByDate = useMemo(() => {
    const map: Record<string, HearingDay[]> = {};
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
      getPublicAvailability(repId, ym),
      getPublicHearings(repId, ym),
      getPublicHolidays(ym),
    ]);
    setAvailability(avail as AvailDay[]);
    setHearings(hrgs);
    setHolidays(hols);
    setEdits(buildEdits(avail as AvailDay[]));
  }, []);

  // Auth
  const handleLogin = async () => {
    if (!password) {
      setAuthError("Please enter a password");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    const res = await authenticateToken(token, password);
    if (res.success && res.rep) {
      setAuthenticated(true);
      setRep(res.rep);
      setPassword("");
      const tz = await getRepTimezone(res.rep.id);
      setRepTz(tz || "America/New_York");
      await loadData(res.rep.id, selectedMonth);
    } else {
      setAuthError(res.error || "Authentication failed");
    }
    setAuthLoading(false);
  };

  const handleMonthNav = async (dir: number) => {
    if (!rep) return;
    const d = new Date(year, month - 1 + dir, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(ym);
    await loadData(rep.id, ym);
  };
  const handleMonthPick = async (ym: string) => {
    if (!rep) return;
    setSelectedMonth(ym);
    await loadData(rep.id, ym);
  };
  const handleTimezoneChange = async (tz: string) => {
    if (!rep) return;
    setRepTz(tz);
    await updatePublicRepTimezone(rep.id, tz);
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
    setModalTzOverride("");
  };
  const closeModal = () => setModalDate(null);
  const applyModal = () => {
    if (!modalDate) return;
    setEdits((p) => ({
      ...p,
      [modalDate]: {
        type: modalType,
        timeSlots: modalType === "custom_time" ? modalSlots : [],
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
    if (!rep) return;
    setSaving(true);
    setMessage("");
    try {
      const days = Object.entries(edits).map(([date, s]) => ({
        date,
        type: s.type === "unset" ? "unavailable" : s.type,
        timeSlots: s.timeSlots,
      }));
      await savePublicAvailability(rep.id, selectedMonth, days, lock);
      setMessage(
        lock
          ? "🔒 Schedule locked successfully!"
          : "💾 Schedule saved successfully!",
      );
      await loadData(rep.id, selectedMonth);
    } catch (e) {
      setMessage(e instanceof Error ? `⚠️ ${e.message}` : "Error saving");
    }
    setSaving(false);
  };
  const handleReset = async () => {
    if (!rep || !confirm("Reset all availability for this month?")) return;
    try {
      await resetPublicSchedule(rep.id, selectedMonth);
      await loadData(rep.id, selectedMonth);
      setMessage("🔄 Schedule reset");
    } catch (e) {
      setMessage(e instanceof Error ? `⚠️ ${e.message}` : "Error");
    }
  };

  const canEdit = !isLocked && !isPastDeadline;

  // ═══════ LOGIN SCREEN ═══════
  if (!authenticated || !rep) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-zinc-100 to-zinc-200 p-4 dark:from-zinc-900 dark:to-zinc-950">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-2xl text-center space-y-5">
          <div className="text-5xl">🔐</div>
          <div>
            <h2 className="text-xl font-bold">Representative Schedule</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hogan Smith Law
            </p>
          </div>
          {repName && (
            <p className="text-sm">
              Welcome, <strong>{repName}</strong>!<br />
              Please enter your password to continue.
            </p>
          )}
          {!initialValid && !authError && (
            <p className="text-sm text-muted-foreground">
              Please enter your password to access your schedule.
            </p>
          )}
          {authError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              ⚠️ {authError}
            </div>
          )}
          {initialValid && (
            <div className="space-y-3">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Enter your password"
                className="h-11 text-center text-sm"
                autoFocus
              />
              <Button
                className="h-11 w-full text-sm font-semibold"
                onClick={handleLogin}
                disabled={authLoading || !password}
              >
                {authLoading ? "Authenticating..." : "🔓 Access My Schedule"}
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Contact your administrator if you need a new link or forgot your
            password.
          </p>
        </div>
      </div>
    );
  }

  // ═══════ SCHEDULE VIEW ═══════
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b bg-card px-4 py-4 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">📅 Representative Schedule</h1>
            <p className="text-xs text-muted-foreground">
              Hogan Smith Law — Availability Management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{rep.name}</p>
              <p className="text-[11px] text-muted-foreground">{rep.email}</p>
            </div>
            <a
              href={`/schedule/${token}`}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
            >
              Logout
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-4 lg:p-8 space-y-4">
        {/* Timezone selector */}
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5">
          <label className="text-xs font-medium text-muted-foreground">
            🕐 Your Timezone:
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
            <span className="text-[11px] text-green-600">✓ Saved</span>
          )}
          <p className="ml-auto text-[10px] text-muted-foreground">
            Hearing times are shown in Eastern (ET). Your availability times use
            your selected timezone.
          </p>
        </div>
        {message && (
          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              message.startsWith("⚠️")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            {message}
          </div>
        )}

        {/* Banners */}
        {isLocked && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-800">
              🔒 Schedule is Locked
            </p>
            <p className="text-xs text-amber-600">
              Contact{" "}
              <a href="mailto:claudia@hogansmith.com" className="underline">
                claudia@hogansmith.com
              </a>{" "}
              for changes.
            </p>
          </div>
        )}
        {isPastDeadline && !isLocked && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:bg-red-950/30">
            <p className="text-sm font-semibold text-red-800">
              ⏰ Deadline Passed
            </p>
            <p className="text-xs text-red-600">
              The 45-day deadline for {monthName} was{" "}
              {deadlineDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
          </div>
        )}
        {!isPastDeadline &&
          !isLocked &&
          daysUntilDeadline >= 0 &&
          daysUntilDeadline <= 15 && (
            <div
              className={cn(
                "rounded-lg border p-3",
                daysUntilDeadline <= 5
                  ? "border-amber-300 bg-amber-50"
                  : "border-blue-300 bg-blue-50",
              )}
            >
              <p className="text-sm font-semibold">
                {daysUntilDeadline <= 5 ? "⚠️" : "📅"} Deadline:{" "}
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
          )}

        {/* Instructions */}
        <details className="rounded-xl border bg-card" open>
          <summary className="px-4 py-3 text-sm font-semibold cursor-pointer hover:bg-muted/50">
            📋 Instructions
          </summary>
          <ul className="px-4 pb-3 space-y-1 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Click dates</strong> to set
              your availability
            </li>
            <li>
              <strong className="text-foreground">Custom Time Slots</strong> —
              set multiple time ranges (e.g., 8am-10am AND 2pm-4pm)
            </li>
            <li>
              <strong className="text-foreground">White (Unset)</strong> dates
              become <strong className="text-foreground">unavailable</strong>{" "}
              when locked
            </li>
            <li>
              <span className="text-emerald-600 font-semibold">Green</span> =
              Available, <span className="text-red-600 font-semibold">Red</span>{" "}
              = Unavailable,{" "}
              <span className="text-purple-600 font-semibold">Purple</span> =
              Custom
            </li>
            <li>Federal holidays and past dates cannot be changed</li>
            <li>
              <span className="text-blue-600 font-semibold">Blue boxes</span>{" "}
              show your assigned hearings
            </li>
          </ul>
        </details>

        {/* Month nav */}
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
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
            <p className="text-2xl font-bold text-blue-700 tabular-nums">
              {hearings.length}
            </p>
            <p className="text-xs text-muted-foreground">Hearings</p>
          </div>
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">
              {availableDays}
            </p>
            <p className="text-xs text-muted-foreground">Available</p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-center">
            <p className="text-2xl font-bold text-red-700 tabular-nums">
              {unavailableDays}
            </p>
            <p className="text-xs text-muted-foreground">Unavailable</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {[
            { cls: "bg-white border-border", l: "Unset" },
            { cls: "bg-emerald-100 border-emerald-300", l: "Available" },
            { cls: "bg-red-100 border-red-300", l: "Unavailable" },
            { cls: "bg-amber-100 border-amber-300", l: "Morning" },
            { cls: "bg-orange-100 border-orange-300", l: "Afternoon" },
            { cls: "bg-purple-100 border-purple-300", l: "Custom" },
            { cls: "bg-zinc-200 border-zinc-300", l: "Holiday" },
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
                className="min-h-22.5 border-b border-r border-border/30 bg-zinc-50/50"
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
              const canClick = canEdit && !isPast && !isHoliday && !isWeekend;
              const bg = isHoliday
                ? "bg-zinc-200"
                : isWeekend
                  ? "bg-zinc-100"
                  : isPast
                    ? "bg-zinc-50 opacity-50"
                    : type === "full_day"
                      ? "bg-emerald-50"
                      : type === "morning_only"
                        ? "bg-amber-50"
                        : type === "afternoon_only"
                          ? "bg-orange-50"
                          : type === "unavailable"
                            ? "bg-red-50"
                            : type === "custom_time"
                              ? "bg-purple-50"
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
                        isPast ? "text-muted-foreground/50" : "",
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
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      {holidays[dateStr]}
                    </p>
                  )}
                  {!isHoliday && !isWeekend && !isPast && type !== "unset" && (
                    <p className="text-[9px] font-medium mt-0.5">{lbl[type]}</p>
                  )}
                  {edit?.timeSlots?.map((s, si) => (
                    <p key={si} className="text-[8px] text-purple-600">
                      {s.start}-{s.end}
                    </p>
                  ))}
                  {dayHearings.slice(0, 2).map((h, hi) => (
                    <div
                      key={hi}
                      className="mt-0.5 rounded bg-blue-100 px-1 py-0.5"
                    >
                      <p className="text-[8px] font-medium text-blue-700 truncate">
                        {h.time?.slice(0, 5)} {h.claimant}
                      </p>
                    </div>
                  ))}
                  {dayHearings.length > 2 && (
                    <p className="text-[8px] text-blue-500">
                      +{dayHearings.length - 2} more
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
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

      {/* ═══════ AVAILABILITY MODAL ═══════ */}
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
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      type: "full_day" as const,
                      label: "✓ Available",
                      sub: "Full Day",
                      cls: "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800",
                    },
                    {
                      type: "morning_only" as const,
                      label: "🌅 Morning",
                      sub: "AM Only",
                      cls: "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800",
                    },
                    {
                      type: "afternoon_only" as const,
                      label: "🌇 Afternoon",
                      sub: "PM Only",
                      cls: "border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-800",
                    },
                    {
                      type: "unavailable" as const,
                      label: "✕ Unavailable",
                      sub: "All Day",
                      cls: "border-red-300 bg-red-50 hover:bg-red-100 text-red-800",
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
                    "col-span-2 rounded-lg border-2 p-3 text-center transition-all border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800",
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
                          className="text-red-500"
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
                    className="flex items-center gap-1 text-xs text-blue-600"
                  >
                    <Plus className="h-3 w-3" /> Add Another Slot
                  </button>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                      Quick Presets:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => setModalSlots([...p.slots])}
                          className="rounded border bg-card px-2 py-1 text-[10px] font-medium hover:bg-muted/50"
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

              <button
                onClick={clearDay}
                className="w-full rounded-lg border bg-card p-2.5 text-sm text-muted-foreground hover:bg-muted/50"
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
    </div>
  );
}
