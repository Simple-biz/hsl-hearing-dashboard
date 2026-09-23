"use server";

import crypto from "crypto";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { logSystemActivity } from "@/lib/activity-log";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function validateScheduleResetToken(
  rawToken: string,
): Promise<{ valid: boolean; error?: string }> {
  const tokenHash = hashToken(rawToken);
  const { rows } = await db.query(
    `SELECT id FROM rep_schedule_password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );

  if (rows.length === 0)
    return {
      valid: false,
      error:
        "This reset link is invalid or has expired. Please request a new one.",
    };

  return { valid: true };
}

export async function completeScheduleTokenPasswordReset(
  rawToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ success: true }> {
  if (newPassword !== confirmPassword)
    throw new Error("Passwords do not match");
  if (newPassword.length < 4)
    throw new Error("Password must be at least 4 characters");

  const tokenHash = hashToken(rawToken);
  const { rows } = await db.query(
    `SELECT id, rep_schedule_token_id FROM rep_schedule_password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );
  if (rows.length === 0)
    throw new Error(
      "This reset link is invalid or has expired. Please request a new one.",
    );

  const { id: resetTokenId, rep_schedule_token_id: scheduleTokenId } =
    rows[0];
  const hashed = await hash(newPassword, 10);

  await db.query(
    "UPDATE rep_schedule_tokens SET password_hash = $1 WHERE id = $2",
    [hashed, scheduleTokenId],
  );
  await db.query(
    "UPDATE rep_schedule_password_reset_tokens SET used_at = NOW() WHERE id = $1",
    [resetTokenId],
  );
  // Invalidate any other outstanding reset requests for this same link
  // (defense in depth -- e.g. multiple reset requests before this one was used).
  await db.query(
    "DELETE FROM rep_schedule_password_reset_tokens WHERE rep_schedule_token_id = $1 AND id != $2 AND used_at IS NULL",
    [scheduleTokenId, resetTokenId],
  );

  const { rows: repRows } = await db.query(
    `SELECT r.name, r.email FROM rep_schedule_tokens t
     JOIN representatives r ON t.rep_id = r.id
     WHERE t.id = $1`,
    [scheduleTokenId],
  );
  await logSystemActivity(
    "schedule_password_reset_completed",
    `Schedule password reset completed for ${repRows[0]?.name} (${repRows[0]?.email})`,
  );

  return { success: true };
}
