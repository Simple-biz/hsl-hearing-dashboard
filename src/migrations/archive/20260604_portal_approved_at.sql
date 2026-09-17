-- Adds a nullable `approved_by_tl_at` timestamp to mr_patient_portal so the
-- patient-portal table can show WHEN the entry was approved by TL, mirroring
-- the dashboard's 5-day-notice / checkbox-with-stamp pattern.
--
-- Set to NOW() on the SQL UPDATE when approved_by_tl flips true; set to NULL
-- when it flips back to false. Historical rows that were already approved
-- stay NULL — the UI shows the checkbox without a stamp until the user
-- re-toggles, which is preferable to backfilling a fake timestamp.

ALTER TABLE mr_patient_portal
  ADD COLUMN IF NOT EXISTS approved_by_tl_at TIMESTAMPTZ NULL;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'mr_patient_portal'
--    AND column_name = 'approved_by_tl_at';
