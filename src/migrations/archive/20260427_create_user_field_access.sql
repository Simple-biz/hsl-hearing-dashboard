-- Per-user, per-page, per-field edit overrides on top of role defaults.
-- A row here REPLACES the role default for that single field, for that
-- single user. Empty table = no overrides exist = behavior is identical
-- to before this migration ships.
--
-- Resolution order (see src/lib/field-access.ts):
--   1. If role === 'rep'  → use role default (override layer bypassed)
--   2. If row exists here → use can_edit value
--   3. Otherwise          → use role default

CREATE TABLE IF NOT EXISTS user_field_access (
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_key   TEXT        NOT NULL,
  field_key  TEXT        NOT NULL,
  can_edit   BOOLEAN     NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER,
  PRIMARY KEY (user_id, page_key, field_key)
);

-- Fast lookups for "what overrides does this user have on this page?"
-- (the admin modal load) and for the per-mutation gate.
CREATE INDEX IF NOT EXISTS idx_user_field_access_user_page
  ON user_field_access (user_id, page_key);
