"use server";

import { db } from "@/lib/db";
import { excludeWithdrawnSql } from "@/lib/hearing-filters";

export interface AvailabilityDay {
  date: string;
  is_available: boolean;
  availability_type: string;
  time_slots: { start: string; end: string }[];
  schedule_locked: boolean;
  notes: string | null;
}

export interface HearingOnDay {
  date: string;
  claimant: string;
  time: string;
  alj: string | null;
}

export interface RepOption {
  id: number;
  name: string;
  rep_type: string;
  email: string | null;
  timezone: string | null;
}

export async function getRepList(): Promise<RepOption[]> {
  const { rows } = await db.query(
    "SELECT id, name, rep_type, email, timezone FROM representatives WHERE is_active = true ORDER BY CASE rep_type WHEN 'internal_advocates' THEN 1 WHEN 'in-house' THEN 1 ELSE 2 END, name",
  );
  return rows as RepOption[];
}

export async function getAvailability(
  repId: number,
  yearMonth: string,
): Promise<AvailabilityDay[]> {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  const { rows } = await db.query(
    `SELECT availability_date::text AS date, is_available, availability_type,
            time_slots, notes, schedule_locked
     FROM rep_availability
     WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3`,
    [repId, firstDay, lastDay],
  );

  return rows.map((r) => ({
    date: r.date,
    is_available: r.is_available,
    availability_type: r.availability_type || "full_day",
    time_slots: r.time_slots
      ? (() => {
          if (typeof r.time_slots !== "string") return r.time_slots;
          try {
            return JSON.parse(r.time_slots);
          } catch {
            return [];
          }
        })()
      : [],
    schedule_locked: r.schedule_locked,
    notes: r.notes,
  })) as AvailabilityDay[];
}

export async function getHearingsForMonth(
  repId: number,
  yearMonth: string,
): Promise<HearingOnDay[]> {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  // Withdrawn cases must not appear in the rep schedule calendar. Filter at
  // the query level using the shared rep-facing exclusion (no table alias).
  const { rows } = await db.query(
    `SELECT hearing_date::text AS date, claimant, converted_time_est::text AS time, alj
     FROM hearings
     WHERE assigned_rep_id = $1 AND hearing_date BETWEEN $2 AND $3
       AND ${excludeWithdrawnSql("")}
     ORDER BY hearing_date, converted_time_est`,
    [repId, firstDay, lastDay],
  );

  return rows as HearingOnDay[];
}

export async function getFederalHolidays(
  yearMonth: string,
): Promise<Record<string, string>> {
  const year = yearMonth.split("-")[0];
  const { rows } = await db.query(
    "SELECT holiday_date::text AS date, holiday_name FROM federal_holidays WHERE EXTRACT(YEAR FROM holiday_date) = $1",
    [parseInt(year)],
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.date] = r.holiday_name;
  return map;
}

export async function saveAvailability(
  repId: number,
  yearMonth: string,
  days: {
    date: string;
    type: string;
    timeSlots?: { start: string; end: string }[];
  }[],
  lockSchedule: boolean,
) {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  // Delete existing records for this month
  await db.query(
    "DELETE FROM rep_availability WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3",
    [repId, firstDay, lastDay],
  );

  // Insert new records
  for (const day of days) {
    const isAvailable = day.type !== "unavailable";
    const availType =
      day.type === "unavailable"
        ? "full_day"
        : day.type === "custom_time"
          ? "full_day"
          : day.type;
    const timeSlots =
      day.type === "custom_time" && day.timeSlots
        ? JSON.stringify(day.timeSlots)
        : null;

    await db.query(
      `INSERT INTO rep_availability (rep_id, availability_date, is_available, availability_type, time_slots, schedule_locked)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [repId, day.date, isAvailable, availType, timeSlots, lockSchedule],
    );
  }

  // If locking, also insert unavailable for unset business days
  if (lockSchedule) {
    const daysInMonth = lastDayDate.getDate();
    const setDates = new Set(days.map((d) => d.date));

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
      if (setDates.has(dateStr)) continue;
      const dow = new Date(
        parseInt(yearMonth.split("-")[0]),
        parseInt(yearMonth.split("-")[1]) - 1,
        d,
      ).getDay();
      if (dow === 0 || dow === 6) continue; // Skip weekends
      if (dateStr < new Date().toISOString().split("T")[0]) continue; // Skip past

      await db.query(
        `INSERT INTO rep_availability (rep_id, availability_date, is_available, availability_type, schedule_locked)
         VALUES ($1, $2, false, 'full_day', true)
         ON CONFLICT (rep_id, availability_date) DO NOTHING`,
        [repId, dateStr],
      );
    }
  }
  const { logAction } = await import("@/lib/activity-log");
  const { rows: repRows } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  const repName = repRows[0]?.name || "Unknown";
  await logAction(
    "schedule_updated",
    `${repName} schedule ${lockSchedule ? "locked" : "saved"} for ${yearMonth}`,
  );
}

export async function unlockSchedule(repId: number, yearMonth: string) {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  await db.query(
    "UPDATE rep_availability SET schedule_locked = false WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3",
    [repId, firstDay, lastDay],
  );
  const { logAction } = await import("@/lib/activity-log");
  const { rows: rr } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await logAction(
    "schedule_updated",
    `${rr[0]?.name || "Unknown"} schedule unlocked for ${yearMonth}`,
  );
}

export async function resetSchedule(repId: number, yearMonth: string) {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  await db.query(
    "DELETE FROM rep_availability WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3",
    [repId, firstDay, lastDay],
  );
  const { logAction } = await import("@/lib/activity-log");
  const { rows: rr } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await logAction(
    "schedule_updated",
    `${rr[0]?.name || "Unknown"} schedule reset for ${yearMonth}`,
  );
}

// ─── Lock status overview for admins ───────────────────────────────────────

export interface RepLockStatus {
  repId: number;
  name: string;
  repType: string;
  email: string | null;
  locked: boolean;
  daysSet: number;
}

export async function fetchRepLockStatuses(
  yearMonth: string,
): Promise<RepLockStatus[]> {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  const { rows } = await db.query(
    `SELECT
       r.id AS rep_id,
       r.name,
       r.rep_type,
       r.email,
       COALESCE(BOOL_OR(ra.schedule_locked), false) AS locked,
       COUNT(ra.id)::int AS days_set
     FROM representatives r
     LEFT JOIN rep_availability ra
       ON ra.rep_id = r.id
       AND ra.availability_date BETWEEN $1 AND $2
     WHERE r.is_active = true
     GROUP BY r.id, r.name, r.rep_type, r.email
     ORDER BY
       COALESCE(BOOL_OR(ra.schedule_locked), false) ASC,
       r.name ASC`,
    [firstDay, lastDay],
  );

  return rows.map((r) => ({
    repId: r.rep_id as number,
    name: r.name as string,
    repType: r.rep_type as string,
    email: r.email as string | null,
    locked: r.locked as boolean,
    daysSet: r.days_set as number,
  }));
}

export async function updateRepTimezone(repId: number, timezone: string) {
  const valid = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
  ];
  if (!valid.includes(timezone)) return;
  await db.query("UPDATE representatives SET timezone = $1 WHERE id = $2", [
    timezone,
    repId,
  ]);
}
