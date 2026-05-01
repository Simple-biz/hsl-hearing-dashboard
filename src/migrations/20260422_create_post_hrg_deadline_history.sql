-- Track every Post HRG deadline change for a hearing.
-- Replaces the single-value `hearings.post_hrg_deadline_prev` (which only
-- holds the immediately previous date) with a structured, queryable trail.
-- The legacy `_prev` / `_changed_by` columns stay in place for the existing
-- "Previous date" badge in the modal — they shadow the most recent row here.

CREATE TABLE IF NOT EXISTS post_hrg_deadline_history (
  id          SERIAL PRIMARY KEY,
  hearing_id  INTEGER NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  deadline    DATE NOT NULL,
  set_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  set_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_phd_deadline_history_hearing
  ON post_hrg_deadline_history(hearing_id, set_at DESC);

-- ── Backfill from activity_log ────────────────────────────────────────────
-- Every deadline change since launch was logged as a `field_updated` row
-- with a description shaped like:
--   "Post HRG Deadline: '2025-09-15' → '2025-09-22' for: <claimant>"
-- We can't recover the hearing_id directly from that text, so we match on
-- claimant name back to hearings. This is best-effort: if a claimant is
-- duplicated across hearings it may attribute to the wrong row, but for
-- the common case it gives the team a usable historical trail.

INSERT INTO post_hrg_deadline_history (hearing_id, deadline, set_at, set_by)
SELECT
  h.id                                                  AS hearing_id,
  -- The NEW deadline is the value AFTER the arrow.
  NULLIF(
    substring(al.description FROM '→\s*''([0-9-]+)'''),
    ''
  )::date                                               AS deadline,
  al.created_at                                         AS set_at,
  COALESCE(u.full_name, u.email, 'System')              AS set_by
FROM activity_log al
LEFT JOIN users u  ON u.id = al.user_id
JOIN hearings h
  ON lower(trim(h.claimant)) = lower(trim(
       substring(al.description FROM 'for:\s*(.+)$')
     ))
WHERE al.action = 'field_updated'
  AND al.description LIKE 'Post HRG Deadline:%'
  AND substring(al.description FROM '→\s*''([0-9-]+)''') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  -- Skip duplicates if migration is re-run.
  AND NOT EXISTS (
    SELECT 1 FROM post_hrg_deadline_history phh
    WHERE phh.hearing_id = h.id
      AND phh.set_at = al.created_at
  );

-- Also seed the most-recent state from the live `hearings` columns so the
-- current deadline is represented in history (covers cases where the very
-- first set never went through `field_updated`, or where activity_log was
-- pruned). Skipped if a row already exists for this hearing+deadline+changed_by.

INSERT INTO post_hrg_deadline_history (hearing_id, deadline, set_at, set_by)
SELECT
  h.id,
  h.post_hrg_deadline,
  COALESCE(h.updated_at, NOW()),
  COALESCE(h.post_hrg_deadline_changed_by, 'System')
FROM hearings h
WHERE h.post_hrg_deadline IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM post_hrg_deadline_history phh
    WHERE phh.hearing_id = h.id
      AND phh.deadline = h.post_hrg_deadline
  );
