BEGIN;

-- Fix MR sync regressions seen after the develop merge:
-- 1) Long worksheet URLs can exceed varchar(500), which aborts the mutation
--    before a hearing_sync_events row is recorded.
-- 2) Ensure the event-sync watermark row exists with all latest-session
--    metadata columns expected by /api/mr-sync and the n8n workflow.

ALTER TABLE hearings
  ALTER COLUMN medical_record_link TYPE TEXT;

-- claimant_link is also URL-like and may contain long Google/portal links.
ALTER TABLE hearings
  ALTER COLUMN claimant_link TYPE TEXT;

CREATE TABLE IF NOT EXISTS sync_watermarks (
  key TEXT PRIMARY KEY,
  watermark TIMESTAMPTZ,
  last_event_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS watermark TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_event_id BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_session_start_event_id BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_triggered_by_id TEXT,
  ADD COLUMN IF NOT EXISTS last_triggered_by_name TEXT,
  ADD COLUMN IF NOT EXISTS last_triggered_by_role TEXT,
  ADD COLUMN IF NOT EXISTS last_backup_file_id TEXT,
  ADD COLUMN IF NOT EXISTS last_backup_file_name TEXT,
  ADD COLUMN IF NOT EXISTS last_backup_url TEXT,
  ADD COLUMN IF NOT EXISTS last_backup_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sheet_url TEXT,
  ADD COLUMN IF NOT EXISTS last_sheet_document_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sheet_gid TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
ON CONFLICT (key) DO NOTHING;

-- Clear stale locks left behind by cancelled n8n executions.
DELETE FROM sync_watermarks
WHERE key = 'mr_google_sheets_lock'
  AND updated_at < NOW() - INTERVAL '5 minutes';

COMMIT;
