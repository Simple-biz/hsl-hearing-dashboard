INSERT INTO config_options (option_type, option_value, display_order, is_active) VALUES
  ('type_of_docs_needed', 'Medical Records',   1, true),
  ('type_of_docs_needed', 'Vocational Report', 2, true),
  ('type_of_docs_needed', 'RFC Form',          3, true),
  ('type_of_docs_needed', 'Brief',             4, true),
  ('type_of_docs_needed', 'Other',             5, true)
ON CONFLICT DO NOTHING;
