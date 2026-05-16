"use server";

// ─── Generic per-hearing activity-log reader ────────────────────────────────
// Powers every "history" modal (Rep History, Decision History, Post-HRG Note
// History, Full Audit Trail, ...). Each caller passes an optional action
// allow-list and/or description ILIKE pattern; the rest of the query shape is
// shared.
//
// Hybrid match: prefers the accurate `hearing_id` key (populated for entries
// logged after migration 20260516_add_hearing_id_to_activity_log.sql) and
// falls back to claimant-substring for legacy NULL rows so historical
// coverage doesn't regress. As old entries age out, the fallback branch
// becomes redundant.

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export interface HearingHistoryEntry {
  id: number;
  action: string;
  description: string;
  userName: string | null;
  createdAt: string;
}

export interface HearingHistoryOptions {
  /** Restrict to these action types. Omit for the full audit trail. */
  actions?: string[];
  /** Optional ILIKE pattern on the description, e.g. "Decision:%". */
  descriptionLike?: string;
  /** Row cap. Defaults to 200. */
  limit?: number;
}

export async function fetchHearingHistory(
  hearingId: number,
  options: HearingHistoryOptions = {},
): Promise<HearingHistoryEntry[]> {
  await requireAuth();
  if (!hearingId) return [];

  const { rows: hRows } = await db.query(
    "SELECT claimant FROM hearings WHERE id = $1",
    [hearingId],
  );
  const claimant = (hRows[0]?.claimant as string | null) ?? "";

  // $1 = hearingId, $2 = claimant (for the legacy fallback branch).
  const conditions: string[] = [
    `(a.hearing_id = $1
      OR (a.hearing_id IS NULL AND $2 <> '' AND a.description ILIKE '%' || $2 || '%'))`,
  ];
  const values: unknown[] = [hearingId, claimant];
  let idx = 3;

  if (options.actions && options.actions.length > 0) {
    conditions.push(`a.action = ANY($${idx})`);
    values.push(options.actions);
    idx++;
  }

  if (options.descriptionLike) {
    conditions.push(`a.description ILIKE $${idx}`);
    values.push(options.descriptionLike);
    idx++;
  }

  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

  const { rows } = await db.query(
    `SELECT a.id, a.action, a.description,
            u.full_name AS user_name,
            a.created_at::text AS created_at
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT ${limit}`,
    values,
  );

  return rows.map((r) => ({
    id: r.id as number,
    action: r.action as string,
    description: r.description as string,
    userName: (r.user_name as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
