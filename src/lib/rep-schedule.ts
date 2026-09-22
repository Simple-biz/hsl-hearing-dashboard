import { db } from "@/lib/db";

export interface RepAvailabilityDay {
  date: string;
  type: string;
  timeSlots?: { start: string; end: string }[];
}

/**
 * Delete a rep's existing availability for the month, rebuild it from the
 * given days, and (if locking) fill the remaining unset business days as
 * locked/unavailable -- all as one atomic statement via chained writable
 * CTEs, matching the codebase's own bulk-write convention (the archive CTE,
 * and the unnest-based bulk insert in post-hrg-development/actions.ts)
 * instead of a hand-rolled multi-statement transaction.
 *
 * Shared by the staff dashboard's saveAvailability and the public
 * rep-token page's savePublicAvailability, which used to carry two
 * separate copies of this exact query. Kept as one implementation since
 * getting it right took three review-driven revisions: a JS transaction
 * wrapper (dropped the transient-connection retry, held a connection open
 * across ~60 round trips), a single-statement version that still left the
 * lock-fill non-atomic relative to the explicit-day write, then this one,
 * which also fixes a duplicate-key race -- `deleted` and `inserted` are
 * chained via the `WHERE (SELECT count(*) FROM deleted) >= 0` clause
 * specifically to force `deleted` to run first; without it, sibling
 * writable CTEs with no data dependency execute in an unspecified order
 * per Postgres docs, and `inserted`'s unique-constraint check can race the
 * delete on every re-save of an already-populated month.
 */
export async function saveRepAvailabilityMonth(
  repId: number,
  yearMonth: string,
  days: RepAvailabilityDay[],
  lockSchedule: boolean,
): Promise<void> {
  const [yr, mo] = yearMonth.split("-").map(Number);
  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(yr, mo, 0);
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

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
