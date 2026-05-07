-- Migration: add event-session bounds for latest-sync history reuse
-- Date: 2026-04-11
-- Author: Jvincec

BEGIN;

-- Event outbox for scalable Google Sheets sync.
-- This lets the app record create/update/delete events without scanning the
-- entire hearings table on every sync run.
CREATE TABLE IF NOT EXISTS hearing_sync_events (
  id BIGSERIAL PRIMARY KEY,
  hearing_id BIGINT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('create', 'update', 'delete')),
  payload JSONB,
  changed_fields JSONB,
  source TEXT NOT NULL DEFAULT 'web_app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Helpful indexes for event processing and troubleshooting.
CREATE INDEX IF NOT EXISTS idx_hearing_sync_events_hearing_id
  ON hearing_sync_events (hearing_id);

CREATE INDEX IF NOT EXISTS idx_hearing_sync_events_event_type
  ON hearing_sync_events (event_type);

CREATE INDEX IF NOT EXISTS idx_hearing_sync_events_processed_created
  ON hearing_sync_events (processed_at, created_at);

-- Make sure sync_watermarks can support event-based watermarks while staying
-- compatible with the existing timestamp-based sync.
CREATE TABLE IF NOT EXISTS sync_watermarks (
  key TEXT PRIMARY KEY,
  watermark TIMESTAMPTZ,
  last_event_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS watermark TIMESTAMPTZ;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_event_id BIGINT NOT NULL DEFAULT 0;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Seed a separate watermark key for the new event-driven workflow.
-- This does not touch the existing mr_google_sheets timestamp-based key.
INSERT INTO sync_watermarks (key, last_event_id, updated_at)
VALUES ('mr_google_sheets_events', 0, NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;
