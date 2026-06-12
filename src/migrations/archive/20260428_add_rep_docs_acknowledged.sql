-- Track whether the current assignee on a representative_docs row has
-- explicitly acknowledged it. NULL = not yet acknowledged ("the assignee
-- hasn't confirmed they've seen this and will start"); a timestamp = the
-- assignee has clicked the Acknowledge button.
--
-- When `assigned_to` later changes to someone else, the acknowledgement is
-- cleared in updateRepDocsField so the new assignee starts fresh.

ALTER TABLE representative_docs
  ADD COLUMN IF NOT EXISTS rep_docs_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rep_docs_acknowledged_by INT
    REFERENCES users(id) ON DELETE SET NULL;
