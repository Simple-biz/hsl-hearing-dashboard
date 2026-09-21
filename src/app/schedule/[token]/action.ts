"use server";

import { db } from "@/lib/db";
import { compare } from "bcryptjs";

export interface PublicRepInfo {
  id: number;
  name: string;
  email: string;
  rep_type: string;
}

export async function validateToken(
  token: string,
): Promise<{ valid: boolean; repName?: string; error?: string }> {
  const { rows } = await db.query(
    `SELECT t.id, r.name AS rep_name
     FROM rep_schedule_tokens t
     JOIN representatives r ON t.rep_id = r.id
     WHERE t.token = $1 AND t.is_active = true AND (t.expires_at IS NULL OR t.expires_at > NOW())`,
    [token],
  );
  if (rows.length === 0)
    return {
      valid: false,
      error:
        "This link is invalid or has expired. Please contact your administrator for a new link.",
    };
  return { valid: true, repName: rows[0].rep_name };
}

export async function authenticateToken(
  token: string,
  password: string,
): Promise<{ success: boolean; rep?: PublicRepInfo; error?: string }> {
  const { rows } = await db.query(
    `SELECT t.id, t.password_hash, t.rep_id, r.name, r.email, r.rep_type
     FROM rep_schedule_tokens t
     JOIN representatives r ON t.rep_id = r.id
     WHERE t.token = $1 AND t.is_active = true AND (t.expires_at IS NULL OR t.expires_at > NOW())`,
    [token],
  );

  if (rows.length === 0)
    return { success: false, error: "Invalid or expired link" };

  const tokenRow = rows[0];
  const isValid = await compare(password, tokenRow.password_hash);
  if (!isValid) return { success: false, error: "Incorrect password" };

  // Update last accessed
  await db.query(
    "UPDATE rep_schedule_tokens SET last_accessed_at = NOW() WHERE id = $1",
    [tokenRow.id],
  );

  return {
    success: true,
    rep: {
      id: tokenRow.rep_id,
      name: tokenRow.name,
      email: tokenRow.email,
      rep_type: tokenRow.rep_type,
    },
  };
}

export async function getPublicAvailability(repId: number, yearMonth: string) {
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
     FROM rep_availability WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3`,
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
  }));
}

export async function getPublicHearings(repId: number, yearMonth: string) {
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(yearMonth.split("-")[0]),
    parseInt(yearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  const { rows } = await db.query(
    `SELECT hearing_date::text AS date, claimant, converted_time_est::text AS time, alj
     FROM hearings WHERE assigned_rep_id = $1 AND hearing_date BETWEEN $2 AND $3
     ORDER BY hearing_date, converted_time_est`,
    [repId, firstDay, lastDay],
  );
  return rows as {
    date: string;
    claimant: string;
    time: string;
    alj: string | null;
  }[];
}

// Same shape as getPublicHearings above, but accepts a start/end month
// range instead of a single month, for reps who want a downloadable list
// spanning more than one month (e.g. August through September).
export async function getPublicHearingsRange(
  repId: number,
  startYearMonth: string,
  endYearMonth: string,
) {
  const firstDay = `${startYearMonth}-01`;
  const lastDayDate = new Date(
    parseInt(endYearMonth.split("-")[0]),
    parseInt(endYearMonth.split("-")[1]),
    0,
  );
  const lastDay = `${endYearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  const { rows } = await db.query(
    `SELECT hearing_date::text AS date, claimant, converted_time_est::text AS time, alj
     FROM hearings WHERE assigned_rep_id = $1 AND hearing_date BETWEEN $2 AND $3
     ORDER BY hearing_date, converted_time_est`,
    [repId, firstDay, lastDay],
  );
  return rows as {
    date: string;
    claimant: string;
    time: string;
    alj: string | null;
  }[];
}

export async function getPublicHolidays(
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

/** Staff-granted exception letting a rep submit past the 45-day deadline for one month. */
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

export async function savePublicAvailability(
  repId: number,
  yearMonth: string,
  days: {
    date: string;
    type: string;
    timeSlots?: { start: string; end: string }[];
  }[],
  lockSchedule: boolean,
) {
  // Check deadline. Compared at midnight, same as the client's
  // isPastDeadline calc, so the deadline day itself still counts as open
  // instead of the server cutting it off a full day earlier than the UI
  // shows. A staff-granted exception bypasses this entirely.
  const [yr, mo] = yearMonth.split("-").map(Number);
  const deadline = new Date(yr, mo - 1, 1);
  deadline.setDate(deadline.getDate() - 45);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (todayMidnight > deadline) {
    const hasException = await getScheduleDeadlineException(repId, yearMonth);
    if (!hasException)
      throw new Error(
        "The 45-day deadline has passed. Contact your administrator.",
      );
  }

  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(yr, mo, 0);
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
}

export async function resetPublicSchedule(repId: number, yearMonth: string) {
  const [yr, mo] = yearMonth.split("-").map(Number);
  const deadline = new Date(yr, mo - 1, 1);
  deadline.setDate(deadline.getDate() - 45);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (todayMidnight > deadline) {
    const hasException = await getScheduleDeadlineException(repId, yearMonth);
    if (!hasException) throw new Error("The 45-day deadline has passed.");
  }

  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(yr, mo, 0);
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  await db.query(
    "DELETE FROM rep_availability WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3",
    [repId, firstDay, lastDay],
  );
}

export async function getRepTimezone(repId: number): Promise<string> {
  const { rows } = await db.query(
    "SELECT timezone FROM representatives WHERE id = $1",
    [repId],
  );
  return rows[0]?.timezone || "America/New_York";
}

export async function updatePublicRepTimezone(repId: number, timezone: string) {
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
