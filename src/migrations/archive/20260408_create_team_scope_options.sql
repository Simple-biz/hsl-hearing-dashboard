-- Migration: Add team_scope to config_options for shared + team-specific dropdown options
-- Values: 'shared' (both teams), 'hearings' (hearings team only), 'post_hearing' (post-hearing team only)
 
-- 1. Add the column with default 'shared' so existing rows work for both teams
ALTER TABLE config_options
  ADD COLUMN IF NOT EXISTS team_scope VARCHAR(20) DEFAULT 'shared';
 
-- 2. Mark existing hearing_decision_status options as 'shared'
UPDATE config_options
  SET team_scope = 'shared'
  WHERE option_type = 'hearing_decision_status'
    AND (team_scope IS NULL OR team_scope = '');
 
-- 3. Insert post-hearing-specific options (not in the hearings dashboard)
-- Shared options that already exist: Unfavorable, Favorable, Pending Decision, Continued,
-- Dismissal, OTR AT HRG, Scheduled — these remain 'shared' and are visible to both teams.
-- Below are NEW options only the post-hearing team uses.
 
INSERT INTO config_options (option_type, option_value, option_color, display_order, is_active, team_scope)
VALUES
  -- Brown
  ('hearing_decision_status', 'Post Hearing Dev',           '#8B4513', 200, true, 'post_hearing'),
  -- Light green
  ('hearing_decision_status', 'Fully Favorable',            '#86EFAC', 201, true, 'post_hearing'),
  -- Light green
  ('hearing_decision_status', 'Partially Favorable',        '#86EFAC', 202, true, 'post_hearing'),
  -- Red
  ('hearing_decision_status', 'Withdrawal',                 '#EF4444', 203, true, 'post_hearing'),
  -- Gray blue
  ('hearing_decision_status', 'Pending Decision Writing',   '#94A3B8', 204, true, 'post_hearing'),
  -- Black (dark)
  ('hearing_decision_status', 'Post Hearing Review',        '#1E293B', 205, true, 'post_hearing'),
  -- Gray
  ('hearing_decision_status', 'Ready to Schedule',          '#9CA3AF', 206, true, 'post_hearing'),
  -- Dark blue
  ('hearing_decision_status', 'Appeals Council',            '#1E3A8A', 207, true, 'post_hearing'),
  -- Purple
  ('hearing_decision_status', 'Scheduled Hearing',          '#7C3AED', 208, true, 'post_hearing'),
  -- Light purple
  ('hearing_decision_status', 'Decision Writing Process',   '#C4B5FD', 209, true, 'post_hearing'),
  -- Red
  ('hearing_decision_status', 'Notice to Show Cause',       '#DC2626', 210, true, 'post_hearing'),
  -- Red
  ('hearing_decision_status', 'AC Denial',                  '#DC2626', 211, true, 'post_hearing'),
  -- Light green
  ('hearing_decision_status', 'OTR',                        '#86EFAC', 212, true, 'post_hearing')
ON CONFLICT DO NOTHING;
 
-- 4. Index for fast scope filtering
CREATE INDEX IF NOT EXISTS idx_config_options_scope ON config_options(option_type, team_scope, is_active);

-- Add the new enum value to config_option_type: Skip later
ALTER TYPE config_option_type ADD VALUE 'post_hrg_responsible';