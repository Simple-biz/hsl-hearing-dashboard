import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Auto-Lock Schedules Cron
 * Port of cron_auto_lock_schedule.php
 *
 * Automatically locks schedules for reps who didn't lock by 45-day deadline.
 * Default availability by rep type:
 *   - internal_advocates / in-house → AVAILABLE
 *   - external_advocates / contract → UNAVAILABLE
 *
 * Inserts default records for missing business days (skips weekends, holidays, past dates).
 *
 * Schedule: Daily at midnight via Vercel Cron
 * GET /api/cron/auto-lock?cron_key=SECRET
 */

function getDeadlineForMonth(yearMonth: string): Date {
  const [year, month] = yearMonth.split("-").map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  firstOfMonth.setDate(firstOfMonth.getDate() - 45);
  return firstOfMonth;
}

function isDeadlinePassed(yearMonth: string): boolean {
  const deadline = getDeadlineForMonth(yearMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= deadline;
}

function getDefaultAvailable(repType: string): boolean {
  return repType === "internal_advocates" || repType === "in-house";
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

  let autoLocked = 0;
  let alreadyLocked = 0;
  let emailsSent = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Check current month + next 3 months
    const monthsToCheck: string[] = [];
    for (let i = 0; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      monthsToCheck.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }

    // Get all active reps
    const { rows: reps } = await db.query(
      "SELECT id, name, email, rep_type FROM representatives WHERE is_active = true",
    );

    // Get federal holidays for relevant years
    const years = [...new Set(monthsToCheck.map((m) => m.split("-")[0]))];
    const { rows: holidayRows } = await db.query(
      "SELECT holiday_date::text FROM federal_holidays WHERE EXTRACT(YEAR FROM holiday_date) = ANY($1::int[])",
      [years.map(Number)],
    );
    const holidays = new Set(holidayRows.map((r) => r.holiday_date));

    for (const targetMonth of monthsToCheck) {
      if (!isDeadlinePassed(targetMonth)) continue;

      const monthName = new Date(
        parseInt(targetMonth.split("-")[0]),
        parseInt(targetMonth.split("-")[1]) - 1,
        1,
      ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

      const firstDay = `${targetMonth}-01`;
      const lastDayDate = new Date(
        parseInt(targetMonth.split("-")[0]),
        parseInt(targetMonth.split("-")[1]),
        0,
      );
      const lastDay = `${targetMonth}-${String(lastDayDate.getDate()).padStart(2, "0")}`;
      const daysInMonth = lastDayDate.getDate();

      for (const rep of reps) {
        try {
          // Check if already locked
          const { rows: lockCheck } = await db.query(
            `SELECT COUNT(*)::int AS total,
                    COALESCE(SUM(CASE WHEN schedule_locked = true THEN 1 ELSE 0 END), 0)::int AS locked_count
             FROM rep_availability
             WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3`,
            [rep.id, firstDay, lastDay],
          );

          if (lockCheck[0]?.locked_count > 0) {
            alreadyLocked++;
            continue;
          }

          const defaultAvailable = getDefaultAvailable(rep.rep_type);
          const defaultStatus = defaultAvailable ? "AVAILABLE" : "UNAVAILABLE";

          // Lock existing records
          await db.query(
            `UPDATE rep_availability SET schedule_locked = true
             WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3`,
            [rep.id, firstDay, lastDay],
          );

          // Get existing dates to skip
          const { rows: existingRows } = await db.query(
            `SELECT availability_date::text FROM rep_availability
             WHERE rep_id = $1 AND availability_date BETWEEN $2 AND $3`,
            [rep.id, firstDay, lastDay],
          );
          const existingDates = new Set(
            existingRows.map((r) => r.availability_date),
          );

          // Insert default records for missing business days
          let datesAdded = 0;
          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${targetMonth}-${String(day).padStart(2, "0")}`;
            const dateObj = new Date(
              parseInt(targetMonth.split("-")[0]),
              parseInt(targetMonth.split("-")[1]) - 1,
              day,
            );

            // Skip past dates
            if (dateStr < todayStr) continue;
            // Skip existing records
            if (existingDates.has(dateStr)) continue;
            // Skip federal holidays
            if (holidays.has(dateStr)) continue;
            // Skip weekends (0=Sun, 6=Sat)
            const dayOfWeek = dateObj.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            await db.query(
              `INSERT INTO rep_availability (rep_id, availability_date, is_available, availability_type, schedule_locked, notes)
               VALUES ($1, $2, $3, 'full_day', true, 'Auto-locked by system (45-day deadline passed)')`,
              [rep.id, dateStr, defaultAvailable],
            );
            datesAdded++;
          }

          autoLocked++;

          await db.query(
            "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
            [
              "schedule_auto_locked",
              `Auto-locked schedule for ${rep.name} (${rep.rep_type}) for ${monthName}. Default: ${defaultStatus}. Added ${datesAdded} records.`,
            ],
          );

          // Send notification email (minimal — no PHI, just tells them their schedule was locked)
          if (rep.email && webhookUrl) {
            try {
              // Get or find existing token for schedule URL
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

              const headers: Record<string, string> = {
                "Content-Type": "application/json",
              };
              if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

              const response = await fetch(webhookUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  email_type: "auto_lock_minimal",
                  to_email: rep.email,
                  to_name: rep.name,
                  rep_type: rep.rep_type,
                  month_name: monthName,
                  default_status: defaultStatus,
                  schedule_url: scheduleUrl,
                  source: "hsl_hearing_system",
                  sent_at: new Date().toISOString(),
                }),
              });

              if (response.ok) emailsSent++;
            } catch {
              // Don't fail the lock if email fails
            }
          }
        } catch (e) {
          failed++;
          errors.push(
            `${rep.name} (${targetMonth}): ${e instanceof Error ? e.message : "Unknown"}`,
          );
        }
      }
    }

    await db.query(
      "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
      [
        "auto_lock_cron",
        `Auto-lock cron: ${autoLocked} locked, ${alreadyLocked} already locked, ${emailsSent} emails, ${failed} failed`,
      ],
    );

    return NextResponse.json({
      success: true,
      autoLocked,
      alreadyLocked,
      emailsSent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Auto-lock cron error:", msg);
    return NextResponse.json(
      { error: "Internal error", details: msg },
      { status: 500 },
    );
  }
}
