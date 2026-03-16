import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * Log an activity for HIPAA audit trail.
 * Called from server actions and API routes.
 */
export async function logActivity(
  userId: number | null,
  action: string,
  description: string,
  ipAddress?: string,
) {
  await db.query(
    "INSERT INTO activity_log (user_id, action, description, ip_address) VALUES ($1, $2, $3, $4)",
    [userId, action, description, ipAddress ?? null],
  );
}

/**
 * Log activity with auto-resolved session user.
 * Falls back to NULL (system event) if no session — NOT to user_id=1.
 */
export async function logAction(action: string, description: string) {
  let userId: number | null = null;
  try {
    const session = await getSession();
    if (session?.user?.id) userId = Number(session.user.id);
  } catch (e) {
    console.error("logAction: Failed to get session", e);
  }
  await logActivity(userId, action, description);
}

/**
 * Log activity without a user context (for cron jobs, system events).
 */
export async function logSystemActivity(action: string, description: string) {
  await db.query(
    "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
    [action, description],
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
