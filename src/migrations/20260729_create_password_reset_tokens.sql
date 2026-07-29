-- Self-service password reset for the main dashboard login (/login).
--
-- The token itself is the sole secret proving email ownership (no separate
-- password like rep_schedule_tokens has), so it's stored as a SHA-256 hex
-- hash rather than plaintext -- same reasoning as api_keys.api_key. The raw
-- token is only ever shown once, inside the emailed reset link.
--
-- expires_at is set short-lived (recommended: 1 hour) at insert time.
-- used_at is set once the token is consumed, so it can't be replayed even
-- within its expiry window. Rows past expiry (used or not) are deleted by
-- a daily cron (see src/app/api/cron/cleanup-tokens) rather than kept
-- around indefinitely.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by user (e.g. invalidating prior outstanding tokens on a new request).
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);
