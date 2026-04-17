BEGIN;

-- Migration: persist latest Google Sheets backup metadata for MR sync
-- Date: 2026-04-17
-- Context:
--   Each completed sync can optionally create a pre-sync backup copy of the
--   Google Sheet before any append/update/delete operations run.
--   These columns store the latest backup metadata alongside the existing
--   mr_google_sheets_events watermark row so the UI can show the backup link
--   after refresh for all permitted users.

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_backup_file_id TEXT;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_backup_file_name TEXT;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_backup_url TEXT;

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_backup_created_at TIMESTAMPTZ;

SELECT
  key,
  updated_at,
  last_event_id,
  last_session_start_event_id,
  last_backup_file_id,
  last_backup_file_name,
  last_backup_url,
  last_backup_created_at
FROM sync_watermarks
WHERE key = 'mr_google_sheets_events';

COMMIT;

-- ============================================================
-- ROLLBACK:
-- ============================================================
-- ALTER TABLE sync_watermarks DROP COLUMN IF EXISTS last_backup_created_at;
-- ALTER TABLE sync_watermarks DROP COLUMN IF EXISTS last_backup_url;
-- ALTER TABLE sync_watermarks DROP COLUMN IF EXISTS last_backup_file_name;
-- ALTER TABLE sync_watermarks DROP COLUMN IF EXISTS last_backup_file_id;
-- ============================================================
