-- Migration: backfill hearings.post_hrg_requirements from PHD details for
-- all PHD record types (MR, POST_HRG, REP) — matches the expanded mirror
-- policy where Details Content is the source of truth for Requirements
-- regardless of record_type.
-- Date: 2026-06-03
--
-- Context:
--   Until now, only MR PHD rows mirrored their `details` column into the
--   linked hearing's `post_hrg_requirements`. The post-HRG team has confirmed
--   the same behavior should apply to POST_HRG and REP rows: Details Content
--   should reflect in the Post HRG Review modal's Requirements section.
--
--   Going forward, every save of `details` via updatePostHrgDevField mirrors
--   to the linked hearing automatically. This migration is a one-time fill so
--   existing rows that were never edited under the new rule show up correctly
--   without requiring someone to re-save them.
--
-- Safety:
--   This is SCOPED to rows where the hearing currently has NO Requirements
--   set (h.post_hrg_requirements IS NULL). It will NOT overwrite manually
--   curated Requirements text. If an admin had typed something into
--   Requirements for a POST_HRG or REP row's hearing, that value is preserved
--   here — going forward they'd need to keep it in sync via Details.

BEGIN;

UPDATE hearings h
SET post_hrg_requirements = p.details
FROM post_hrg_development p
WHERE p.hearing_id = h.id
  AND p.details IS NOT NULL
  AND TRIM(p.details) <> ''
  AND h.post_hrg_requirements IS NULL;

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- After running: how many rows by record_type now have their hearing's
-- post_hrg_requirements aligned with the PHD details. Useful sanity check
-- vs. counts of PHD rows that have non-empty details.
SELECT
  p.record_type,
  COUNT(*) FILTER (WHERE p.details IS NOT NULL AND TRIM(p.details) <> '') AS phd_rows_with_details,
  COUNT(*) FILTER (
    WHERE p.details IS NOT NULL AND TRIM(p.details) <> ''
      AND h.post_hrg_requirements = p.details
  ) AS aligned,
  COUNT(*) FILTER (
    WHERE p.details IS NOT NULL AND TRIM(p.details) <> ''
      AND (h.post_hrg_requirements IS NULL OR h.post_hrg_requirements <> p.details)
  ) AS still_misaligned
FROM post_hrg_development p
LEFT JOIN hearings h ON h.id = p.hearing_id
GROUP BY p.record_type
ORDER BY p.record_type;

-- "still_misaligned" should be small — only rows where the hearing already
-- had a different post_hrg_requirements value typed in manually before this
-- migration ran (the safety filter intentionally left those alone).

-- ============================================================
-- ROLLBACK (only safe if no one has saved Details against the new policy yet):
-- ============================================================
-- BEGIN;
-- UPDATE hearings h
-- SET post_hrg_requirements = NULL
-- FROM post_hrg_development p
-- WHERE p.hearing_id = h.id
--   AND p.record_type IN ('POST_HRG', 'REP')
--   AND h.post_hrg_requirements = p.details;
-- COMMIT;
-- ============================================================
