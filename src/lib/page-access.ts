// ─── Page Access — runtime resolver ───────────────────────────────────────────
//
// One source of truth for "can this user open this page?" Read by page route
// guards (server) and the nav (via the resolved map). Mirrors field-access.ts.
//
// Resolution order:
//   1. row in user_page_access  → use that can_access value
//   2. otherwise                 → role default:
//        - allowlist page  → false  (access only via an explicit grant row)
//        - normal page     → role ∈ PAGE_ACCESS[page]
//
// The override DB lives in `user_page_access` (20260518_create_user_page_access.sql).

import { db } from "@/lib/db";
import { PAGE_ACCESS, type UserRole } from "@/lib/roles";
import {
  ALLOWLIST_PAGES,
  isPageAccessKey,
  VISIBLE_PAGE_KEYS,
  type PageAccessKey,
} from "@/lib/page-access-catalog";

/** Role default for a page — no per-user override applied. */
export function resolvePageRoleDefault(
  role: UserRole,
  pageKey: string,
): boolean {
  if ((ALLOWLIST_PAGES as string[]).includes(pageKey)) return false;
  const allowed = PAGE_ACCESS[pageKey];
  return allowed ? allowed.includes(role) : false;
}

/**
 * Async — used by page route guards. Looks up the override row, falls back
 * to the role default. Pages not in the catalog are never overridable, so
 * they resolve straight to the role default.
 */
export async function canUserAccessPage(
  userId: number,
  role: UserRole,
  pageKey: string,
): Promise<boolean> {
  if (isPageAccessKey(pageKey) && userId) {
    const { rows } = await db.query(
      `SELECT can_access FROM user_page_access
        WHERE user_id = $1 AND page_key = $2
        LIMIT 1`,
      [userId, pageKey],
    );
    if (rows.length > 0) return rows[0].can_access === true;
  }
  return resolvePageRoleDefault(role, pageKey);
}

/**
 * Resolve effective access for EVERY page key in PAGE_ACCESS in one query.
 * Used by the layout to drive nav visibility without N round-trips.
 */
export async function getUserPageAccessMap(
  userId: number,
  role: UserRole,
): Promise<Record<string, boolean>> {
  const overrides = new Map<string, boolean>();
  if (userId) {
    const { rows } = await db.query(
      `SELECT page_key, can_access FROM user_page_access WHERE user_id = $1`,
      [userId],
    );
    for (const r of rows) {
      overrides.set(String(r.page_key), r.can_access === true);
    }
  }
  const out: Record<string, boolean> = {};
  for (const pageKey of Object.keys(PAGE_ACCESS)) {
    out[pageKey] =
      isPageAccessKey(pageKey) && overrides.has(pageKey)
        ? (overrides.get(pageKey) as boolean)
        : resolvePageRoleDefault(role, pageKey);
  }
  return out;
}

// ─── Admin CRUD ──────────────────────────────────────────────────────────────

export interface UserPageAccessRow {
  page_key: PageAccessKey;
  can_access: boolean;
}

/** Admin: load every page override for a user (drives the modal Pages tab). */
export async function listUserPageAccess(
  userId: number,
): Promise<UserPageAccessRow[]> {
  const { rows } = await db.query(
    `SELECT page_key, can_access FROM user_page_access
      WHERE user_id = $1
      ORDER BY page_key`,
    [userId],
  );
  return rows
    .filter((r) => isPageAccessKey(String(r.page_key)))
    .map((r) => ({
      page_key: String(r.page_key) as PageAccessKey,
      can_access: r.can_access === true,
    }));
}

/**
 * Admin: upsert one page override.
 * Pass `null` for canAccess to DELETE the row (revert to role default).
 */
export async function setUserPageAccessRow(
  userId: number,
  pageKey: PageAccessKey,
  canAccess: boolean | null,
  updatedBy: number | null,
): Promise<void> {
  if (canAccess === null) {
    await db.query(
      `DELETE FROM user_page_access WHERE user_id = $1 AND page_key = $2`,
      [userId, pageKey],
    );
    return;
  }
  await db.query(
    `INSERT INTO user_page_access (user_id, page_key, can_access, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, page_key)
     DO UPDATE SET can_access = EXCLUDED.can_access,
                   updated_at = NOW(),
                   updated_by = EXCLUDED.updated_by`,
    [userId, pageKey, canAccess, updatedBy],
  );
}

/**
 * Admin: wipe page overrides for a user (revert to role defaults).
 * Scoped to admin-visible pages only — overrides on hidden pages
 * (e.g. mr_reports / import_rfc) are intentionally left untouched.
 */
export async function resetUserPageAccessAll(userId: number): Promise<number> {
  const res = await db.query(
    `DELETE FROM user_page_access
      WHERE user_id = $1 AND page_key = ANY($2::text[])`,
    [userId, VISIBLE_PAGE_KEYS],
  );
  return res.rowCount ?? 0;
}
