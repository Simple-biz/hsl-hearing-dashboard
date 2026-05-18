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
  if (
    d.startsWith("withdrawal") ||
    d.startsWith("wd ") ||
    d === "dismissed" ||
    d === "dismissal" ||
    d === "wd clmt deceased"
  ) {
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

// Statuses that come from the hearing's decision (vs. the workflow checkboxes).
// When the decision changes away from a value that maps here, the row should
// fall back to the workflow-derived status — otherwise it'd stay stuck on the
// stale decision-derived value (e.g. still in the Withdrawn modal).
const DECISION_DERIVED_STATUSES = new Set([
  "Withdrawn",
  "Postponed",
  "Favorable",
]);

// Mirror representative-docs/actions.ts:WORKFLOW_FIELDS so the helper can
// recompute the workflow-derived status without importing from that file
// (which is a "use server" module).
const WORKFLOW_FIELDS = [
  "uploaded_noh",
  "sent_repdocs_to_cl",
  "repdocs_signed",
  "contact_ltr",
  "repdocs_split",
  "repdocs_uploaded_chronicle",
  "oho_confirmation",
] as const;

/**
 * Sync rep_docs.overall_status for one hearing.
 *
 * Three branches:
 *   1. New decision maps to Withdrawn/Postponed/Favorable → write it.
 *   2. New decision is unmapped (or NULL) AND the current status was decision-
 *      derived → revert to the workflow-derived status (Not Started /
 *      Incomplete / Complete) so the row leaves the Withdrawn / etc. modals.
 *   3. New decision is unmapped AND the current status is already workflow-
 *      derived → no-op.
 *
 * Returns the status that was written, or null if nothing was changed.
 */
export async function syncRepDocsStatusForHearing(
  hearingId: number,
  decision: string | null | undefined,
): Promise<string | null> {
  const status = mapDecisionToRepDocsStatus(decision);

  if (status) {
    // Ensure the rep_docs row exists before writing. Rows are created lazily
    // (only when the rep-docs page is opened), so a decision set from the
    // dashboard on a hearing whose row doesn't exist yet would otherwise be
    // lost — the row later gets created fresh with the default status,
    // leaving a withdrawn hearing showing as active. Same >= 2026-03-01
    // cutoff as ensureRowsForHearings so we don't start tracking
    // intentionally-scoped-out pre-March hearings.
    await db.query(
      `INSERT INTO representative_docs (hearing_id)
       SELECT id FROM hearings
       WHERE id = $1
         AND hearing_date IS NOT NULL
         AND hearing_date >= DATE '2026-03-01'
       ON CONFLICT (hearing_id) DO NOTHING`,
      [hearingId],
    );
    await db.query(
      `UPDATE representative_docs
       SET overall_status = $1, updated_at = NOW()
       WHERE hearing_id = $2`,
      [status, hearingId],
    );
    return status;
  }

  // Unmapped / cleared decision. Only act if we'd be undoing a prior
  // decision-derived status — otherwise leave the workflow-derived value
  // alone.
  const { rows } = await db.query(
    `SELECT overall_status, ${WORKFLOW_FIELDS.join(", ")}
     FROM representative_docs WHERE hearing_id = $1`,
    [hearingId],
  );
  if (!rows[0]) return null;
  const current = (rows[0].overall_status as string | null) ?? "";
  if (!DECISION_DERIVED_STATUSES.has(current)) return null;

  const flags = WORKFLOW_FIELDS.map((f) => Boolean(rows[0][f]));
  const truthy = flags.filter(Boolean).length;
  const reverted =
    truthy === 0
      ? "Not Started"
      : truthy === flags.length
        ? "Complete"
        : "Incomplete";

  await db.query(
    `UPDATE representative_docs
     SET overall_status = $1, updated_at = NOW()
     WHERE hearing_id = $2`,
    [reverted, hearingId],
  );
  return reverted;
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
         OR LOWER(TRIM(h.hearing_decision_status)) LIKE 'wd %'
         OR LOWER(TRIM(h.hearing_decision_status)) IN
            ('dismissed', 'dismissal', 'wd clmt deceased') THEN 'Withdrawn'
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
