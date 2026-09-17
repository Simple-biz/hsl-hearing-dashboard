-- Migration: normalize post_hrg_development.status capitalization drift.
-- Date: 2026-06-03
--
-- Background:
--   `status` is a free-text VARCHAR(100), so the same logical value can be
--   stored with different capitalization at different times. The "By Status"
--   chart in the PHD Reports modal groups by literal string, so 'In progress'
--   and 'In Progress' showed up as two separate bars.
--
--   This migration:
--     1) Merges 'In progress' (lowercase p) → 'In Progress' (canonical).
--     2) Strips leading/trailing whitespace on all status values.
--
--   Other suspicious values surfaced in the chart ('ie', 'nna') are NOT
--   auto-merged because they're ambiguous (could be typos, truncated, or
--   intentional). Investigate those manually using the SELECT at the bottom.

BEGIN;

-- 1) Merge the casing variant. Single canonical form is "In Progress".
UPDATE post_hrg_development
SET status = 'In Progress'
WHERE status = 'In progress';

-- 2) Strip leading/trailing whitespace from any status. Safe no-op for
--    values that have no extra whitespace.
UPDATE post_hrg_development
SET status = TRIM(status)
WHERE status IS NOT NULL
  AND status <> TRIM(status);

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- After running, this should show 'In Progress' as one row with the combined
-- count (the original 'In Progress' + the rows that were 'In progress').
SELECT status, COUNT(*) AS rows
FROM post_hrg_development
GROUP BY status
ORDER BY COUNT(*) DESC;

-- ─── Investigate ambiguous values ───────────────────────────────────────────
-- These are NOT auto-fixed by this migration. Run this AFTER the migration
-- to see the specific rows whose status looks suspicious so you can decide
-- what each should be.
SELECT id, claimant, hearing_id, status, record_type,
       created_at::date AS created_on,
       updated_at::date AS last_edit
FROM post_hrg_development
WHERE LENGTH(TRIM(status)) <= 3            -- short = likely truncated / typo
   OR status ~ '^[a-z]+$'                  -- entirely lowercase = likely typo
ORDER BY status, id;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- UPDATE post_hrg_development SET status = 'In progress'
-- WHERE status = 'In Progress' AND <some-condition-to-target-rows>;
-- COMMIT;
-- ⚠ The whitespace-trim is not reversible row-by-row without knowing the
-- original padding. The casing merge is reversible only if you can isolate
-- which rows came from 'In progress' originally — typically not worth it.
-- ============================================================
