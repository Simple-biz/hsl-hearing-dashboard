-- Per-user page-access overrides on top of role defaults.
-- A row here REPLACES the role default for that single page, for that
-- single user. Empty table = no overrides = behavior identical to before.
--
-- Resolution order (see src/lib/page-access.ts):
--   1. If row exists here → use can_access value
--   2. Otherwise          → role default (PAGE_ACCESS in roles.ts);
--      "allowlist" pages (mr_reports, import_rfc) default to FALSE — access
--      is granted ONLY via an explicit row here.
--
-- This generalizes the old hardcoded PAGE_USER_IDS map in roles.ts.

CREATE TABLE IF NOT EXISTS user_page_access (
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_key   TEXT        NOT NULL,
  can_access BOOLEAN     NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER,
  PRIMARY KEY (user_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_user_page_access_user
  ON user_page_access (user_id);

-- ── Seed the existing allowlist ───────────────────────────────────────────
-- Replaces the hardcoded PAGE_USER_IDS:
--   mr_reports → user 1, user 7   |   import_rfc → user 1
-- Guarded with EXISTS so a missing user id can't break the migration.

INSERT INTO user_page_access (user_id, page_key, can_access)
SELECT v.user_id, v.page_key, TRUE
FROM (VALUES
  (1, 'mr_reports'),
  (7, 'mr_reports'),
  (1, 'import_rfc')
) AS v(user_id, page_key)
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = v.user_id)
ON CONFLICT (user_id, page_key) DO NOTHING;
