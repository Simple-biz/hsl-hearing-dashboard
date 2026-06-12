-- Create rescheduled_history table to track previous assignments when hearings are rescheduled
CREATE TABLE IF NOT EXISTS rescheduled_history (
  id SERIAL PRIMARY KEY,
  hearing_id INTEGER NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  original_claimant VARCHAR NOT NULL,
  original_hearing_date DATE,
  new_claimant VARCHAR NOT NULL,
  new_hearing_date DATE,
  previous_rep_id INTEGER,
  previous_rep_name VARCHAR,
  previous_decision VARCHAR,
  previous_mr_team VARCHAR,
  previous_mr_team_id INTEGER,
  previous_brief VARCHAR,
  previous_mr_status VARCHAR,
  previous_alj VARCHAR,
  previous_assignment_status VARCHAR,
  rescheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rescheduled_by VARCHAR
);
 
CREATE INDEX IF NOT EXISTS idx_rescheduled_history_hearing_id ON rescheduled_history(hearing_id);
CREATE INDEX IF NOT EXISTS idx_rescheduled_history_rescheduled_at ON rescheduled_history(rescheduled_at DESC);