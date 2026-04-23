-- Resolve the last remaining (hearing_id, record_type) collision so the
-- partial unique index can be created.
--
-- Hearing 2353 had 4 rows (1 MR, 1 POST_HRG, 2 REP). Both REP rows are
-- Charlotte / Completed; merge their content into id=775 and drop id=774.

UPDATE post_hrg_development
SET
  type_of_docs_needed = 'Correction Of Earnings; Third Party Statement',
  details = 'Correction Of Earnings: Step mom is going to pull the uber eats and door dash stubs and ALJ wants the new 2/2026 SSA self employment form completed with this info. | Third Party Statement: ALJ wants a statement from Client about bitcoin for $10 on it as well. Need to submit statement that his work at UPS was as a loader not a driver or driver helper.',
  updated_at = NOW()
WHERE id = 775;

DELETE FROM post_hrg_development WHERE id = 774;

-- Now safe to enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phd_hearing_type
  ON post_hrg_development (hearing_id, record_type)
  WHERE hearing_id IS NOT NULL;
