-- Add 'post_hrg_responsible' as a managed config_options option_type so the
-- Post HRG Development "Responsible" dropdown becomes admin-editable through
-- Settings → POST HRG instead of hardcoded in post-hrg-development/actions.ts.
--
-- The seed list below is the canonical set of values currently used in
-- post_hrg_development.person_responsible — extracted via:
--   SELECT DISTINCT person_responsible
--   FROM post_hrg_development
--   WHERE person_responsible IS NOT NULL
--   ORDER BY person_responsible;
-- Pre-seeding these means every historical row keeps its color badge and
-- the dropdown shows the same full-name values admins are already using.
-- Colors mirror PERSON_COLORS / TEAM_COLORS_MAP from the previous hybrid
-- loader (#DBEAFE blue tones, #EDE9FE lavender tones, #F3F4F6 grey for
-- unmapped, team-specific hexes for teams).

ALTER TYPE config_option_type ADD VALUE IF NOT EXISTS 'post_hrg_responsible';

INSERT INTO config_options (option_type, option_value, option_color, display_order, is_active) VALUES
  ('post_hrg_responsible', 'ALJ',                '#FDBA74',  1, true),
  ('post_hrg_responsible', 'Adele',              '#EDE9FE',  2, true),
  ('post_hrg_responsible', 'Allen Lizardo',      '#EDE9FE',  3, true),
  ('post_hrg_responsible', 'Assigned Rep',       '#F3F4F6',  4, true),
  ('post_hrg_responsible', 'Austin',             '#DBEAFE',  5, true),
  ('post_hrg_responsible', 'Blue Team',          '#3B82F6',  6, true),
  ('post_hrg_responsible', 'Carol Ebardo',       '#EDE9FE',  7, true),
  ('post_hrg_responsible', 'Catherine',          '#EDE9FE',  8, true),
  ('post_hrg_responsible', 'Charlotte',          '#EDE9FE',  9, true),
  ('post_hrg_responsible', 'Claire Cortes',      '#EDE9FE', 10, true),
  ('post_hrg_responsible', 'Emerald Faeldan',    '#EDE9FE', 11, true),
  ('post_hrg_responsible', 'Esther',             '#EDE9FE', 12, true),
  ('post_hrg_responsible', 'Gail Quilosa',       '#EDE9FE', 13, true),
  ('post_hrg_responsible', 'Gina',               '#F3F4F6', 14, true),
  ('post_hrg_responsible', 'Glenda Villanueva',  '#EDE9FE', 15, true),
  ('post_hrg_responsible', 'Green Team',         '#22C55E', 16, true),
  ('post_hrg_responsible', 'HITMER/ALJ',         '#FED7AA', 17, true),
  ('post_hrg_responsible', 'Haya',               '#EDE9FE', 18, true),
  ('post_hrg_responsible', 'Jared',              '#DBEAFE', 19, true),
  ('post_hrg_responsible', 'Jeff',               '#DBEAFE', 20, true),
  ('post_hrg_responsible', 'Jerome Aguirre',     '#DBEAFE', 21, true),
  ('post_hrg_responsible', 'Kourtney Benito',    '#DBEAFE', 22, true),
  ('post_hrg_responsible', 'Lori',               '#F3F4F6', 23, true),
  ('post_hrg_responsible', 'Maya Tampos',        '#EDE9FE', 24, true),
  ('post_hrg_responsible', 'Milton Baillo',      '#F3F4F6', 25, true),
  ('post_hrg_responsible', 'Naomi Gaspar',       '#EDE9FE', 26, true),
  ('post_hrg_responsible', 'Nina Cruz',          '#EDE9FE', 27, true),
  ('post_hrg_responsible', 'Noah Villanueva',    '#DBEAFE', 28, true),
  ('post_hrg_responsible', 'Orange Team',        '#F97316', 29, true),
  ('post_hrg_responsible', 'Purple Team',        '#A855F7', 30, true),
  ('post_hrg_responsible', 'Rick',               '#DBEAFE', 31, true),
  ('post_hrg_responsible', 'Tina',               '#EDE9FE', 32, true),
  ('post_hrg_responsible', 'Tracy Caldoza',      '#EDE9FE', 33, true),
  ('post_hrg_responsible', 'Trina Malazarte',    '#EDE9FE', 34, true),
  ('post_hrg_responsible', 'Van Petigayon',      '#EDE9FE', 35, true),
  ('post_hrg_responsible', 'Vera del Prado',     '#EDE9FE', 36, true),
  ('post_hrg_responsible', 'Vicky Mortos',       '#EDE9FE', 37, true),
  ('post_hrg_responsible', 'Windell',            '#DBEAFE', 38, true),
  ('post_hrg_responsible', 'Winter Generaleo',   '#DBEAFE', 39, true),
  ('post_hrg_responsible', 'Yellow Team',        '#EAB308', 40, true)
ON CONFLICT DO NOTHING;
