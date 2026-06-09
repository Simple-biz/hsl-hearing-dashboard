-- Revert the earlier merge of hearing 2353's two REP rows (id=774 was deleted,
-- id=775 absorbed both type_of_docs_needed values and details).
--
-- After this migration, hearing 2353 will have 4 rows again:
--   1. MR                — Medical Records
--   2. POST_HRG          — Non-med/Other
--   3. REP (existing 775) — Third Party Statement  (bitcoin / UPS loader)
--   4. REP (new row)      — Correction Of Earnings (Uber Eats / DoorDash stubs)
--
-- Safe to run before the unique-index is dropped only if we also drop the
-- unique index in the SAME deploy (or run the index-swap migration first).
-- Recommended run order:  20260421_relax_phd_unique_index.sql → this file.

-- 1) Restore id=775 to its original single-type content.
UPDATE post_hrg_development
SET
  type_of_docs_needed = 'Third Party Statement',
  details =
    'ALJ wants a statement from Client about bitcoin for $10 on it as well. '
    || 'Need to submit statement that his work at UPS was as a loader not a '
    || 'driver or driver helper.',
  updated_at = NOW()
WHERE id = 775;

-- 2) Re-insert the deleted "Correction Of Earnings" REP row by copying the
-- shared fields from id=775 and overriding the distinguishing ones.
INSERT INTO post_hrg_development (
  hearing_id, claimant, hearing_date, assigned_rep,
  post_hearing_status, status, record_type,
  type_of_docs_needed, details, person_responsible,
  created_at, updated_at
)
SELECT
  hearing_id,
  claimant,
  hearing_date,
  assigned_rep,
  post_hearing_status,
  status,
  'REP'::post_hrg_record_type,
  'Correction Of Earnings',
  'Step mom is going to pull the uber eats and door dash stubs and ALJ wants '
    || 'the new 2/2026 SSA self employment form completed with this info.',
  person_responsible,
  NOW(),
  NOW()
FROM post_hrg_development
WHERE id = 775;
