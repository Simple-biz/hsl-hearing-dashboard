-- Per-user acknowledgement of rep-docs activity-log entries.
-- Used by the "Ack / Seen" checkbox on rep-change rows in the
-- RepDocsChangesModal — each (user, activity_log entry) pair is unique.
CREATE TABLE IF NOT EXISTS rep_docs_change_ack (
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id     INT NOT NULL REFERENCES activity_log(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_rep_docs_change_ack_user
  ON rep_docs_change_ack(user_id);
