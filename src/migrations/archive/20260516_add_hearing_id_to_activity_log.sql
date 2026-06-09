-- Adds a back-end-only `hearing_id` column to `activity_log` so per-hearing
-- views (e.g. the Rep History modal on the rep-docs detail panel) can filter
-- accurately without the brittle claimant-substring match.
--
-- Nullable on purpose: most existing log entries don't carry a hearing id,
-- and many actions (rep_created, user logins, etc.) aren't tied to one. New
-- writes that touch a specific hearing populate this column; the rep-history
-- query falls back to claimant-string match for legacy NULL rows so coverage
-- doesn't regress.
--
-- No UI surfaces this column. It's an internal filter key only.

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS hearing_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_hearing_id
  ON activity_log (hearing_id)
  WHERE hearing_id IS NOT NULL;
