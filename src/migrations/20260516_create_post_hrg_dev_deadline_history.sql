-- Per-PHD-row Post HRG deadline history.
--
-- The existing `post_hrg_deadline_history` table tracks the *hearing's*
-- `hearings.post_hrg_deadline` (MR / "hearing mode" modal). REP / POST_HRG
-- rows store their own deadline in `post_hrg_development.deadline` and had no
-- history trail — this table is the per-row equivalent, keyed by the PHD row.

CREATE TABLE IF NOT EXISTS post_hrg_dev_deadline_history (
  id          SERIAL PRIMARY KEY,
  phd_row_id  INTEGER NOT NULL REFERENCES post_hrg_development(id) ON DELETE CASCADE,
  -- Denormalized for convenience (a PHD row may or may not link to a hearing);
  -- the canonical key for this trail is phd_row_id.
  hearing_id  INTEGER,
  deadline    DATE NOT NULL,
  set_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  set_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_phd_dev_deadline_history_row
  ON post_hrg_dev_deadline_history(phd_row_id, set_at DESC);

-- ── Seed the current live deadline per row ────────────────────────────────
-- We deliberately do NOT text-parse activity_log for a backfill here: unlike
-- the hearing-level table, multiple PHD rows (REP / POST_HRG) can share the
-- same hearing + claimant, and the log description carries neither the PHD
-- row id nor the record type, so a parsed backfill would mis-attribute
-- changes across sibling rows. Seeding the current value gives each row a
-- correct starting point; accurate per-row history accrues from here forward.

INSERT INTO post_hrg_dev_deadline_history (phd_row_id, hearing_id, deadline, set_at, set_by)
SELECT
  p.id,
  p.hearing_id,
  p.deadline,
  COALESCE(p.updated_at, NOW()),
  'System'
FROM post_hrg_development p
WHERE p.deadline IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM post_hrg_dev_deadline_history h
    WHERE h.phd_row_id = p.id
      AND h.deadline = p.deadline
  );
