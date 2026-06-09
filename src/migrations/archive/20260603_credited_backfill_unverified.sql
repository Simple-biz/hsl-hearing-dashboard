-- Migration: backfill hearings.credited so existing FALSE rows become NULL
-- (i.e. "unverified"), matching the old checkbox semantic where an
-- unchecked box meant "no decision yet" rather than "verified-and-not-
-- credited". Also drops the column DEFAULT so new hearings start as
-- unverified going forward.
-- Date: 2026-06-03
--
-- Run AFTER 20260603_credited_nullable.sql, which makes the column nullable.
--
-- Context:
--   Before the 3-state UI shipped, credited was a boolean NOT NULL column.
--   Every row was true or false; users perceived false as "empty" because
--   the checkbox was unchecked. After making the column nullable, those
--   rows still read as false and now render as ✗, which is misleading.
--
--   This migration reinterprets the pre-change history: every false-valued
--   row becomes NULL ("unverified"). Going forward, users explicitly mark
--   rows as ✗ when they verify-and-decline, ✓ when they credit, and leave
--   — when they have not decided.

BEGIN;

-- 1) Wipe the existing FALSE values back to NULL.
UPDATE hearings SET credited = NULL WHERE credited = false;

-- 2) Drop the column DEFAULT so new hearings start as NULL too.
ALTER TABLE hearings ALTER COLUMN credited DROP DEFAULT;

COMMIT;

-- Verify
SELECT
  COUNT(*) FILTER (WHERE credited IS NULL)  AS unverified,
  COUNT(*) FILTER (WHERE credited = true)   AS credited,
  COUNT(*) FILTER (WHERE credited = false)  AS not_credited
FROM hearings;
-- Expected after running: not_credited = 0; unverified = old (false count);
-- credited = unchanged.

-- ============================================================
-- ROLLBACK (only if no users have started using ✗ since this ran):
-- ============================================================
-- BEGIN;
-- UPDATE hearings SET credited = false WHERE credited IS NULL;
-- ALTER TABLE hearings ALTER COLUMN credited SET DEFAULT false;
-- COMMIT;
-- ============================================================
