-- Migration: backfill PHD status → 'Records Closed' for hearings whose
-- decision is already Favorable / Unfavorable, matching the policy the
-- runtime auto-close cascade now enforces in actions.tsx (updateHearing).
-- Date: 2026-06-03
--
-- Background:
--   A new auto-close cascade was added so that when a dashboard user
--   transitions a hearing's decision_status INTO 'Favorable' or
--   'Unfavorable', the linked post_hrg_development rows are flipped to
--   'Records Closed' automatically. That cascade only fires on FUTURE
--   transitions. This migration is the one-time backfill for the existing
--   data — hearings that are already at Favorable/Unfavorable but whose
--   linked PHD rows are still in active states (Incomplete, In Progress,
--   Pending, Extended, CL is unable to provide, etc.).
--
-- Safety:
--   * Skips PHD rows already at 'Completed' or 'Records Closed' — won't
--     overwrite manual decisions the team has already settled on.
--   * Case-insensitive comparison so capitalization drift in decision
--     or status values doesn't cause misses.
--   * The dashboard column mirror is also case-insensitive and skips rows
--     where the column was manually set to 'Completed' (preserve admin
--     curation on the dashboard side too).

BEGIN;

-- Step 1: close eligible PHD rows for hearings at Favorable/Unfavorable.
--         All record types (MR / POST_HRG / REP) are eligible — the runtime
--         cascade does the same.
UPDATE post_hrg_development p
SET
  status     = 'Records Closed',
  updated_at = NOW()
FROM hearings h
WHERE p.hearing_id = h.id
  AND LOWER(COALESCE(h.hearing_decision_status, '')) IN ('favorable', 'unfavorable')
  AND (p.status IS NULL
       OR LOWER(p.status) NOT IN ('completed', 'records closed'));

-- Step 2: sync the dashboard's "Post Hrg Dev" column for any hearing that
--         now has an MR PHD row at 'Records Closed' (whether closed by
--         Step 1 above, or already closed manually before this migration).
--         Mirrors the MR-only scoping in updatePostHrgDevField + the
--         runtime cascade. Skips dashboard cells already at Completed
--         or Records Closed to avoid overwriting team-curated values.
UPDATE hearings h
SET post_hrg_dev_status = 'Records Closed'
WHERE LOWER(COALESCE(h.hearing_decision_status, '')) IN ('favorable', 'unfavorable')
  AND EXISTS (
    SELECT 1
    FROM post_hrg_development p
    WHERE p.hearing_id = h.id
      AND p.record_type = 'MR'
      AND LOWER(p.status) = 'records closed'
  )
  AND (h.post_hrg_dev_status IS NULL
       OR LOWER(h.post_hrg_dev_status) NOT IN ('completed', 'records closed'));

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- After running: how many PHD rows still need closure (should be 0 ignoring
-- rows where the team manually set status to Completed) and how many
-- dashboard cells are still out of sync with the linked MR PHD row.
SELECT
  COUNT(*) FILTER (
    WHERE LOWER(COALESCE(h.hearing_decision_status, '')) IN ('favorable', 'unfavorable')
      AND (p.status IS NULL
           OR LOWER(p.status) NOT IN ('completed', 'records closed'))
  ) AS phd_rows_still_open_under_terminal_decision,
  COUNT(*) FILTER (
    WHERE LOWER(COALESCE(h.hearing_decision_status, '')) IN ('favorable', 'unfavorable')
      AND p.record_type = 'MR'
      AND LOWER(p.status) = 'records closed'
      AND (h.post_hrg_dev_status IS NULL
           OR LOWER(h.post_hrg_dev_status) NOT IN ('completed', 'records closed'))
  ) AS dashboard_cells_still_out_of_sync
FROM hearings h
LEFT JOIN post_hrg_development p ON p.hearing_id = h.id
WHERE LOWER(COALESCE(h.hearing_decision_status, '')) IN ('favorable', 'unfavorable');
-- Both numbers should be 0 after this migration runs.

-- ─── Counts (informational) ─────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE LOWER(COALESCE(h.hearing_decision_status, '')) = 'favorable')   AS hearings_favorable,
  COUNT(*) FILTER (WHERE LOWER(COALESCE(h.hearing_decision_status, '')) = 'unfavorable') AS hearings_unfavorable
FROM hearings h;

-- ============================================================
-- ROLLBACK (only safe if no Reopen actions / further status edits have
-- happened since this ran — restoring a specific prior status per row
-- is not possible from this migration alone):
-- ============================================================
-- BEGIN;
-- -- Naive revert sets affected PHD rows back to 'In Progress' (the same
-- -- target reopenPostHrgDevRecord uses). Does NOT restore each row's
-- -- pre-migration status (Incomplete / Extended / etc.) — that data is
-- -- in the activity log only if individual edits had been logged.
-- UPDATE post_hrg_development p
-- SET status = 'In Progress', updated_at = NOW()
-- FROM hearings h
-- WHERE p.hearing_id = h.id
--   AND LOWER(p.status) = 'records closed'
--   AND LOWER(COALESCE(h.hearing_decision_status, '')) IN ('favorable', 'unfavorable');
--
-- UPDATE hearings
-- SET post_hrg_dev_status = NULL
-- WHERE LOWER(COALESCE(hearing_decision_status, '')) IN ('favorable', 'unfavorable')
--   AND LOWER(post_hrg_dev_status) = 'records closed';
-- COMMIT;
-- ============================================================
