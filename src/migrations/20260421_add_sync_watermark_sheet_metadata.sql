-- Migration: persist active Google Sheet metadata for MR sync
-- Date: 2026-04-21
-- Author: Jvincec
-- Context:
--   The MR Google Sheets sync flow should use the workflow's active target
--   sheet as the source of truth for the sheet link shown in the UI.
--   These columns store the latest active Google Sheet metadata alongside the
--   existing mr_google_sheets_events watermark row so the app can restore
--   the correct sheet URL after refresh or future sheet target changes.

ALTER TABLE sync_watermarks
  ADD COLUMN IF NOT EXISTS last_sheet_url TEXT,
  ADD COLUMN IF NOT EXISTS last_sheet_document_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sheet_gid TEXT;