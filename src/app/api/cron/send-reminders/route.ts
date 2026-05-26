import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { excludeWithdrawnSql } from "@/lib/hearing-filters";

/**
 * Hearing Reminders Cron Job
 * Runs daily via Vercel Cron or manually via:
 *   GET /api/cron/send-reminders?cron_key=YOUR_SECRET
 *
 * HIPAA-SAFE: Uses minimal-alert email format (no PHI).
 */

const REMINDER_INTERVALS = [
  { type: "7_days", days: 7 },
  { type: "1_day", days: 1 },
];

export async function GET(request: Request) {
  // Verify cron secret
  const { searchParams } = new URL(request.url);
  const cronSecret =
    searchParams.get("cron_key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured in environment variables" },
      { status: 500 },
    );
  }

  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const dashboardUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    for (const interval of REMINDER_INTERVALS) {
      try {
        // Calculate target date as string for exact match
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + interval.days);
        const targetDateStr = targetDate.toISOString().split("T")[0];

        // Get hearings needing this reminder. Withdrawn cases are excluded
        // at the query level (shared rep-facing filter) so no reminder side
        // effects (webhook send + hearing_reminders insert) occur for them.
        const { rows: hearings } = await db.query(
          `SELECT h.id, r.email AS rep_email, r.name AS rep_name
           FROM hearings h
           INNER JOIN representatives r ON h.assigned_rep_id = r.id
           WHERE h.hearing_date::text = $1
             AND h.assigned_rep_id IS NOT NULL
             AND r.is_active = true
             AND r.email IS NOT NULL
             AND r.email != ''
             AND ${excludeWithdrawnSql("h")}
             AND NOT EXISTS (
               SELECT 1 FROM hearing_reminders hr
               WHERE hr.hearing_id = h.id
                 AND hr.reminder_type::text = $2
             )
           ORDER BY h.converted_time_est ASC`,
          [targetDateStr, interval.type],
        );

        for (const hearing of hearings) {
          if (!hearing.rep_email) {
            skipped++;
            continue;
          }

          if (!webhookUrl) {
            skipped++;
            continue;
          }

          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

            const response = await fetch(webhookUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                email_type: "hearing_reminder_minimal",
                to_email: hearing.rep_email,
                to_name: hearing.rep_name,
                days_until_hearing: interval.days,
                reminder_type: interval.type,
                dashboard_url: dashboardUrl,
                source: "hsl_hearing_system",
                sent_at: new Date().toISOString(),
              }),
            });

            if (response.ok) {
              // Mark reminder as sent
              await db.query(
                `INSERT INTO hearing_reminders (hearing_id, reminder_type, sent_at, sent_to_email)
                 VALUES ($1, $2::reminder_type_enum, NOW(), $3)`,
                [hearing.id, interval.type, hearing.rep_email],
              );
              sent++;
            } else {
              failed++;
              errors.push(
                `${interval.type} to ${hearing.rep_name}: HTTP ${response.status}`,
              );
            }
          } catch (e) {
            failed++;
            errors.push(
              `${interval.type} to ${hearing.rep_name}: ${e instanceof Error ? e.message : "Unknown"}`,
            );
          }
        }
      } catch (e) {
        errors.push(
          `${interval.type} query failed: ${e instanceof Error ? e.message : "Unknown"}`,
        );
      }
    }

    // Log summary
    try {
      await db.query(
        "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
        [
          "cron_reminders",
          `Reminder cron: ${sent} sent, ${failed} failed, ${skipped} skipped`,
        ],
      );
    } catch {
      // Don't fail the whole job if logging fails
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Reminder cron error:", message);
    return NextResponse.json(
      { error: "Internal error", details: message },
      { status: 500 },
    );
  }
}
