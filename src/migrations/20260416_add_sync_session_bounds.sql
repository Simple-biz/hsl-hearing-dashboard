BEGIN;

-- Migration: add event-session bounds for latest-sync history reuse
-- Date: 2026-04-16
-- Author: Jvincec
-- Context:
--   The event-driven Google Sheets sync already stores one row per hearing
--   mutation in hearing_sync_events and tracks a single high-water mark in
--   sync_watermarks.last_event_id. That is enough to prevent reprocessing,
--   but it is NOT enough to reconstruct the latest completed sync session for
--   duplicate / no-change button clicks.
--
--   This migration adds a second event boundary field so the workflow can
--   rebuild the exact batch of hearing_sync_events that produced the most
--   recent successful sync, without creating a new history table.
--
--   Session reconstruction rule after this migration:
--     latest completed session = events where
--       id > last_session_start_event_id
--       AND id <= last_event_id
--
--   Example:
--     before sync  : last_event_id = 40
--     sync writes  : events 41..47
--     after sync   : last_session_start_event_id = 40
--                    last_event_id               = 47
--
--   Then any later no-change request can still show the exact latest sync
--   history by reading events 41..47.

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_event_id BIGINT NOT NULL DEFAULT 0;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_session_start_event_id BIGINT NOT NULL DEFAULT 0;

-- Ensure the event-based watermark row exists and is initialized safely.
INSERT INTO sync_watermarks (
  key,
  watermark,
  last_event_id,
  last_session_start_event_id,
  updated_at
)
VALUES (
  'mr_google_sheets_events',
  NOW() - INTERVAL '7 days',
  0,
  0,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET
  last_event_id = COALESCE(sync_watermarks.last_event_id, 0),
  last_session_start_event_id = COALESCE(sync_watermarks.last_session_start_event_id, 0);

-- Verify
SELECT
  key,
  watermark,
  last_event_id,
  last_session_start_event_id,
  updated_at
FROM sync_watermarks
WHERE key = 'mr_google_sheets_events';

COMMIT;

-- ============================================================
-- ROLLBACK:
-- ============================================================
-- ALTER TABLE sync_watermarks DROP COLUMN IF EXISTS last_session_start_event_id;
-- -- Drop last_event_id only if you are fully rolling back the event-driven workflow:
-- -- ALTER TABLE sync_watermarks DROP COLUMN IF EXISTS last_event_id;
-- ============================================================
