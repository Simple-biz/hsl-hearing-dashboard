-- Representative Docs workflow tracker
-- One row per hearing, stores the 7 checkbox + timestamp workflow steps
-- plus 6 checker-status flags and the rep-docs assignee.
CREATE TABLE IF NOT EXISTS representative_docs (
  id                          SERIAL PRIMARY KEY,
  hearing_id                  INT NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  assigned_to                 TEXT,
  overall_status              TEXT,

  -- Workflow checkboxes + timestamps
  uploaded_noh                BOOLEAN DEFAULT FALSE,
  uploaded_noh_at             TIMESTAMPTZ,
  sent_repdocs_to_cl          BOOLEAN DEFAULT FALSE,
  sent_repdocs_to_cl_at       TIMESTAMPTZ,
  repdocs_signed              BOOLEAN DEFAULT FALSE,
  repdocs_signed_at           TIMESTAMPTZ,
  contact_ltr                 BOOLEAN DEFAULT FALSE,
  contact_ltr_at              TIMESTAMPTZ,
  repdocs_split               BOOLEAN DEFAULT FALSE,
  repdocs_split_at            TIMESTAMPTZ,
  repdocs_uploaded_chronicle  BOOLEAN DEFAULT FALSE,
  repdocs_uploaded_chronicle_at TIMESTAMPTZ,
  oho_confirmation            BOOLEAN DEFAULT FALSE,
  oho_confirmation_at         TIMESTAMPTZ,

  -- OHO checker section
  oho_assigned_to             TEXT,
  checker_calendar            BOOLEAN DEFAULT FALSE,
  checker_chronicle_claim     BOOLEAN DEFAULT FALSE,
  checker_noh                 BOOLEAN DEFAULT FALSE,
  checker_contact_ltr         BOOLEAN DEFAULT FALSE,
  checker_status              TEXT,

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  created_by                  INT,
  updated_by                  INT,
  UNIQUE (hearing_id)
);

CREATE INDEX IF NOT EXISTS idx_representative_docs_hearing ON representative_docs (hearing_id);
CREATE INDEX IF NOT EXISTS idx_representative_docs_assigned ON representative_docs (assigned_to);
CREATE INDEX IF NOT EXISTS idx_representative_docs_status ON representative_docs (overall_status);
