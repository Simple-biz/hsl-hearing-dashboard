"use server";

import crypto from "crypto";
import { db } from "@/lib/db";
import { saveRepAvailabilityMonth } from "@/lib/rep-schedule";
import { getScheduleDeadline } from "@/lib/schedule-deadline";
import { logSystemActivity } from "@/lib/activity-log";
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

const SCHEDULE_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Self-service password reset for this schedule link, for a rep who has
 * the URL but lost/forgot the password. Always resolves the same way
 * regardless of whether `email` matches the rep tied to this token, so the
 * caller can't use this to confirm whose link they're looking at -- same
 * anti-enumeration approach as the dashboard's requestPasswordReset.
 */
export async function requestScheduleTokenPasswordReset(
  token: string,
  email: string,
): Promise<{ success: true }> {
  const { rows } = await db.query(
    `SELECT t.id AS token_id, r.name, r.email
     FROM rep_schedule_tokens t
     JOIN representatives r ON t.rep_id = r.id
     WHERE t.token = $1 AND t.is_active = true AND (t.expires_at IS NULL OR t.expires_at > NOW())
       AND r.email = $2`,
    [token, email],
  );

  if (rows.length === 0) {
    return { success: true };
  }

  const { token_id: tokenId, name, email: repEmail } = rows[0];
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + SCHEDULE_RESET_TOKEN_TTL_MS);

  // Invalidate any prior outstanding reset requests for this link before
  // issuing a new one.
  await db.query(
    "DELETE FROM rep_schedule_password_reset_tokens WHERE rep_schedule_token_id = $1 AND used_at IS NULL",
    [tokenId],
  );
  await db.query(
    "INSERT INTO rep_schedule_password_reset_tokens (rep_schedule_token_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [tokenId, tokenHash, expiresAt],
  );

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";
  const resetUrl = `${appUrl}/schedule/reset-password/${rawToken}`;
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (webhookUrl && webhookSecret) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": webhookSecret,
        },
        body: JSON.stringify({
          email_type: "schedule_password_reset_link",
          to_email: repEmail,
          to_name: name,
          reset_url: resetUrl,
          subject: "Reset Your HSL Schedule Password",
          body: `Hello ${name},\n\nWe received a request to reset the password for your schedule link. This reset link expires in 1 hour and can only be used once:\n\n${resetUrl}\n\nYour schedule link itself does not change, only the password.\n\nIf you didn't request this, you can ignore this email.\n\nHogan Smith Law`,
        }),
      });
      if (!response.ok) {
        throw new Error(`Email send failed (${response.status})`);
      }
    } catch (err) {
      // Never surface send failures to the requester -- that would leak
      // account-existence/system-health signal. Log for admin visibility.
      await logSystemActivity(
        "schedule_password_reset_email_failed",
        `Failed to send schedule password reset email to ${name} (${repEmail}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Local/dev convenience only: N8N is never unconfigured in production,
    // so this path only ever runs against a dev-env session.
    console.log(`[dev] Schedule password reset link for ${repEmail}: ${resetUrl}`);
  }

  await logSystemActivity(
    "schedule_password_reset_requested",
    `Schedule password reset requested for ${name} (${repEmail})`,
  );

  return { success: true };
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

/** Staff-granted exception letting a rep submit past the submission deadline for one month. */
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
  const deadline = getScheduleDeadline(yearMonth);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (todayMidnight > deadline) {
    const hasException = await getScheduleDeadlineException(repId, yearMonth);
    if (!hasException)
      throw new Error(
        "The submission deadline has passed. Contact your administrator.",
      );
  }

  await saveRepAvailabilityMonth(repId, yearMonth, days, lockSchedule);
}

export async function resetPublicSchedule(repId: number, yearMonth: string) {
  const [yr, mo] = yearMonth.split("-").map(Number);
  const deadline = getScheduleDeadline(yearMonth);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (todayMidnight > deadline) {
    const hasException = await getScheduleDeadlineException(repId, yearMonth);
    if (!hasException)
      throw new Error("The submission deadline has passed.");
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
