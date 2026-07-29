"use server";

import crypto from "crypto";
import { db } from "@/lib/db";
import { logSystemActivity } from "@/lib/activity-log";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Always resolves the same way regardless of whether `email` matches an
 * account, so the caller can't use this to enumerate valid logins.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ success: true }> {
  const { rows } = await db.query(
    "SELECT id, full_name, email FROM users WHERE email = $1 AND is_active = true",
    [email],
  );

  if (rows.length === 0) {
    return { success: true };
  }

  const user = rows[0];
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Invalidate any prior outstanding tokens for this user before issuing a new one.
  await db.query(
    "DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL",
    [user.id],
  );
  await db.query(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [user.id, tokenHash, expiresAt],
  );

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";
  const resetUrl = `${appUrl}/reset-password/${rawToken}`;
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (webhookUrl && webhookSecret) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": webhookSecret,
        },
        body: JSON.stringify({
          email_type: "password_reset_link",
          to_email: user.email,
          to_name: user.full_name,
          reset_url: resetUrl,
          subject: "Reset Your HSL Password",
          login_url: appUrl,
          body: `Hello ${user.full_name},\n\nWe received a request to reset your password. This link expires in 1 hour and can only be used once:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.\n\nHogan Smith Law`,
        }),
      });
    } catch (err) {
      // Never surface send failures to the requester -- that would leak
      // account-existence/system-health signal. Log for admin visibility.
      await logSystemActivity(
        "password_reset_email_failed",
        `Failed to send password reset email to ${user.full_name} (${user.email}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Local/dev convenience only: N8N is never unconfigured in production,
    // so this path only ever runs against a dev-env session.
    console.log(`[dev] Password reset link for ${user.email}: ${resetUrl}`);
  }

  await logSystemActivity(
    "password_reset_requested",
    `Password reset requested for ${user.full_name} (${user.email})`,
  );

  return { success: true };
}
