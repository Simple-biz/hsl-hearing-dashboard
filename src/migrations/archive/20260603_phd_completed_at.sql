-- Migration: add a dedicated completed_at column to post_hrg_development
-- so the "Completed Records" modal can show when a row was *actually* tagged
-- as Completed, instead of using updated_at (which the trg_phd_updated_at
-- trigger bumps on every edit — making the displayed completion date drift
-- forward each time someone touches the row).
-- Date: 2026-06-03
--
-- Behavior after this runs:
--   completed_at IS NULL              → row has never been completed
--   completed_at = <timestamp>        → first moment status became 'Completed'
--   row currently NOT Completed but   → completed_at was cleared when status
--     completed_at IS NULL              moved away from Completed (intended)
--
-- A BEFORE UPDATE trigger keeps completed_at in sync with future status
-- transitions. Existing Completed rows are backfilled by reading the
-- activity_log for the first "Status: → 'Completed'" entry per row, falling
-- back to updated_at when no log entry exists.

BEGIN;

-- 1) Add the column (nullable, no default)
ALTER TABLE post_hrg_development
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2) Backfill existing Completed rows.
--    Pass A: match via activity_log's hearing_id (most accurate)
UPDATE post_hrg_development p
SET completed_at = sub.first_completed_at
FROM (
  SELECT a.hearing_id, MIN(a.created_at) AS first_completed_at
  FROM activity_log a
  WHERE a.action = 'post_hrg_dev_field_updated'
    AND a.description ILIKE '%Status:%'
    AND a.description ILIKE '%Completed%'
    AND a.hearing_id IS NOT NULL
  GROUP BY a.hearing_id
) sub
WHERE LOWER(p.status) = 'completed'
  AND p.completed_at IS NULL
  AND p.hearing_id = sub.hearing_id;

--    Pass B: claimant-name match for rows without a hearing_id link
UPDATE post_hrg_development p
SET completed_at = (
  SELECT MIN(a.created_at)
  FROM activity_log a
  WHERE a.action = 'post_hrg_dev_field_updated'
    AND a.description ILIKE '%Status:%'
    AND a.description ILIKE '%Completed%'
    AND a.description ILIKE '%' || p.claimant || '%'
)
WHERE LOWER(p.status) = 'completed'
  AND p.completed_at IS NULL
  AND p.hearing_id IS NULL;

--    Pass C: anything still NULL — split by "has this row ever been edited?"
--
--    C1: Row hasn't been touched since creation. This is the classic
--        "imported as Completed" case — created_at and updated_at are still
--        equal because trg_phd_updated_at only fires on UPDATE, not INSERT.
--        created_at is the import moment, which IS the real completion
--        moment for these rows. Use it.
UPDATE post_hrg_development
SET completed_at = created_at
WHERE LOWER(status) = 'completed'
  AND completed_at IS NULL
  AND updated_at - created_at < INTERVAL '1 second';

--    C2: Row HAS been edited but no Status→Completed log entry exists. We
--        can't tell when it actually became Completed from the data alone
--        (status may have transitioned via the multi-field update path,
--        which logs a generic "Updated post-hrg record" without the new
--        value, or via an import that doesn't log per-row). Fall back to
--        updated_at. No worse than what the modal already shows today.
UPDATE post_hrg_development
SET completed_at = updated_at
WHERE LOWER(status) = 'completed'
  AND completed_at IS NULL;

-- 3) Trigger: keep completed_at in sync with future status changes.
--    Stamp on transition to Completed; clear on transition away from Completed.
CREATE OR REPLACE FUNCTION sync_phd_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF LOWER(COALESCE(NEW.status, '')) = 'completed' THEN
      NEW.completed_at := NOW();
    ELSIF LOWER(COALESCE(OLD.status, '')) = 'completed' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phd_completed_at ON post_hrg_development;

CREATE TRIGGER trg_phd_completed_at
  BEFORE UPDATE OF status ON post_hrg_development
  FOR EACH ROW
  EXECUTE FUNCTION sync_phd_completed_at();

COMMIT;

-- Verify
SELECT
  COUNT(*) FILTER (WHERE LOWER(status) = 'completed')                          AS completed_rows,
  COUNT(*) FILTER (WHERE LOWER(status) = 'completed' AND completed_at IS NULL) AS missing_completed_at,
  COUNT(*) FILTER (WHERE completed_at IS NOT NULL)                             AS has_completed_at
FROM post_hrg_development;
-- Expected: missing_completed_at = 0; has_completed_at = completed_rows.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_phd_completed_at ON post_hrg_development;
-- DROP FUNCTION IF EXISTS sync_phd_completed_at();
-- ALTER TABLE post_hrg_development DROP COLUMN IF EXISTS completed_at;
-- COMMIT;
-- ============================================================
