-- OHO Assignees — managed list for the OHO Assigned column in rep docs
CREATE TABLE IF NOT EXISTS oho_assignees (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  bg_color        TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  display_order   INT DEFAULT 0
);
