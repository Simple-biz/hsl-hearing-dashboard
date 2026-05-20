"use server";

// Admin server actions for the API Keys page. All gated to system_admin —
// the public REST API (/api/v1/*) is a security surface and these actions
// mint / revoke the credentials. requireRole redirects unauthorised users.

import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { generateApiKey } from "@/lib/api-keys";
import { logAction } from "@/lib/activity-log";
import { revalidatePath } from "next/cache";

const ADMIN_ROLES = ["system_admin"];

/** Row shape exposed to the admin UI. Never includes the hash. */
export interface ApiKeyAdminRow {
  id: number;
  prefix: string;
  label: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  expires_at: string | null;
}

export async function listApiKeys(): Promise<ApiKeyAdminRow[]> {
  await requireRole(ADMIN_ROLES);
  const { rows } = await db.query(
    `SELECT id,
            api_key_prefix AS prefix,
            label,
            is_active,
            created_at::text                    AS created_at,
            last_used_at::text                  AS last_used_at,
            request_count,
            expires_at::text                    AS expires_at
       FROM api_keys
      ORDER BY is_active DESC, created_at DESC`,
  );
  return rows as ApiKeyAdminRow[];
}

/**
 * Mint a new key. Returns the plaintext exactly once — the UI shows it,
 * then it's gone. The hash is what's persisted; the plaintext is never
 * recoverable from the DB.
 */
export async function createApiKey(
  label: string,
  expiresAt: string | null = null,
): Promise<{ fullKey: string; row: ApiKeyAdminRow }> {
  const session = await requireRole(ADMIN_ROLES);
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    throw new Error("Label is required.");
  }

  const { fullKey, prefix, hash } = generateApiKey();
  const { rows } = await db.query(
    `INSERT INTO api_keys
       (user_id, api_key_prefix, api_key, label, is_active,
        expires_at, request_count, created_at)
     VALUES ($1, $2, $3, $4, TRUE,
             NULLIF($5, '')::timestamptz, 0, NOW())
     RETURNING id,
               api_key_prefix AS prefix,
               label,
               is_active,
               created_at::text   AS created_at,
               last_used_at::text AS last_used_at,
               request_count,
               expires_at::text   AS expires_at`,
    [session.user.id, prefix, hash, trimmedLabel, expiresAt ?? ""],
  );

  await logAction(
    "api_key_created",
    `Generated API key '${trimmedLabel}' (${prefix}…)`,
    null,
  );

  revalidatePath("/api-keys");
  return { fullKey, row: rows[0] as ApiKeyAdminRow };
}

/** Soft-revoke (is_active = false). Preserves history (request_count etc.) */
export async function revokeApiKey(id: number): Promise<void> {
  await requireRole(ADMIN_ROLES);
  const { rows } = await db.query(
    `UPDATE api_keys SET is_active = FALSE
      WHERE id = $1 AND is_active = TRUE
      RETURNING label, api_key_prefix AS prefix`,
    [id],
  );
  if (rows.length > 0) {
    await logAction(
      "api_key_revoked",
      `Revoked API key '${rows[0].label}' (${rows[0].prefix}…)`,
      null,
    );
  }
  revalidatePath("/api-keys");
}
