-- One-time backfill to align existing data with the new bidirectional
-- Post Hrg Dev <-> PHD STATUS sync. Source of truth = post_hrg_development.
--
-- Copies the linked MR PHD row's status into hearings.post_hrg_dev_status.
-- If a hearing has more than one MR PHD row, the most recently updated one
-- wins (DISTINCT ON ... ORDER BY updated_at DESC). Only rows that actually
-- differ are touched (IS DISTINCT FROM), so re-running is a no-op.
-- Non-MR PHD rows are intentionally ignored (sync is MR-scoped).

UPDATE hearings h
SET post_hrg_dev_status = src.status
FROM (
  SELECT DISTINCT ON (hearing_id)
         hearing_id,
         status
  FROM post_hrg_development
  WHERE record_type = 'MR'
    AND hearing_id IS NOT NULL
  ORDER BY hearing_id, updated_at DESC NULLS LAST, id DESC
) src
WHERE src.hearing_id = h.id
  AND h.post_hrg_dev_status IS DISTINCT FROM src.status;
