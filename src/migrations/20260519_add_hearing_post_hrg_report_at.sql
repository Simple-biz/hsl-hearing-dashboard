-- Companion timestamp for the "Post HRG Report" checkbox.
-- Mirrors the other workflow-checkbox stamps (task_assigned_at, etc.):
-- set to NOW() when the box is checked, cleared to NULL when unchecked.

ALTER TABLE hearings
  ADD COLUMN IF NOT EXISTS post_hrg_report_at TIMESTAMPTZ;
