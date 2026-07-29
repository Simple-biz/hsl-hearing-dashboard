"use server";

import crypto from "crypto";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { logSystemActivity } from "@/lib/activity-log";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function validateResetToken(
  rawToken: string,
): Promise<{ valid: boolean; error?: string }> {
  const tokenHash = hashToken(rawToken);
  const { rows } = await db.query(
    `SELECT id FROM password_reset_tokens
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

export async function completePasswordReset(
  rawToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ success: true }> {
  if (newPassword !== confirmPassword)
    throw new Error("Passwords do not match");
  if (newPassword.length < 8)
    throw new Error("Password must be at least 8 characters");

  const tokenHash = hashToken(rawToken);
  const { rows } = await db.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );
  if (rows.length === 0)
    throw new Error(
      "This reset link is invalid or has expired. Please request a new one.",
    );

  const { id: tokenId, user_id: userId } = rows[0];
  const hashed = await hash(newPassword, 10);

  await db.query(
    "UPDATE users SET password_hash = $1, force_password_change = false WHERE id = $2",
    [hashed, userId],
  );
  await db.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1",
    [tokenId],
  );
  // Invalidate any other outstanding tokens for this user (defense in depth
  // -- e.g. multiple reset requests were made before this one was used).
  await db.query(
    "DELETE FROM password_reset_tokens WHERE user_id = $1 AND id != $2 AND used_at IS NULL",
    [userId, tokenId],
  );

  const { rows: userRows } = await db.query(
    "SELECT full_name, email FROM users WHERE id = $1",
    [userId],
  );
  await logSystemActivity(
    "password_reset_completed",
    `Password reset completed for ${userRows[0]?.full_name} (${userRows[0]?.email})`,
  );

  return { success: true };
}
