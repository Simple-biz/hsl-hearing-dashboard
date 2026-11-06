-- migrate:up

-- POC column on the hearings table: the claimant's Assignee in Casewell
-- (ClientListItem.assigned_user_name in the Casewell partner API). Read-only
-- in this app; filled by the Casewell POC sync cron, never edited by hand.
--
-- Stored rather than fetched live because the Casewell API is rate-limited
-- (~1 request/s) and has no bulk "assignee for these ids" lookup, so a live
-- fetch per dashboard page load would take tens of seconds. Matching is on
-- the legacy (Chronicle) client id at the end of chronicle_link.
--
-- poc_synced_at records when the sync last wrote this row, so a stale or
-- never-matched POC can be told apart from a blank Casewell assignee.

ALTER TABLE hearings ADD COLUMN IF NOT EXISTS poc TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS poc_synced_at TIMESTAMPTZ;

-- migrate:down

ALTER TABLE hearings DROP COLUMN IF EXISTS poc_synced_at;
ALTER TABLE hearings DROP COLUMN IF EXISTS poc;
