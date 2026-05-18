-- Backfill: hearings that were withdrawn (decision or assignment_status)
-- BEFORE the rep-docs sync ensured the row exists. Those withdrawals were
-- lost because syncRepDocsStatusForHearing only UPDATEd existing rep_docs
-- rows — so the hearing still shows as an active row in representative-docs
-- instead of in the Withdrawn modal.
--
-- 1. Create any missing rep_docs rows for withdrawn hearings (same
--    >= 2026-03-01 cutoff as ensureRowsForHearings).
-- 2. Flip their overall_status to 'Withdrawn'.
--
-- Predicate mirrors mapDecisionToRepDocsStatus() in
-- src/lib/rep-docs-decision-sync.ts, plus assignment_status as a safety net
-- (the dashboard withdrawal flow sets both).

INSERT INTO representative_docs (hearing_id)
SELECT h.id
FROM hearings h
WHERE h.hearing_date IS NOT NULL
  AND h.hearing_date >= DATE '2026-03-01'
  AND (
    LOWER(TRIM(h.hearing_decision_status)) LIKE 'withdrawal%'
    OR LOWER(TRIM(h.hearing_decision_status)) LIKE 'wd %'
    OR LOWER(TRIM(h.hearing_decision_status)) IN
       ('dismissed', 'dismissal', 'wd clmt deceased')
    OR h.assignment_status = 'withdrawal'
  )
ON CONFLICT (hearing_id) DO NOTHING;

UPDATE representative_docs rd
SET overall_status = 'Withdrawn',
    updated_at = NOW()
FROM hearings h
WHERE h.id = rd.hearing_id
  AND (
    LOWER(TRIM(h.hearing_decision_status)) LIKE 'withdrawal%'
    OR LOWER(TRIM(h.hearing_decision_status)) LIKE 'wd %'
    OR LOWER(TRIM(h.hearing_decision_status)) IN
       ('dismissed', 'dismissal', 'wd clmt deceased')
    OR h.assignment_status = 'withdrawal'
  )
  AND LOWER(COALESCE(rd.overall_status, '')) <> 'withdrawn';
