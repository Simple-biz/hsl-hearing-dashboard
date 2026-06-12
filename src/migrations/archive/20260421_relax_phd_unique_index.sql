-- Relax the (hearing_id, record_type) uniqueness constraint so a single
-- hearing can legitimately have >1 row of the same record_type (e.g.
-- two independent REP workflows on the same hearing).
--
-- The bulk "Add to Post HRG" server action no longer relies on this index
-- for conflict detection — it uses a NOT EXISTS guard in the SELECT instead.
-- A plain (non-unique) index is still worth keeping for the tab/filter query
-- `WHERE hearing_id = $1 AND record_type = $2`.

DROP INDEX IF EXISTS idx_phd_hearing_type;

CREATE INDEX IF NOT EXISTS idx_phd_hearing_type
  ON post_hrg_development (hearing_id, record_type)
  WHERE hearing_id IS NOT NULL;
