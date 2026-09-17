-- API keys table for the public REST API (/api/v1/*).
--
-- Stores the SHA-256 hex hash of the full key in `api_key` (lookup column).
-- The plaintext is shown to the admin exactly once at generation time and
-- never persisted anywhere. Validated by requireApiKey() in src/lib/api-keys.ts.
--
-- Note: on the TEST database this table already exists from a prior
-- abandoned attempt (one row with request_count > 0). The CREATE TABLE
-- IF NOT EXISTS clause makes this migration idempotent — it's a no-op
-- against test and a real create against production.

CREATE TABLE IF NOT EXISTS api_keys (
  id              SERIAL PRIMARY KEY,
  -- Audit: which admin minted the key. NOT NULL so every key is owned.
  user_id         INTEGER NOT NULL REFERENCES users(id),
  -- First 8 chars of the plaintext (e.g. "hsl_8f2a") — safe to display
  -- in the admin UI for identification. Never reveals the secret portion.
  api_key_prefix  VARCHAR(8)   NOT NULL,
  -- SHA-256 hex of the full plaintext key. Unique lookup column.
  api_key         VARCHAR(64)  NOT NULL UNIQUE,
  -- Human-readable label shown in the admin UI.
  label           VARCHAR(100) NOT NULL,
  -- Soft-disable flag. Revoked keys fail validation but their history
  -- (request_count, last_used_at) is preserved.
  is_active       BOOLEAN DEFAULT TRUE,
  -- NULL = no expiry. Otherwise validation fails after this time.
  expires_at      TIMESTAMPTZ,
  -- Best-effort usage stamp (updated on every successful validation).
  last_used_at    TIMESTAMPTZ,
  request_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by user (for any per-admin "who created which key" reporting).
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
