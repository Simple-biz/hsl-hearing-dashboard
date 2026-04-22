-- Adds a category column to post_hrg_development so a single hearing can have
-- up to three independent records (MR / POST_HRG / REP), each with its own
-- lifecycle (status, deadline, docs needed, person responsible, etc).

CREATE TYPE post_hrg_record_type AS ENUM ('MR', 'POST_HRG', 'REP');

ALTER TABLE post_hrg_development
  ADD COLUMN IF NOT EXISTS record_type post_hrg_record_type NOT NULL DEFAULT 'POST_HRG';

-- Prevent accidentally creating two rows of the same (hearing, type).
-- Partial index so manually-created rows (no hearing_id) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phd_hearing_type
  ON post_hrg_development (hearing_id, record_type)
  WHERE hearing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phd_record_type
  ON post_hrg_development (record_type);
