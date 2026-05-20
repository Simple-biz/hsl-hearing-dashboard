// API-key generation + validation for the public REST API (/api/v1/*).
//
// Plaintext keys are NEVER stored — only the SHA-256 hex hash is persisted.
// The plain key is returned to the user exactly once at generation time;
// after that, the only thing the server retains is the hash (lookup column)
// and the prefix (display-only identifier in the admin UI).
//
// Storage uses the existing `api_keys` table:
//   id, user_id, api_key_prefix, api_key (= hash), label, is_active,
//   expires_at, last_used_at, request_count, created_at.
// The slightly historical column names are mapped to the cleaner names the
// admin page uses in src/app/(dashboard)/api-keys/actions.ts.

import crypto from "crypto";
import { db } from "@/lib/db";

const KEY_PREFIX = "hsl_";
const KEY_RANDOM_BYTES = 24; // 48 hex chars → matches the existing UI mock.

/** Internal — the canonical row shape returned by validateApiKey. */
export interface ApiKeyRow {
  id: number;
  user_id: number | null;
  prefix: string;
  label: string;
  is_active: boolean;
  expires_at: Date | null;
  last_used_at: Date | null;
  request_count: number;
  created_at: Date;
}

/** SHA-256 hex of the plaintext key. Used as the lookup column. */
export function hashApiKey(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/**
 * Generate a new key. Returns the plaintext (caller must show to user
 * exactly once, then discard), the displayable prefix, and the hash to
 * persist. The caller is responsible for inserting the row.
 */
export function generateApiKey(): {
  fullKey: string;
  prefix: string;
  hash: string;
} {
  const random = crypto.randomBytes(KEY_RANDOM_BYTES).toString("hex");
  const fullKey = `${KEY_PREFIX}${random}`;
  const prefix = fullKey.slice(0, 8); // e.g. "hsl_8f2a"
  const hash = hashApiKey(fullKey);
  return { fullKey, prefix, hash };
}

/**
 * Extract the plaintext key from a request. Accepts either
 * `X-API-Key: <key>` or `Authorization: Bearer <key>`.
 */
function extractKey(req: Request): string | null {
  const x = req.headers.get("x-api-key");
  if (x) return x.trim();
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Validate a request's API key. Returns the matching row when:
 *   - the header is present,
 *   - the hash matches an active key,
 *   - the key has not expired.
 * On success, stamps last_used_at and increments request_count
 * (best-effort; a counter-update failure does NOT reject the request).
 *
 * Returns null on any validation failure — the caller decides how to
 * respond (requireApiKey() below turns that into a 401 Response).
 */
export async function validateApiKey(req: Request): Promise<ApiKeyRow | null> {
  const plain = extractKey(req);
  if (!plain) return null;

  const hash = hashApiKey(plain);
  const { rows } = await db.query(
    `SELECT id, user_id, api_key_prefix AS prefix, label,
            is_active, expires_at, last_used_at, request_count, created_at
       FROM api_keys
      WHERE api_key = $1
      LIMIT 1`,
    [hash],
  );
  const row = rows[0] as ApiKeyRow | undefined;
  if (!row) return null;
  if (!row.is_active) return null;
  if (row.expires_at && row.expires_at.getTime() <= Date.now()) return null;

  // Best-effort usage stamp — never reject the request if this fails.
  db.query(
    `UPDATE api_keys
        SET last_used_at = NOW(),
            request_count = request_count + 1
      WHERE id = $1`,
    [row.id],
  ).catch((e) =>
    console.error("api_keys usage-stamp update failed", e),
  );

  return row;
}

/**
 * Route-handler helper. On invalid/missing key, returns a 401 Response the
 * route can directly return. On success, returns the validated row.
 *
 * Usage in a route:
 *   const auth = await requireApiKey(req);
 *   if (auth instanceof Response) return auth;
 *   // …auth.id, auth.user_id are now safe to use
 */
export async function requireApiKey(
  req: Request,
): Promise<ApiKeyRow | Response> {
  const row = await validateApiKey(req);
  if (row) return row;
  return new Response(
    JSON.stringify({
      error: {
        code: "unauthorized",
        message:
          "Missing or invalid API key. Pass it in the X-API-Key header or as 'Authorization: Bearer <key>'.",
      },
    }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );
}
