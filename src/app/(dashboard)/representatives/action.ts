"use server";

import { db } from "@/lib/db";

export interface RepDetail {
  id: number;
  name: string;
  email: string;
  rep_type: string;
  is_active: boolean;
  priority: number;
  daily_limit: number;
  weekly_limit: number;
  preferred_monthly_hearings: number | null;
  hearing_restriction: string | null;
  timezone: string | null;
  this_week_count: number;
  upcoming_count: number;
  total_count: number;
}

export async function getRepDashboardData() {
  const { rows } = await db.query(
    `SELECT r.*,
       (SELECT COUNT(*)::int FROM hearings h WHERE h.assigned_rep_id = r.id
         AND h.hearing_date >= date_trunc('week', CURRENT_DATE)
         AND h.hearing_date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days') AS this_week_count,
       (SELECT COUNT(*)::int FROM hearings h WHERE h.assigned_rep_id = r.id
         AND h.hearing_date >= CURRENT_DATE) AS upcoming_count,
       (SELECT COUNT(*)::int FROM hearings h WHERE h.assigned_rep_id = r.id) AS total_count
     FROM representatives r
     ORDER BY CASE r.rep_type WHEN 'internal_advocates' THEN 1 WHEN 'in-house' THEN 2 ELSE 3 END, r.name`,
  );
  return rows as RepDetail[];
}

export async function saveRep(data: {
  id?: number;
  name: string;
  email: string;
  rep_type: string;
  priority: number;
  daily_limit: number;
  weekly_limit: number;
  hearing_restriction: string;
}) {
  const { logAction } = await import("@/lib/activity-log");
  if (data.id) {
    await db.query(
      `UPDATE representatives SET name=$1, email=$2, rep_type=$3, priority=$4,
       daily_limit=$5, weekly_limit=$6, hearing_restriction=$7 WHERE id=$8`,
      [
        data.name,
        data.email,
        data.rep_type,
        data.priority,
        data.daily_limit,
        data.weekly_limit,
        data.hearing_restriction || "none",
        data.id,
      ],
    );
    await logAction("rep_updated", `${data.name} updated`);
    return data.id;
  } else {
    const { rows } = await db.query(
      `INSERT INTO representatives (name, email, rep_type, priority, daily_limit, weekly_limit, hearing_restriction, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
      [
        data.name,
        data.email,
        data.rep_type,
        data.priority,
        data.daily_limit,
        data.weekly_limit,
        data.hearing_restriction || "none",
      ],
    );
    await logAction("rep_created", `${data.name} added as ${data.rep_type}`);
    return rows[0].id as number;
  }
}

export async function toggleRepActive(repId: number, active: boolean) {
  await db.query("UPDATE representatives SET is_active = $1 WHERE id = $2", [
    active,
    repId,
  ]);
  const { logAction } = await import("@/lib/activity-log");
  const { rows } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await logAction(
    "rep_updated",
    `${rows[0]?.name || "Unknown"} ${active ? "activated" : "deactivated"}`,
  );
}

export async function deleteRep(repId: number) {
  const { logAction } = await import("@/lib/activity-log");
  const { rows } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await db.query("DELETE FROM representatives WHERE id = $1", [repId]);
  await logAction("rep_deleted", `${rows[0]?.name || "Unknown"} deleted`);
}

export async function updateHearingRestriction(
  repId: number,
  restriction: string,
) {
  await db.query(
    "UPDATE representatives SET hearing_restriction = $1 WHERE id = $2",
    [restriction, repId],
  );
  const { logAction } = await import("@/lib/activity-log");
  const { rows } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await logAction(
    "rep_updated",
    `${rows[0]?.name || "Unknown"} hearing restriction set to ${restriction}`,
  );
}

// ═══════════ TOKEN MANAGEMENT ═══════════

export interface TokenInfo {
  hasToken: boolean;
  url?: string;
  token?: string;
  createdAt?: string;
  lastAccessed?: string;
  expiresAt?: string;
}

export async function getRepToken(repId: number): Promise<TokenInfo> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";
  const { rows } = await db.query(
    `SELECT token, created_at::text, last_accessed_at::text, expires_at::text
     FROM rep_schedule_tokens
     WHERE rep_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [repId],
  );
  if (rows.length === 0) return { hasToken: false };
  const t = rows[0];
  return {
    hasToken: true,
    url: `${baseUrl}/schedule/${t.token}`,
    token: t.token,
    createdAt: t.created_at,
    lastAccessed: t.last_accessed_at || "Never",
    expiresAt: t.expires_at || "Never",
  };
}

export async function generateToken(
  repId: number,
  password: string,
  expiresAt?: string,
) {
  const crypto = await import("crypto");
  const bcryptjs = await import("bcryptjs");
  const token = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcryptjs.hash(password, 10);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";

  // Deactivate existing tokens
  await db.query(
    "UPDATE rep_schedule_tokens SET is_active = false WHERE rep_id = $1",
    [repId],
  );

  // Create new token
  await db.query(
    `INSERT INTO rep_schedule_tokens (rep_id, token, password_hash, is_active, expires_at)
     VALUES ($1, $2, $3, true, $4)`,
    [repId, token, passwordHash, expiresAt || null],
  );

  return { success: true, url: `${baseUrl}/schedule/${token}`, token };
}

export async function revokeRepToken(repId: number) {
  const { rowCount } = await db.query(
    "UPDATE rep_schedule_tokens SET is_active = false WHERE rep_id = $1 AND is_active = true",
    [repId],
  );
  const { logAction } = await import("@/lib/activity-log");
  const { rows } = await db.query(
    "SELECT name FROM representatives WHERE id = $1",
    [repId],
  );
  await logAction(
    "token_revoked",
    `${rows[0]?.name || "Unknown"} schedule link revoked`,
  );
  return { success: true, revoked: rowCount || 0 };
}

export async function revokeAllTokens() {
  const { rowCount } = await db.query(
    "UPDATE rep_schedule_tokens SET is_active = false WHERE is_active = true",
  );
  const { logAction } = await import("@/lib/activity-log");
  await logAction(
    "token_revoked",
    `All schedule links revoked (${rowCount || 0} tokens)`,
  );
  return { success: true, revokedCount: rowCount || 0 };
}

function generateRandomPassword(
  length: number,
  type: "alphanumeric" | "numbers",
): string {
  const chars =
    type === "numbers"
      ? "0123456789"
      : "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export interface BulkResult {
  name: string;
  email: string;
  password: string;
  url: string;
  status: string;
}

export async function bulkGenerateTokens(options: {
  passwordLength: number;
  passwordType: "alphanumeric" | "numbers";
  skipExisting: boolean;
  sendEmail: boolean;
  expiresAt?: string;
}): Promise<{
  generated: number;
  skipped: number;
  failed: number;
  emailsSent: number;
  results: BulkResult[];
}> {
  const { rows: reps } = await db.query(
    "SELECT id, name, email FROM representatives WHERE is_active = true ORDER BY name",
  );

  const results: BulkResult[] = [];
  let generated = 0,
    skipped = 0,
    failed = 0,
    emailsSent = 0;

  for (const rep of reps) {
    // Check existing
    if (options.skipExisting) {
      const { rows: existing } = await db.query(
        "SELECT 1 FROM rep_schedule_tokens WHERE rep_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [rep.id],
      );
      if (existing.length > 0) {
        results.push({
          name: rep.name,
          email: rep.email || "",
          password: "-",
          url: "-",
          status: "Skipped (existing)",
        });
        skipped++;
        continue;
      }
    }

    try {
      const password = generateRandomPassword(
        options.passwordLength,
        options.passwordType,
      );
      const res = await generateToken(rep.id, password, options.expiresAt);
      results.push({
        name: rep.name,
        email: rep.email || "",
        password,
        url: res.url,
        status: "Generated",
      });
      generated++;

      // Send email via n8n if enabled
      if (options.sendEmail && rep.email) {
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
        if (webhookUrl) {
          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;
            const response = await fetch(webhookUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                email_type: "schedule_link",
                to_email: rep.email,
                to_name: rep.name,
                schedule_url: res.url,
                password,
                source: "hsl_hearing_system",
                sent_at: new Date().toISOString(),
              }),
            });
            if (response.ok) {
              emailsSent++;
              results[results.length - 1].status = "Generated + Emailed";
            }
          } catch {
            /* email failed, link still generated */
          }
        }
      }
    } catch {
      results.push({
        name: rep.name,
        email: rep.email || "",
        password: "-",
        url: "-",
        status: "Failed",
      });
      failed++;
    }
  }

  return { generated, skipped, failed, emailsSent, results };
}
