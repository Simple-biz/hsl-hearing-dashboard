BEGIN;

-- Migration: persist latest completed sync actor metadata
-- Date: 2026-04-17
-- Context:
--   The UI can already reconstruct the latest completed sync session from
--   last_session_start_event_id .. last_event_id, but it cannot reliably show
--   who triggered that session after a refresh unless the actor metadata is
--   stored alongside the event watermark row.
--
--   These columns are intentionally attached to the existing
--   mr_google_sheets_events watermark row so all permitted users can load the
--   same latest completed sync metadata without needing a separate history
--   table yet.

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_triggered_by_id TEXT;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_triggered_by_name TEXT;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_triggered_by_role TEXT;

UPDATE sync_watermarks
SET
  last_triggered_by_id = COALESCE(last_triggered_by_id, NULL),
  last_triggered_by_name = COALESCE(last_triggered_by_name, NULL),
  last_triggered_by_role = COALESCE(last_triggered_by_role, NULL)
WHERE key = 'mr_google_sheets_events';

SELECT
  key,
  updated_at,
  last_event_id,
  last_session_start_event_id,
  last_triggered_by_id,
  last_triggered_by_name,
  last_triggered_by_role
FROM sync_watermarks
WHERE key = 'mr_google_sheets_events';

COMMIT;
