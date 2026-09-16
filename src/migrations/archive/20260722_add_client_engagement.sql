-- Client Engagement status column on the Hearings dashboard.
-- Tracks rep team's engagement level with each claimant.
-- Default 'white' (no engagement recorded). No backfill needed —
-- all existing rows get 'white' at the DB level.

ALTER TABLE hearings
  ADD COLUMN IF NOT EXISTS client_engagement TEXT NOT NULL DEFAULT 'white';
