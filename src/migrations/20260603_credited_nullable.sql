-- Migration: make hearings.credited nullable to support a third
-- "unverified" state in the Medical Records Credited column.
-- Date: 2026-06-03
--
-- Context:
--   The medical-records team needs to mark a hearing as "not yet verified
--   for credit eligibility", which is semantically distinct from "verified
--   and not credited". Both used to collapse into the unchecked checkbox.
--   Making the column nullable introduces:
--     credited = NULL  → unverified (no decision yet)
--     credited = true  → credited
--     credited = false → verified-and-not-credited
--
-- The UI cycles NULL → true → false → NULL on click.
--
-- Existing rows retain their boolean values (no backfill). The application
-- treats existing FALSE rows as "verified-and-not-credited", which matches
-- their prior meaning — they were explicitly NOT credited.

ALTER TABLE hearings ALTER COLUMN credited DROP NOT NULL;

-- Optional follow-up: if you want NEW hearings to default to "unverified"
-- instead of FALSE, also run:
--   ALTER TABLE hearings ALTER COLUMN credited DROP DEFAULT;
-- (Leaving the default alone keeps existing INSERT paths working unchanged.)

-- Verify
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'hearings' AND column_name = 'credited';
-- Expected: is_nullable = YES

-- ============================================================
-- ROLLBACK (only safe if no NULL rows have been inserted yet):
-- ============================================================
-- UPDATE hearings SET credited = false WHERE credited IS NULL;
-- ALTER TABLE hearings ALTER COLUMN credited SET NOT NULL;
-- ============================================================
