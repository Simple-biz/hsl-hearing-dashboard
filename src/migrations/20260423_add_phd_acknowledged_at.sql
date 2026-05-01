-- Track whether a Post HRG Development row has been acknowledged by the
-- post-hearing team. NULL = unacknowledged ("NEW") and pins to the top of
-- the grid; a timestamp = seen, sorts back into normal date order.
--
-- Bulk-created rows from the dashboard "Add to Post HRG" flow are left NULL
-- so the team is alerted. Manually-added rows from the PHD page and rows
-- from the spreadsheet importer are auto-acknowledged on insert (the user
-- creating them already saw them, no need to re-flag).

ALTER TABLE post_hrg_development
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Backfill: every existing row is treated as already acknowledged so nothing
-- in production today suddenly looks "new" when this ships.
UPDATE post_hrg_development
   SET acknowledged_at = COALESCE(created_at, NOW())
 WHERE acknowledged_at IS NULL;

-- Partial index to speed up the "unacknowledged first" sort. The set of
-- unacknowledged rows is small at any time (newly created bulk additions),
-- so a partial index keeps the index footprint tiny.
CREATE INDEX IF NOT EXISTS idx_phd_acknowledged_at_null
  ON post_hrg_development (created_at DESC)
  WHERE acknowledged_at IS NULL;
