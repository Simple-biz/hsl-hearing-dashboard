/**
 * Sync helpers that propagate `hearings.hearing_decision_status` changes onto
 * the linked `representative_docs.overall_status`. Used by every code path
 * that mutates a hearing's decision so the Withdrawn / Postponed / Favorable
 * tabs on the rep-docs page stay in sync — dashboard inline edits, import
 * insert, and import-compare update flows.
 *
 * Single source of truth for the decision → rep-docs-status mapping. If you
 * need to broaden the matching (e.g. add "WD" abbreviations), do it here.
 */
import { db } from "@/lib/db";

export function mapDecisionToRepDocsStatus(
  decision: string | null | undefined,
): string | null {
  if (!decision) return null;
  const d = String(decision).toLowerCase().trim();
  if (d.startsWith("withdrawal") || d === "dismissed" || d === "dismissal") {
    return "Withdrawn";
  }
  if (d === "continued") return "Postponed";
  if (
    d === "favorable" ||
    d === "fully favorable" ||
    d === "partially favorable"
  ) {
    return "Favorable";
  }
  return null;
}

/**
 * Sync the rep_docs.overall_status for one hearing.
 * No-op if the decision doesn't map to a tracked status.
 * Returns the status that was written, or null if nothing was synced.
 */
export async function syncRepDocsStatusForHearing(
  hearingId: number,
  decision: string | null | undefined,
): Promise<string | null> {
  const status = mapDecisionToRepDocsStatus(decision);
  if (!status) return null;
  await db.query(
    `UPDATE representative_docs
     SET overall_status = $1, updated_at = NOW()
     WHERE hearing_id = $2`,
    [status, hearingId],
  );
  return status;
}

/**
 * Bulk sync from current DB values. Used by the import-insert path where
 * we've just inserted N hearings and want to seed their rep_docs rows in
 * one shot. Creates the rep_docs rows if they don't already exist (matches
 * representative-docs/actions.ts:ensureRowsForHearings).
 */
export async function syncRepDocsStatusForHearingIds(
  hearingIds: number[],
): Promise<void> {
  if (hearingIds.length === 0) return;

  // Ensure rep_docs rows exist for these hearings — same cutoff as
  // ensureRowsForHearings so we don't accidentally start tracking pre-March
  // 2026 imports that the team has intentionally scoped out.
  await db.query(
    `INSERT INTO representative_docs (hearing_id)
     SELECT id FROM hearings
     WHERE id = ANY($1::int[])
       AND hearing_date IS NOT NULL
       AND hearing_date >= DATE '2026-03-01'
     ON CONFLICT (hearing_id) DO NOTHING`,
    [hearingIds],
  );

  // Map each hearing's decision to a rep-docs status in one CASE expression.
  // Rows whose decision doesn't match a tracked status keep their existing
  // overall_status (the ELSE branch).
  await db.query(
    `UPDATE representative_docs rd
     SET overall_status = CASE
       WHEN LOWER(TRIM(h.hearing_decision_status)) LIKE 'withdrawal%'
         OR LOWER(TRIM(h.hearing_decision_status)) IN ('dismissed', 'dismissal') THEN 'Withdrawn'
       WHEN LOWER(TRIM(h.hearing_decision_status)) = 'continued' THEN 'Postponed'
       WHEN LOWER(TRIM(h.hearing_decision_status)) IN ('favorable', 'fully favorable', 'partially favorable') THEN 'Favorable'
       ELSE rd.overall_status
     END,
     updated_at = NOW()
     FROM hearings h
     WHERE h.id = rd.hearing_id
       AND h.id = ANY($1::int[])
       AND h.hearing_decision_status IS NOT NULL`,
    [hearingIds],
  );
}
