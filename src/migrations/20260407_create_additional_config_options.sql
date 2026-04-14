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