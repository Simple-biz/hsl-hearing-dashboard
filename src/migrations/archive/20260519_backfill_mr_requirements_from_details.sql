-- Backfill: MR Post-HRG-Development rows mirror their Details Content into
-- the linked hearing's `post_hrg_requirements` (see updatePostHrgDevField).
-- The live mirror only fires on a Details edit, so rows imported / created
-- before the feature have `details` set but an empty hearing
-- `post_hrg_requirements` — which makes the Post HRG Review modal flash the
-- value then blank it (the 8s poll reads the empty hearing column).
--
-- This copies `details` → `post_hrg_requirements` for MR rows, but ONLY
-- where the hearing column is currently empty — so no existing requirements
-- text is ever overwritten. Going forward the live mirror keeps them synced.

UPDATE hearings h
SET post_hrg_requirements = p.details
FROM post_hrg_development p
WHERE p.hearing_id = h.id
  AND p.record_type = 'MR'
  AND COALESCE(TRIM(p.details), '') <> ''
  AND COALESCE(TRIM(h.post_hrg_requirements), '') = '';
