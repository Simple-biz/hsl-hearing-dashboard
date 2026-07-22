import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Schedule Lock Reminder Cron
 * Port of cron_schedule_reminder.php
 *
 * Sends reminders to reps who haven't locked their schedule.
 * Deadline: 20th of 2 months prior to the scheduling month (e.g., July 20 for September).
 * Reminders sent at 10, 5, 1, and 0 days before deadline.
 *
 * Schedule: Daily at 9:00 AM via Vercel Cron
 * GET /api/cron/schedule-reminder?cron_key=SECRET
 */

const REMINDER_DAYS = [10, 5, 1, 0];

function getDeadlineForMonth(yearMonth: string): Date {
  // Deadline is the 20th of 2 months prior to the scheduling month
  const [year, month] = yearMonth.split("-").map(Number);
  const deadlineMonth = month - 2;
  const deadlineYear = deadlineMonth <= 0 ? year - 1 : year;
  const adjustedMonth = deadlineMonth <= 0 ? deadlineMonth + 12 : deadlineMonth;
  return new Date(deadlineYear, adjustedMonth - 1, 20);
}

function getMonthsToRemind(): {
  month: string;
  deadline: Date;
  daysRemaining: number;
  monthName: string;
}[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: {
    month: string;
    deadline: Date;
    daysRemaining: number;
    monthName: string;
  }[] = [];

  for (let i = 1; i <= 3; i++) {
    const checkMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const yearMonth = `${checkMonth.getFullYear()}-${String(checkMonth.getMonth() + 1).padStart(2, "0")}`;
    const deadline = getDeadlineForMonth(yearMonth);
    const daysRemaining = Math.ceil(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysRemaining >= 0 && daysRemaining <= 15) {
      results.push({
        month: yearMonth,
        deadline,
        daysRemaining,
        monthName: checkMonth.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
      });
    }
  }

  return results;
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
  const dashboardUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";
  const testEmail = process.env.CRON_TEST_EMAIL || null;

  let sent = 0;
  let alreadyLocked = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const monthsToRemind = getMonthsToRemind();

    if (monthsToRemind.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No months with approaching deadlines",
        sent: 0,
      });
    }

    // Get all active reps with email
    const { rows: reps } = await db.query(
      `SELECT id, name, email, rep_type FROM representatives WHERE is_active = true AND email IS NOT NULL AND email != ''${testEmail ? " LIMIT 1" : ""}`,
    );

    for (const monthData of monthsToRemind) {
      // Only send on specific reminder days
      if (!REMINDER_DAYS.includes(monthData.daysRemaining)) continue;

      // Determine urgency
      let urgencyLevel = "normal";
      let urgencyText = `${monthData.daysRemaining} days remaining`;
      if (monthData.daysRemaining === 0) {
        urgencyLevel = "critical";
        urgencyText = "TODAY IS THE DEADLINE";
      } else if (monthData.daysRemaining === 1) {
        urgencyLevel = "critical";
        urgencyText = "Tomorrow is the deadline";
      } else if (monthData.daysRemaining === 5) {
        urgencyLevel = "warning";
        urgencyText = "Only 5 days remaining";
      }

      const firstDay = `${monthData.month}-01`;
      const lastDayDate = new Date(
        parseInt(monthData.month.split("-")[0]),
        parseInt(monthData.month.split("-")[1]),
        0,
      );
      const lastDay = `${monthData.month}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

      for (const rep of reps) {
        try {
          // Check if rep already locked schedule for this month
          const { rows: lockCheck } = await db.query(
            `SELECT COUNT(*)::int AS total,
                    SUM(CASE WHEN schedule_locked = true THEN 1 ELSE 0 END)::int AS locked_count
             FROM rep_availability
             WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3`,
            [rep.id, firstDay, lastDay],
          );

          if (lockCheck[0]?.locked_count > 0) {
            alreadyLocked++;
            continue;
          }

          // Get or build schedule URL
          const { rows: tokenRows } = await db.query(
            `SELECT token FROM rep_schedule_tokens
             WHERE rep_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC LIMIT 1`,
            [rep.id],
          );
          const scheduleUrl =
            tokenRows.length > 0
              ? `${dashboardUrl}/schedule/${tokenRows[0].token}`
              : `${dashboardUrl}/schedule`;

          // Send minimal reminder via n8n
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
                to_email: testEmail || rep.email,
                to_name: rep.name,
                rep_type: rep.rep_type,
                month_name: monthData.monthName,
                days_remaining: monthData.daysRemaining,
                urgency_level: urgencyLevel,
                urgency_text: urgencyText,
                schedule_url: scheduleUrl,
                deadline_date: monthData.deadline.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }),
                source: "hsl_hearing_system",
                sent_at: new Date().toISOString(),
              }),
            });

            if (response.ok) {
              sent++;
              await db.query(
                "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
                [
                  "schedule_reminder_sent",
                  `Sent ${monthData.daysRemaining}-day schedule reminder to ${rep.name} for ${monthData.monthName}`,
                ],
              );
            } else {
              failed++;
              errors.push(`${rep.name}: HTTP ${response.status}`);
            }
          }
        } catch (e) {
          failed++;
          errors.push(
            `${rep.name}: ${e instanceof Error ? e.message : "Unknown"}`,
          );
        }
      }
    }

    await db.query(
      "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
      [
        "schedule_reminder_cron",
        `Schedule reminder cron: ${sent} sent, ${alreadyLocked} already locked, ${failed} failed`,
      ],
    );

    return NextResponse.json({
      success: true,
      sent,
      alreadyLocked,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Schedule reminder cron error:", msg);
    return NextResponse.json(
      { error: "Internal error", details: msg },
      { status: 500 },
    );
  }
}
