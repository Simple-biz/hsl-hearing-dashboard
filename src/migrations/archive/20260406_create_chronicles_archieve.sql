-- Creating Chronicles Archive Table
CREATE TABLE archived_chronicles (
  id SERIAL PRIMARY KEY,
  claimant VARCHAR(255) NOT NULL,
  ssn_last_4 VARCHAR(4),
  claim_type VARCHAR(100),
  hearing_date DATE,
  hearing_time VARCHAR(20),
  time_zone VARCHAR(10) DEFAULT 'ET',
  claimant_location VARCHAR(255),
  representative_location VARCHAR(255),
  alj VARCHAR(255),
  medical_expert VARCHAR(255),
  vocational_expert VARCHAR(255),
  status_date DATE,
  entered_hearing_level_date DATE,
  reason VARCHAR(100) DEFAULT 'withdrawn',
  archived_by VARCHAR(255),
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(claimant, ssn_last_4, hearing_date)
);

CREATE INDEX idx_archived_chronicles_lookup ON archived_chronicles(LOWER(claimant), ssn_last_4, hearing_date);