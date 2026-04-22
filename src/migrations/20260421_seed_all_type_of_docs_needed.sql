-- Seed config_options with every distinct type_of_docs_needed value currently
-- in post_hrg_development. Splits on ';' so multi-value rows
-- (e.g. "Correction Of Earnings; Third Party Statement") become separate
-- options. ON CONFLICT keeps existing rows untouched.

INSERT INTO config_options (option_type, option_value, display_order, is_active)
SELECT
  'type_of_docs_needed',
  value,
  COALESCE(
    (SELECT MAX(display_order) FROM config_options WHERE option_type = 'type_of_docs_needed'),
    0
  ) + ROW_NUMBER() OVER (ORDER BY value),
  true
FROM (
  SELECT DISTINCT trim(part) AS value
  FROM post_hrg_development,
       LATERAL unnest(string_to_array(type_of_docs_needed, ';')) AS part
  WHERE type_of_docs_needed IS NOT NULL
    AND trim(type_of_docs_needed) <> ''
) src
WHERE value <> ''
  AND NOT EXISTS (
    SELECT 1 FROM config_options
    WHERE option_type = 'type_of_docs_needed'
      AND lower(option_value) = lower(src.value)
  );
