-- Backfill record_type for existing rows so the partial unique index
-- (hearing_id, record_type) can be created.
--
-- Heuristic: rows whose type_of_docs_needed mentions "medical" are MR.
-- Everything else stays POST_HRG (the column default).
-- Residual (hearing_id, record_type) collisions must be reviewed and
-- re-categorized manually before the unique index is created.

UPDATE post_hrg_development
SET record_type = 'MR'
WHERE type_of_docs_needed ILIKE '%medical%'
  AND record_type = 'POST_HRG';
