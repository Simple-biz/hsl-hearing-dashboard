-- migrate:up

-- Self-service password reset for a rep's schedule link, the token/password
-- system reps use at /schedule/[token] -- separate from the main dashboard
-- login's password_reset_tokens, since reps aren't users rows and the
-- credential being reset lives on a specific rep_schedule_tokens row, not
-- an account. Same shape as password_reset_tokens (SHA-256 hashed,
-- single-use, short expiry) for the same reasoning: the token itself is
-- the sole secret proving the reset request is legitimate.
--
-- Scoped to rep_schedule_token_id, not rep_id: resetting the password
-- updates that exact link's password_hash in place. The rep's existing
-- bookmarked URL keeps working; only the password changes.

CREATE TABLE IF NOT EXISTS rep_schedule_password_reset_tokens (
  id                     SERIAL PRIMARY KEY,
  rep_schedule_token_id  INTEGER NOT NULL REFERENCES rep_schedule_tokens(id),
  token_hash             VARCHAR(64) NOT NULL UNIQUE,
  expires_at             TIMESTAMPTZ NOT NULL,
  used_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_schedule_password_reset_tokens_token_id
  ON rep_schedule_password_reset_tokens (rep_schedule_token_id);

-- migrate:down

DROP TABLE IF EXISTS rep_schedule_password_reset_tokens;
