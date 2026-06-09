-- Per-row requirements text for Post HRG Development records.
-- Mirrors `hearings.post_hrg_requirements` but lives on the PHD row, so
-- POST_HRG and REP entries can capture their own deliverables independently
-- of the parent hearing (or for orphan rows that have no hearing at all).
-- The Post HRG Review modal reads/writes this when opened in `phd-internal`
-- mode; `hearing` mode still uses `hearings.post_hrg_requirements`.

ALTER TABLE post_hrg_development
  ADD COLUMN IF NOT EXISTS requirements TEXT;
