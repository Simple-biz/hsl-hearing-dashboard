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

// Same shape as getHearingsForMonth above, but accepts a start/end month
// range instead of a single month, for staff who want a downloadable list
// spanning more than one month.
export async function getHearingsForRange(
  repId: number,
  startYearMonth: string,
  endYearMonth: string,
): Promise<HearingOnDay[]> {
  const firstDay = `${startYearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(endYearMonth.split("-")[0]),
    parseInt(endYearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${endYearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

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

  // Delete, rebuild, and (if locking) fill the remaining unset business
  // days -- all as one statement via chained writable CTEs, matching the
  // codebase's own atomic bulk-write convention (the archive CTE, and the
  // unnest-based bulk insert in post-hrg-development/actions.ts) instead
  // of a hand-rolled multi-statement transaction. A prior revision of this
  // fix left the explicit-day write and the lock-fill write as two
  // separate statements, which could still land the month in a
  // partially-locked state if a connection dropped between them; folding
  // both into one statement closes that gap and also removes the need for
  // a separate setDates array, since the lock-fill now excludes whatever
  // the `inserted` CTE just wrote directly.
  const dates = days.map((d) => d.date);
  const isAvailableArr = days.map((d) => d.type !== "unavailable");
  const availTypeArr = days.map((d) =>
    d.type === "unavailable"
      ? "full_day"
      : d.type === "custom_time"
        ? "full_day"
        : d.type,
  );
  const timeSlotsArr = days.map((d) =>
    d.type === "custom_time" && d.timeSlots
      ? JSON.stringify(d.timeSlots)
      : null,
  );
  const todayStr = new Date().toISOString().split("T")[0];

  await db.query(
    `WITH deleted AS (
       DELETE FROM rep_availability WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO rep_availability (rep_id, availability_date, is_available, availability_type, time_slots, schedule_locked)
       SELECT $1, d.date, d.is_available, d.availability_type, d.time_slots, $4
       FROM unnest($5::date[], $6::boolean[], $7::availability_type[], $8::text[])
         AS d(date, is_available, availability_type, time_slots)
       -- Sibling writable CTEs with no data dependency run in an
       -- unspecified order (per Postgres docs), so without this the
       -- insert's unique-constraint check can race the delete and throw
       -- on every re-save of an already-populated month. count(*) is
       -- always exactly one row, 0 or more, so this never filters out a
       -- day -- it only forces "deleted" to run first, same as this
       -- codebase's own archive CTE forcing its DELETE to depend on the
       -- INSERT it's chained after.
       WHERE (SELECT count(*) FROM deleted) >= 0
       RETURNING availability_date
     )
     INSERT INTO rep_availability (rep_id, availability_date, is_available, availability_type, schedule_locked)
     SELECT $1, gs::date, false, 'full_day', true
     FROM generate_series($2::date, $3::date, interval '1 day') AS gs
     WHERE $4
       AND EXTRACT(DOW FROM gs) NOT IN (0, 6)
       AND gs::date >= $9::date
       AND gs::date NOT IN (SELECT availability_date FROM inserted)
     ON CONFLICT (rep_id, availability_date) DO NOTHING`,
    [
      repId,
      firstDay,
      lastDay,
      lockSchedule,
      dates,
      isAvailableArr,
      availTypeArr,
      timeSlotsArr,
      todayStr,
    ],
  );
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

export async function getScheduleDeadlineException(
  repId: number,
  yearMonth: string,
): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM rep_schedule_deadline_exceptions WHERE rep_id = $1 AND year_month = $2",
    [repId, yearMonth],
  );
  return rows.length > 0;
}

/**
 * Grant a rep a one-time exception to submit their own schedule past the
 * self-service 45-day deadline for one specific month, instead of staff
 * entering it on their behalf. No expiry: once the rep locks their
 * schedule, the normal schedule_locked guard takes back over on its own.
 */
export async function grantScheduleException(repId: number, yearMonth: string) {
  const { requireAuth } = await import("@/lib/session");
  const session = await requireAuth();
  await db.query(
    `INSERT INTO rep_schedule_deadline_exceptions (rep_id, year_month, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (rep_id, year_month) DO NOTHING`,
    [repId, yearMonth, session.user.id ?? null],
  );
  const { logAction } = await import("@/lib/activity-log");
  const { rows } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await logAction(
    "schedule_updated",
    `${rows[0]?.name || "Unknown"} granted a late-submission exception for ${yearMonth}`,
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
