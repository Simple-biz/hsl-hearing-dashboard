// ─── Field Access — runtime resolver ──────────────────────────────────────────
//
// One source of truth for "can this user edit this field on this page?"
// Read by both the UI (for cell rendering) and the server (for mutation gating).
//
// Resolution order:
//   1. role === 'rep'              → role default (override layer bypassed)
//   2. row in user_field_access    → use that can_edit value
//   3. otherwise                    → role default
//
// Role defaults live in src/lib/roles.ts (EDITABLE_FIELDS, etc.) and are
// looked up via the per-page resolver below. The override DB lives in the
// `user_field_access` table created in 20260427_create_user_field_access.sql.

import { db } from "@/lib/db";
import {
  canEditField,
  MR_PIVOT_EDITABLE,
  PAGE_ACCESS,
  type UserRole,
} from "@/lib/roles";
import type { FieldAccessPageKey } from "@/lib/field-access-catalog";

// Per-page role-default resolvers. Add a branch when wiring a new page.
export function resolveRoleDefault(
  role: UserRole,
  pageKey: FieldAccessPageKey,
  fieldKey: string,
): boolean {
  switch (pageKey) {
    case "dashboard":
      return canEditField(role, fieldKey);
    case "medical_records":
      // MR pivot has explicit per-field whitelists in MR_PIVOT_EDITABLE.
      // Anything not in the map = not editable on the pivot.
      return (MR_PIVOT_EDITABLE[fieldKey] ?? []).includes(role);
    case "post_hrg_development":
      // Post HRG Dev: page-level access only, no per-field gating today.
      // If the role can access the page, it can edit any field on it.
      return PAGE_ACCESS.post_hrg_development.includes(role);
    case "representative_docs":
      // Same flat model as PHD.
      return PAGE_ACCESS.representative_docs.includes(role);
    default:
      return false;
  }
}

/**
 * Async — used by mutating server actions. Looks up the override row, falls
 * back to role default. REP role bypasses overrides entirely.
 */
export async function canUserEditField(
  userId: number,
  role: UserRole,
  pageKey: FieldAccessPageKey,
  fieldKey: string,
): Promise<boolean> {
  if (role === "rep") return resolveRoleDefault(role, pageKey, fieldKey);
  const { rows } = await db.query(
    `SELECT can_edit FROM user_field_access
      WHERE user_id = $1 AND page_key = $2 AND field_key = $3
      LIMIT 1`,
    [userId, pageKey, fieldKey],
  );
  if (rows.length > 0) return rows[0].can_edit === true;
  return resolveRoleDefault(role, pageKey, fieldKey);
}

/**
 * One-line gate for use at the top of a server action. Resolves the
 * current session, runs canUserEditField, throws if denied. Throwing is
 * the existing convention for "Update failed" surfaces in the client.
 */
export async function requireFieldAccess(
  pageKey: FieldAccessPageKey,
  fieldKey: string,
): Promise<void> {
  const { requireAuth } = await import("@/lib/session");
  const session = await requireAuth();
  const allowed = await canUserEditField(
    Number(session.user.id),
    session.user.role as UserRole,
    pageKey,
    fieldKey,
  );
  if (!allowed) {
    throw new Error(
      `You do not have permission to edit "${fieldKey}" on ${pageKey}.`,
    );
  }
}

/**
 * Bulk variant — fetch ALL overrides for a user on a page in one query.
 * Used by the page server-component to assemble the UI permissions object
 * without N round-trips. Returns a Map of field_key → can_edit.
 */
export async function getUserFieldOverrides(
  userId: number,
  pageKey: FieldAccessPageKey,
): Promise<Map<string, boolean>> {
  if (!userId) return new Map();
  const { rows } = await db.query(
    `SELECT field_key, can_edit
       FROM user_field_access
      WHERE user_id = $1 AND page_key = $2`,
    [userId, pageKey],
  );
  const out = new Map<string, boolean>();
  for (const r of rows) {
    out.set(String(r.field_key), r.can_edit === true);
  }
  return out;
}

/**
 * Synchronous resolver — for client/server-component code that already has
 * the override map in memory. Same fallback logic as canUserEditField.
 */
export function resolveFieldAccess(
  role: UserRole,
  pageKey: FieldAccessPageKey,
  fieldKey: string,
  overrides: Map<string, boolean> | null,
): boolean {
  if (role === "rep") return resolveRoleDefault(role, pageKey, fieldKey);
  if (overrides && overrides.has(fieldKey)) {
    return overrides.get(fieldKey) === true;
  }
  return resolveRoleDefault(role, pageKey, fieldKey);
}

// ─── Admin CRUD ──────────────────────────────────────────────────────────────

export interface UserFieldAccessRow {
  field_key: string;
  can_edit: boolean;
}

/** Admin: load every override for a user on a page (for the modal). */
export async function listUserFieldAccess(
  userId: number,
  pageKey: FieldAccessPageKey,
): Promise<UserFieldAccessRow[]> {
  const { rows } = await db.query(
    `SELECT field_key, can_edit
       FROM user_field_access
      WHERE user_id = $1 AND page_key = $2
      ORDER BY field_key`,
    [userId, pageKey],
  );
  return rows.map((r) => ({
    field_key: String(r.field_key),
    can_edit: r.can_edit === true,
  }));
}

/**
 * Admin: upsert one override row (UI checkbox toggle).
 * Pass `null` for can_edit to DELETE the row (revert to role default).
 */
export async function setUserFieldAccess(
  userId: number,
  pageKey: FieldAccessPageKey,
  fieldKey: string,
  canEdit: boolean | null,
  updatedBy: number | null,
): Promise<void> {
  if (canEdit === null) {
    await db.query(
      `DELETE FROM user_field_access
        WHERE user_id = $1 AND page_key = $2 AND field_key = $3`,
      [userId, pageKey, fieldKey],
    );
    return;
  }
  await db.query(
    `INSERT INTO user_field_access (user_id, page_key, field_key, can_edit, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, page_key, field_key)
     DO UPDATE SET can_edit = EXCLUDED.can_edit,
                   updated_at = NOW(),
                   updated_by = EXCLUDED.updated_by`,
    [userId, pageKey, fieldKey, canEdit, updatedBy],
  );
}

/**
 * Admin: wipe every override for a user on a page (revert to role defaults).
 * Used by the modal's "Apply Role Defaults" button.
 */
export async function resetUserFieldAccessForPage(
  userId: number,
  pageKey: FieldAccessPageKey,
): Promise<number> {
  const res = await db.query(
    `DELETE FROM user_field_access
      WHERE user_id = $1 AND page_key = $2`,
    [userId, pageKey],
  );
  return res.rowCount ?? 0;
}
