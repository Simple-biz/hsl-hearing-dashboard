"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// ─── Type ─────────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  notification_type: "withdrawal" | "status_change" | "mr_update" | "post_hrg";
  hearing_id: number | null;
  claimant_name: string | null;
  message: string;
  created_by: number | null;
  created_at: string;
  expires_at: string | null;
  created_by_name?: string;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getNotifications(): Promise<NotificationItem[]> {
  try {
    const result = await db.query(`
      SELECT n.*, u.full_name AS created_by_name
      FROM sync_notifications n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.expires_at > NOW()
      ORDER BY n.created_at DESC
      LIMIT 50
    `);
    return result.rows as NotificationItem[];
  } catch (err) {
    console.error("[getNotifications] failed:", err);
    return [];
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

// Shared helper — call from any action that records a withdrawal.
// Writes to sync_notifications so the global bell picks it up within 30s.
export async function createWithdrawalNotification(
  hearingId: number | null,
  claimantName: string,
): Promise<void> {
  try {
    const session = await getSession();
    const createdBy = session?.user?.id ?? null;
    await db.query(
      `INSERT INTO sync_notifications
         (notification_type, hearing_id, claimant_name, message, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')`,
      [
        "withdrawal",
        hearingId,
        claimantName,
        `Withdrawal recorded for ${claimantName}`,
        createdBy,
      ],
    );
  } catch {
    // Never let notification creation break the mutation that called it
  }
}

// Called when a hearing's decision status is set to 'Post HRG Review/ Dev'.
// Writes a notification so the global bell picks it up within 30s.
export async function createPostHrgNotification(
  hearingId: number | null,
  claimantName: string,
): Promise<void> {
  try {
    const session = await getSession();
    const createdBy = session?.user?.id ?? null;
    await db.query(
      `INSERT INTO sync_notifications
         (notification_type, hearing_id, claimant_name, message, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')`,
      [
        "post_hrg",
        hearingId,
        claimantName,
        `Post HRG Review set for ${claimantName}`,
        createdBy,
      ],
    );
  } catch (err) {
    console.error("[createPostHrgNotification] failed:", err);
    // Never let notification creation break the mutation that called it
  }
}
