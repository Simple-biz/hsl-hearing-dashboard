import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Cleanup Password Reset Tokens Cron
 *
 * Deletes password_reset_tokens and rep_schedule_password_reset_tokens rows
 * that are expired or already used, so spent/stale tokens don't sit around
 * indefinitely. Both tables share the same "raw token is the sole secret"
 * shape and expiry model, so one cron covers both.
 *
 * Schedule: Daily via Vercel Cron
 * GET /api/cron/cleanup-tokens?cron_key=SECRET
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cronSecret =
    searchParams.get("cron_key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rowCount } = await db.query(
    "DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL",
  );
  const { rowCount: scheduleRowCount } = await db.query(
    "DELETE FROM rep_schedule_password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL",
  );

  return NextResponse.json({
    deleted: rowCount ?? 0,
    deletedScheduleResetTokens: scheduleRowCount ?? 0,
  });
}
