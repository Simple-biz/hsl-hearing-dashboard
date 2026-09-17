-- Migration: make mr_patient_portal.hearing_id nullable
-- Date: 2026-03-21
-- Author: Jvincec
-- Context:
--   hearing_id was part of the old PHP structure where mr_patient_portal was
--   directly linked to the hearings table via a foreign key. After the PHP
--   migration to Next.js, the table was denormalized -- hearing_date and
--   client_name replaced the foreign key relationship. The foreign key
--   constraint (mr_patient_portal_ibfk_1) was already removed during migration
--   but the NOT NULL constraint on hearing_id was left behind, causing a 500
--   error when adding new portal entries from the Next.js form.
--
--   Full investigation confirmed:
--   - No FK constraint exists between mr_patient_portal.hearing_id and hearings
--   - Zero references to mr_patient_portal.hearing_id in the entire Next.js codebase
--   - All 2577 existing rows retain their hearing_id values (no data loss)
--   - Reversible: see rollback below

ALTER TABLE mr_patient_portal ALTER COLUMN hearing_id DROP NOT NULL;

-- Verify
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'mr_patient_portal'
AND column_name = 'hearing_id';
-- Expected: is_nullable = YES


-- ============================================================
-- ROLLBACK (only safe if no null rows have been inserted yet):
-- ============================================================
-- UPDATE mr_patient_portal SET hearing_id = 0 WHERE hearing_id IS NULL;
-- ALTER TABLE mr_patient_portal ALTER COLUMN hearing_id SET NOT NULL;
-- ============================================================
