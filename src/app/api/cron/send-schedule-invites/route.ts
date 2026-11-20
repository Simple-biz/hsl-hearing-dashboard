import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getScheduleDeadline } from "@/lib/schedule-deadline";

// One bcrypt hash plus one webhook call per rep takes ~5s, mostly waiting
// on n8n. Run one after another, ~59 reps passed Vercel's 300s default and
// cut the 2026-11-01 run off after 30 reps. Reps now go out in small
// parallel groups (same approach as the import page), and fluid compute
// allows up to 800s on Pro as a safety margin.
export const maxDuration = 800;

// Small groups keep n8n and the mail provider from seeing a burst of ~59
// sends at once.
const BATCH_SIZE = 5;

/**
 * Send Schedule Invites Cron
 *
 * Fires on the 1st of every month at 9am.
 * Regenerates tokens for all active reps and sends the initial
 * schedule submission invite for the month 2 months out.
 *
 * Each rep's new token is created inactive and only switched on (and the
 * old one switched off) after n8n confirms the email was sent. A failed
 * send or a run cut off midway leaves the rep's existing link working.
 *
 * Safe to rerun: reps who already have an active token created this month
 * are skipped, so a rerun only reaches reps the earlier run missed.
 *
 * Schedule: 1st of month at 9:00 AM via Vercel Cron
 * GET /api/cron/send-schedule-invites?cron_key=SECRET
 *
 * Test mode: set CRON_TEST_EMAIL in env to redirect all emails
 * to a single address without touching the actual rep emails.
 *
 * Run summary: set SCHEDULE_INVITE_ALERT_EMAIL (comma-separated) to email
 * a summary after every run, listing any reps that failed. Sent through
 * the n8n workflow's existing "generic" branch.
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

  const deadlineObj = getScheduleDeadline(targetMonth);
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
  let alreadySent = 0;
  const errors: string[] = [];

  try {
    const crypto = await import("crypto");
    const bcryptjs = await import("bcryptjs");

    const { rows: reps } = await db.query(
      `SELECT id, name, email FROM representatives WHERE is_active = true AND email IS NOT NULL AND email != '' ORDER BY name${testEmail ? " LIMIT 1" : ""}`,
    );

    // Reps whose invite already went out this month (an earlier run, or an
    // admin-issued link). Tokens only become active after a confirmed send,
    // so an active token created this month means the rep has a working link.
    const { rows: doneRows } = await db.query(
      `SELECT DISTINCT rep_id FROM rep_schedule_tokens
       WHERE is_active = true AND created_at >= date_trunc('month', NOW())`,
    );
    const doneRepIds = new Set<number>(doneRows.map((r) => r.rep_id));
    const pendingReps = reps.filter((r) => !doneRepIds.has(r.id));
    alreadySent = reps.length - pendingReps.length;

    // Written up front so a run that gets cut off still leaves a trace:
    // a "started" line with no matching summary line means it never finished.
    await db.query(
      "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
      [
        "schedule_invite_cron_started",
        `Schedule invite cron started: ${pendingReps.length} to send, ${alreadySent} already sent this month — target: ${monthName}${testEmail ? ` [TEST MODE → ${testEmail}]` : ""}`,
      ],
    );

    const inviteRep = async (rep: { id: number; name: string; email: string }) => {
      if (!webhookUrl) {
        // No way to email the rep, so leave their current link alone.
        skipped++;
        return;
      }

      const password = generateRandomPassword(8);
      const token = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcryptjs.hash(password, 10);

      // Insert new token switched off. The rep's existing link keeps
      // working until this one is confirmed sent.
      const { rows: inserted } = await db.query(
        `INSERT INTO rep_schedule_tokens (rep_id, token, password_hash, is_active, expires_at)
         VALUES ($1, $2, $3, false, NULL) RETURNING id`,
        [rep.id, token, passwordHash],
      );
      const newTokenId = inserted[0].id;

      const scheduleUrl = `${baseUrl}/schedule/${token}`;
      const toEmail = testEmail || rep.email;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

      let failure: string | null = null;
      try {
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
        if (!response.ok) failure = `HTTP ${response.status}`;
      } catch (e) {
        failure = e instanceof Error ? e.message : "Unknown";
      }

      if (failure) {
        // Never emailed, so drop it. The old link stays active.
        await db.query("DELETE FROM rep_schedule_tokens WHERE id = $1", [
          newTokenId,
        ]);
        throw new Error(failure);
      }

      // Switch to the new token in one statement: new on, all others off.
      await db.query(
        `UPDATE rep_schedule_tokens SET is_active = (id = $2)
         WHERE rep_id = $1 AND (is_active = true OR id = $2)`,
        [rep.id, newTokenId],
      );

      sent++;
      await db.query(
        "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
        [
          "schedule_invite_sent",
          `Sent schedule invite to ${rep.name} for ${monthName}${testEmail ? " [TEST MODE]" : ""}`,
        ],
      );
    };

    for (let i = 0; i < pendingReps.length; i += BATCH_SIZE) {
      const group = pendingReps.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(group.map(inviteRep));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") continue;
        const rep = group[j];
        const reason =
          r.reason instanceof Error ? r.reason.message : "Unknown";
        failed++;
        errors.push(`${rep.name}: ${reason}`);
        await db.query(
          "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
          [
            "email_failed",
            `Schedule invite FAILED to send to ${rep.name} for ${monthName}: ${reason}. Any previous link they had still works.`,
          ],
        );
      }
    }

    const summary = `Schedule invite cron: ${sent} sent, ${failed} failed, ${skipped} skipped, ${alreadySent} already sent this month — target: ${monthName}${testEmail ? ` [TEST MODE → ${testEmail}]` : ""}`;
    await db.query(
      "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
      ["schedule_invite_cron", summary],
    );

    // Email the run summary to staff so a failure is seen the same day,
    // not when a rep writes in.
    const alertEmail = process.env.SCHEDULE_INVITE_ALERT_EMAIL;
    if (alertEmail && webhookUrl) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;
      const esc = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const failedList =
        errors.length > 0
          ? `<p><strong>These reps did NOT get their invite.</strong> Any previous link they had still works. Rerun the job or send a link from the Rep Dashboard:</p><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
          : "<p>Every rep was sent their invite.</p>";
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            // Existing n8n "generic" branch: to_email, to_name, subject, html_body.
            email_type: "generic",
            to_email: alertEmail,
            to_name: "",
            subject: `${failed > 0 ? "ACTION NEEDED: " : ""}Schedule invites for ${monthName}: ${sent} sent, ${failed} failed`,
            html_body: `<p>${esc(summary)}</p>${failedList}`,
            source: "hsl_hearing_system",
            sent_at: new Date().toISOString(),
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (e) {
        await db.query(
          "INSERT INTO activity_log (user_id, action, description) VALUES (NULL, $1, $2)",
          [
            "email_failed",
            `Schedule invite summary email FAILED to send: ${e instanceof Error ? e.message : "Unknown"}`,
          ],
        );
      }
    }

    return NextResponse.json({
      success: true,
      targetMonth,
      monthName,
      deadlineDate,
      testMode: !!testEmail,
      sent,
      failed,
      skipped,
      alreadySent,
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
