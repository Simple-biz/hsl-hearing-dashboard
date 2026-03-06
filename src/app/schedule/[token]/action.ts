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
  // Check deadline
  const [yr, mo] = yearMonth.split("-").map(Number);
  const deadline = new Date(yr, mo - 1, 1);
  deadline.setDate(deadline.getDate() - 45);
  if (new Date() >= deadline)
    throw new Error(
      "The 45-day deadline has passed. Contact your administrator.",
    );

  const firstDay = `${yearMonth}-01`;
  const lastDayDate = new Date(yr, mo, 0);
  const lastDay = `${yearMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  await db.query(
    "DELETE FROM rep_availability WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3",
    [repId, firstDay, lastDay],
  );

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

  if (lockSchedule) {
    const daysInMonth = lastDayDate.getDate();
    const setDates = new Set(days.map((d) => d.date));
    const todayStr = new Date().toISOString().split("T")[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
      if (setDates.has(dateStr) || dateStr < todayStr) continue;
      const dow = new Date(yr, mo - 1, d).getDay();
      if (dow === 0 || dow === 6) continue;

      await db.query(
        `INSERT INTO rep_availability (rep_id, availability_date, is_available, availability_type, schedule_locked)
         VALUES ($1, $2, false, 'full_day', true)
         ON CONFLICT (rep_id, availability_date) DO NOTHING`,
        [repId, dateStr],
      );
    }
  }
}

export async function resetPublicSchedule(repId: number, yearMonth: string) {
  const [yr, mo] = yearMonth.split("-").map(Number);
  const deadline = new Date(yr, mo - 1, 1);
  deadline.setDate(deadline.getDate() - 45);
  if (new Date() >= deadline)
    throw new Error("The 45-day deadline has passed.");

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
