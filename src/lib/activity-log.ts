import { db } from "@/lib/db";

/**
 * Log an activity for HIPAA audit trail.
 * Called from server actions and API routes.
 */
export async function logActivity(
  userId: number,
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
 * Log activity without a user context (for cron jobs, system events).
 */
export async function logSystemActivity(action: string, description: string) {
  await db.query(
    "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
    [action, description],
  );
}
