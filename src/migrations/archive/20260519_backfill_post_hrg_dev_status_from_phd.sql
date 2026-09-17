-- Backfill / cleanup for the unified Post Hrg Dev <-> PHD STATUS sync.
--
-- The dashboard "Post Hrg Dev" dropdown now reads the SAME config option
-- list as the post-hrg-development STATUS column (option_type
-- 'post_hrg_workflow_status': Completed, Continued, Extended, Incomplete,
-- Records Closed). Steps, in order:
--
--  (1) Canonicalize PHD's own status data. PHD has 212 legacy rows spelled
--      "Record Closed" (singular) that don't match its own "Records Closed"
--      option. PHD is the source of truth for the sync, so it must be clean
--      first. ("Complete"/"Completed" needs no fix — PHD already uses
--      "Completed".) Unambiguous singular->plural rename only.
--
--  (2) Canonicalize legacy values in the dashboard column for rows NOT
--      driven by an MR PHD row (step 3 handles MR-linked ones). Covers the
--      same two tokens.
--
--  (3) Re-sync every MR-linked hearing from its (now-canonical) PHD row.
--      Source of truth = post_hrg_development. Raw copy — value sets match.
--      If a hearing has multiple MR PHD rows, the most recently updated wins.
--
-- Every step only touches rows that actually differ, so re-running is a
-- no-op. Free-text junk ("Pending", "nna", etc.) was never a valid option
-- under either list and is intentionally left untouched.

-- (1) PHD source-of-truth normalization.
UPDATE post_hrg_development
SET status = 'Records Closed'
WHERE LOWER(status) = 'record closed';

-- (2) Dashboard legacy-value normalization (all rows).
UPDATE hearings
SET post_hrg_dev_status = 'Completed'
WHERE LOWER(post_hrg_dev_status) = 'complete';

UPDATE hearings
SET post_hrg_dev_status = 'Records Closed'
WHERE LOWER(post_hrg_dev_status) = 'record closed';

-- (3) MR sync from post_hrg_development (source of truth, now canonical).
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
