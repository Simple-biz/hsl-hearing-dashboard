-- migrate:up

-- Migration: create sync_watermarks table
-- Date: 2026-04-10
-- Author: Jvincec
-- Context:
--   The N8N "Sync to Google Sheets" workflow previously used a hardcoded
--   2-hour window (WHERE h.updated_at >= NOW() - INTERVAL '2 hours') to
--   determine which hearing rows to fetch. This meant any edit made more
--   than 2 hours before a sync was permanently invisible to N8N -- the
--   updated_at timestamp would age out of the window and never be picked
--   up by any future sync run.
--
--   This table stores a per-workflow watermark (last successful sync
--   timestamp). The N8N "Fetch current DB rows" node reads it at the start
--   of each run and uses it as the lower bound of the WHERE clause. The
--   "Update Watermark" node writes NOW() back on completion -- but only
--   after the sheet writes finish successfully, so a mid-run error never
--   silently advances the watermark past unsynced changes.
--
--   The no-change path (Has changes? = false) also advances the watermark
--   so that rows already in-sync with the sheet are not repeatedly
--   re-fetched on every subsequent sync run.
--
--   The initial row is seeded with NOW() - INTERVAL '7 days' so that the
--   first sync after this migration performs a one-time backfill of any
--   edits made in the past week before the watermark was introduced.

CREATE TABLE IF NOT EXISTS sync_watermarks (
  key         TEXT        PRIMARY KEY,
  watermark   TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '7 days'
);

INSERT INTO sync_watermarks (key, watermark)
VALUES ('mr_google_sheets', NOW() - INTERVAL '7 days')
ON CONFLICT (key) DO NOTHING;

SELECT key, watermark
FROM sync_watermarks
WHERE key = 'mr_google_sheets';

-- migrate:down

DROP TABLE IF EXISTS sync_watermarks;
