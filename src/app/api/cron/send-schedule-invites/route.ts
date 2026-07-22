import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Send Schedule Invites Cron
 *
 * Fires on the 1st of every month at 9am.
 * Regenerates tokens for all active reps and sends the initial
 * schedule submission invite for the month 2 months out.
 *
 * Schedule: 1st of month at 9:00 AM via Vercel Cron
 * GET /api/cron/send-schedule-invites?cron_key=SECRET
 *
 * Test mode: set CRON_TEST_EMAIL in env to redirect all emails
 * to a single address without touching the actual rep emails.
 */

function generateRandomPassword(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

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

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";
  const testEmail = process.env.CRON_TEST_EMAIL || null;

  // Target month is 2 months from now
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
  const monthName = targetDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Deadline is the 20th of the current month (M-2 relative to target)
  const deadlineObj = new Date(now.getFullYear(), now.getMonth(), 20);
  const deadlineDate = deadlineObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysRemaining = Math.ceil(
    (deadlineObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const crypto = await import("crypto");
    const bcryptjs = await import("bcryptjs");

    const { rows: reps } = await db.query(
      `SELECT id, name, email FROM representatives WHERE is_active = true AND email IS NOT NULL AND email != '' ORDER BY name${testEmail ? " LIMIT 1" : ""}`,
    );

    for (const rep of reps) {
      try {
        const password = generateRandomPassword(8);
        const token = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcryptjs.hash(password, 10);

        // Deactivate existing tokens
        await db.query(
          "UPDATE rep_schedule_tokens SET is_active = false WHERE rep_id = $1",
          [rep.id],
        );

        // Insert new token
        await db.query(
          `INSERT INTO rep_schedule_tokens (rep_id, token, password_hash, is_active, expires_at)
           VALUES ($1, $2, $3, true, NULL)`,
          [rep.id, token, passwordHash],
        );

        const scheduleUrl = `${baseUrl}/schedule/${token}`;
        const toEmail = testEmail || rep.email;

        if (webhookUrl) {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

          const response = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              email_type: "schedule_reminder_minimal",
              to_email: toEmail,
              to_name: rep.name,
              month_name: monthName,
              days_remaining: daysRemaining,
              urgency_level: "normal",
              urgency_text: `${daysRemaining} days remaining`,
              schedule_url: scheduleUrl,
              deadline_date: deadlineDate,
              is_new_token: true,
              password,
              source: "hsl_hearing_system",
              sent_at: new Date().toISOString(),
            }),
          });

          if (response.ok) {
            sent++;
            await db.query(
              "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
              [
                "schedule_invite_sent",
                `Sent schedule invite to ${rep.name} for ${monthName}${testEmail ? " [TEST MODE]" : ""}`,
              ],
            );
          } else {
            failed++;
            errors.push(`${rep.name}: HTTP ${response.status}`);
          }
        } else {
          skipped++;
        }
      } catch (e) {
        failed++;
        errors.push(
          `${rep.name}: ${e instanceof Error ? e.message : "Unknown"}`,
        );
      }
    }

    await db.query(
      "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
      [
        "schedule_invite_cron",
        `Schedule invite cron: ${sent} sent, ${failed} failed, ${skipped} skipped — target: ${monthName}${testEmail ? ` [TEST MODE → ${testEmail}]` : ""}`,
      ],
    );

    return NextResponse.json({
      success: true,
      targetMonth,
      monthName,
      deadlineDate,
      testMode: !!testEmail,
      sent,
      failed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Schedule invite cron error:", msg);
    return NextResponse.json(
      { error: "Internal error", details: msg },
      { status: 500 },
    );
  }
}
