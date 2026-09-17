-- One-shot backfill: propagate every hearing's current
-- `hearing_decision_status` onto the linked
-- `representative_docs.overall_status`. Mirrors the runtime sync logic in
-- src/lib/rep-docs-decision-sync.ts so anything imported before that helper
-- shipped (May 2026) is caught up.
--
-- Idempotent — re-running this won't change anything that already matches the
-- mapped status. Rows whose decision doesn't map to a tracked status (or is
-- NULL) keep their existing overall_status — workflow-derived statuses stay
-- intact.

-- 1) Make sure a representative_docs row exists for every hearing we'd touch.
--    Matches representative-docs/actions.ts:ensureRowsForHearings.
INSERT INTO representative_docs (hearing_id)
SELECT h.id
FROM hearings h
WHERE h.hearing_date IS NOT NULL
  AND h.hearing_date >= DATE '2026-03-01'
  AND h.hearing_decision_status IS NOT NULL
ON CONFLICT (hearing_id) DO NOTHING;

-- 2) Backfill overall_status from the hearing's decision.
UPDATE representative_docs rd
SET overall_status = CASE
  WHEN LOWER(TRIM(h.hearing_decision_status)) LIKE 'withdrawal%'
    OR LOWER(TRIM(h.hearing_decision_status)) IN ('dismissed', 'dismissal') THEN 'Withdrawn'
  WHEN LOWER(TRIM(h.hearing_decision_status)) = 'continued' THEN 'Postponed'
  WHEN LOWER(TRIM(h.hearing_decision_status)) IN ('favorable', 'fully favorable', 'partially favorable') THEN 'Favorable'
  ELSE rd.overall_status  -- leave anything else alone
END,
updated_at = NOW()
FROM hearings h
WHERE h.id = rd.hearing_id
  AND h.hearing_decision_status IS NOT NULL
  -- Only touch rows where the mapping would actually change something —
  -- avoids bumping updated_at on every row in the table for no reason.
  AND (
    (LOWER(TRIM(h.hearing_decision_status)) LIKE 'withdrawal%'
       OR LOWER(TRIM(h.hearing_decision_status)) IN ('dismissed', 'dismissal'))
    AND COALESCE(rd.overall_status, '') <> 'Withdrawn'
    OR
    LOWER(TRIM(h.hearing_decision_status)) = 'continued'
    AND COALESCE(rd.overall_status, '') <> 'Postponed'
    OR
    LOWER(TRIM(h.hearing_decision_status)) IN ('favorable', 'fully favorable', 'partially favorable')
    AND COALESCE(rd.overall_status, '') <> 'Favorable'
  );
