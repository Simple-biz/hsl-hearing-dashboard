-- "Post HRG Report" checkbox on the Hearings dashboard.
-- A per-hearing boolean shown in an opt-in (toggleable, default-hidden)
-- frozen column. Defaults to false; existing rows are unchecked.

ALTER TABLE hearings
  ADD COLUMN IF NOT EXISTS post_hrg_report BOOLEAN NOT NULL DEFAULT FALSE;
