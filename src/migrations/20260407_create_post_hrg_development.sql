CREATE TABLE IF NOT EXISTS post_hrg_development (
  id                    SERIAL PRIMARY KEY,
  hearing_id            INTEGER REFERENCES hearings(id) ON DELETE SET NULL,
 
  -- Denormalized from hearings (filled on import/create, kept in sync)
  claimant              VARCHAR(255) NOT NULL,
  hearing_date          DATE,
  assigned_rep          VARCHAR(255),
 
  -- Post-hearing specific fields (from the "NEW PH DEV" spreadsheet)
  post_hearing_status   VARCHAR(100),          -- Unfavorable, Favorable, Remand, etc.
  type_of_docs_needed   TEXT,
  details               TEXT,
  person_responsible    VARCHAR(255),          -- person responsible for PHI
  em_sent_task_created  BOOLEAN DEFAULT FALSE,
  ext_letter_sent       BOOLEAN DEFAULT FALSE,
  status                VARCHAR(100),          -- Completed, Pending, In Progress, On Hold, Cancelled
  deadline              DATE,
  new_due_date          DATE,
  remarks               TEXT,
 
  -- Per-field notes/comments (JSON arrays like post_hrg_notes on hearings)
  details_notes                TEXT,  -- JSON: [{user, date, note}, ...]
  person_responsible_notes     TEXT,
  em_sent_task_created_notes   TEXT,
  ext_letter_sent_notes        TEXT,
  status_notes                 TEXT,
 
  -- Metadata
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by            INTEGER,
  updated_by            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_phd_hearing_id ON post_hrg_development(hearing_id);
CREATE INDEX IF NOT EXISTS idx_phd_status ON post_hrg_development(status);
CREATE INDEX IF NOT EXISTS idx_phd_deadline ON post_hrg_development(deadline);
CREATE INDEX IF NOT EXISTS idx_phd_claimant ON post_hrg_development(claimant);

CREATE OR REPLACE FUNCTION update_phd_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phd_updated_at ON post_hrg_development;

CREATE TRIGGER trg_phd_updated_at
  BEFORE UPDATE ON post_hrg_development
  FOR EACH ROW
  EXECUTE FUNCTION update_phd_updated_at();