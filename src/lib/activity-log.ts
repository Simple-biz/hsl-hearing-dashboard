import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * Log an activity for HIPAA audit trail.
 * Called from server actions and API routes.
 *
 * `hearingId` is back-end-only metadata for per-hearing filtering (e.g. the
 * Rep History modal). Optional — pass it when the action touches a specific
 * hearing; leave undefined for cross-hearing or non-hearing actions.
 */
export async function logActivity(
  userId: number | null,
  action: string,
  description: string,
  ipAddress?: string,
  hearingId?: number | null,
) {
  await db.query(
    "INSERT INTO activity_log (user_id, action, description, ip_address, hearing_id) VALUES ($1, $2, $3, $4, $5)",
    [userId, action, description, ipAddress ?? null, hearingId ?? null],
  );
}

/**
 * Log activity with auto-resolved session user.
 * Falls back to NULL (system event) if no session — NOT to user_id=1.
 * `hearingId` is optional; see logActivity for usage.
 */
export async function logAction(
  action: string,
  description: string,
  hearingId?: number | null,
) {
  let userId: number | null = null;
  try {
    const session = await getSession();
    if (session?.user?.id) userId = Number(session.user.id);
  } catch (e) {
    console.error("logAction: Failed to get session", e);
  }
  await logActivity(userId, action, description, undefined, hearingId);
}

/**
 * Log activity without a user context (for cron jobs, system events).
 */
export async function logSystemActivity(
  action: string,
  description: string,
  hearingId?: number | null,
) {
  await db.query(
    "INSERT INTO activity_log (user_id, action, description, hearing_id) VALUES (NULL, $1, $2, $3)",
    [action, description, hearingId ?? null],
  );
}

/**
 * Get claimant name for a hearing ID (for log descriptions).
 */
export async function getClaimantName(hearingId: number): Promise<string> {
  const { rows } = await db.query(
    "SELECT claimant FROM hearings WHERE id = $1",
    [hearingId],
  );
  return rows[0]?.claimant || `Hearing #${hearingId}`;
}
