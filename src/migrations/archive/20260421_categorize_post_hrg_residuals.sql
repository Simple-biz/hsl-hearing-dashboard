-- Categorize residual rows by type_of_docs_needed keyword, then rotate any
-- remaining (hearing_id, record_type) collisions into a free slot so the
-- partial unique index can be created.

-- ── 1. Keyword rules (Medical Records → MR was applied in the prior migration) ──

-- CE (Consultative Examination) → MR. Exclude "CE Proffer Letter".
UPDATE post_hrg_development
SET record_type = 'MR'
WHERE type_of_docs_needed ILIKE '%CE%'
  AND type_of_docs_needed NOT ILIKE '%proffer%'
  AND record_type = 'POST_HRG';

-- Rep-side claimant evidence → REP
UPDATE post_hrg_development
SET record_type = 'REP'
WHERE (
       type_of_docs_needed ILIKE '%third party%'
    OR type_of_docs_needed ILIKE '%closing statement%'
    OR type_of_docs_needed ILIKE '%tax return%'
    OR type_of_docs_needed ILIKE '%pay stub%'
    OR type_of_docs_needed ILIKE '%earning%'
  )
  AND record_type = 'POST_HRG';

-- Letter / Brief / Memo and everything unmatched stays POST_HRG (the default).

-- ── 2. Tiebreaker: rotate collided rows to a free slot ──
-- For any (hearing_id, record_type) collision, keep the oldest row in place
-- and move the newer row(s) to whichever record_type is unused for that hearing.

WITH ranked AS (
  SELECT
    id,
    hearing_id,
    record_type,
    ROW_NUMBER() OVER (
      PARTITION BY hearing_id, record_type
      ORDER BY created_at, id
    ) AS rn
  FROM post_hrg_development
  WHERE hearing_id IS NOT NULL
),
collisions AS (
  SELECT id, hearing_id
  FROM ranked
  WHERE rn > 1
),
free_slots AS (
  SELECT
    c.id,
    c.hearing_id,
    (
      SELECT rt
      FROM unnest(ARRAY['MR', 'POST_HRG', 'REP']) rt
      WHERE NOT EXISTS (
        SELECT 1
        FROM post_hrg_development p
        WHERE p.hearing_id = c.hearing_id
          AND p.record_type::text = rt
          AND p.id <> c.id
      )
      LIMIT 1
    ) AS new_type
  FROM collisions c
)
UPDATE post_hrg_development p
SET record_type = fs.new_type::post_hrg_record_type
FROM free_slots fs
WHERE p.id = fs.id
  AND fs.new_type IS NOT NULL;
