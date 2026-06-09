-- -- Add config_options entries for the post_hrg_dev_status dropdown (with colors)
ALTER TYPE config_option_type 
ADD VALUE 'post_hrg_dev_status';
INSERT INTO config_options (option_type, option_value, option_color, display_order, is_active) VALUES
('post_hrg_dev_status', 'Complete', '#10b981', 1, true),
('post_hrg_dev_status', 'Incomplete', '#ef4444', 2, true),
('post_hrg_dev_status', 'Extended', '#f59e0b', 3, true),
('post_hrg_dev_status', 'Records Closed', '#6b7280', 4, true),
('post_hrg_dev_status', 'Continued', '#8b5cf6', 5, true)
ON CONFLICT DO NOTHING;


INSERT INTO config_options (option_type, option_value, option_color, display_order, is_active) VALUES
  ('post_hrg_workflow_status', 'Incomplete',     '#f59e0b', 1, true),
  ('post_hrg_workflow_status', 'Extended', '#3b82f6', 2, true),
  ('post_hrg_workflow_status', 'Complete',   '#22c55e', 3, true),
  ('post_hrg_workflow_status', 'Records Closed',     '#6b7280', 4, true),
  ('post_hrg_workflow_status', 'Continued',   '#ef4444', 5, true)
ON CONFLICT DO NOTHING;


ALTER TYPE config_option_type 
ADD VALUE 'post_hrg_workflow_status';

INSERT INTO config_options (option_type, option_value, option_color, display_order, is_active) VALUES
  ('post_hrg_indicator', 'Need to check / monitor',         '#39FF14', 1, true),
  ('post_hrg_indicator', 'CE''s that need response',        '#FACC15', 2, true),
  ('post_hrg_indicator', 'Normal CE''s',                    '#93C5FD', 3, true),
  ('post_hrg_indicator', 'Assigned to Charlotte',           '#9CA3AF', 4, true),
  ('post_hrg_indicator', 'Assigned to Esther',              '#FB923C', 5, true)
ON CONFLICT DO NOTHING;

ALTER TYPE config_option_type 
ADD VALUE 'post_hrg_indicator';