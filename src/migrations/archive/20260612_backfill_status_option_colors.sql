-- Backfill config_options.option_color for active status options that have no
-- colour yet, seeding from the previously-hardcoded badge palettes (DECISION_HEX
-- on the dashboard, MR_STATUS_CLS on the Medical Records page). After this runs,
-- every meaningful Decision / MR Status option has a colour in config_options,
-- so all surfaces (dashboard, MR pivot, Hearings modal) render the SAME colour
-- for a given value — config_options is the single source of truth.
--
-- Idempotent: only fills NULLs, so it never overwrites a colour set in Settings
-- and is safe to re-run.

-- ── Hearing decision status ───────────────────────────────────────────────────
UPDATE config_options c
SET option_color = v.color
FROM (VALUES
  ('Scheduled',                                            '#e9d5ff'),
  ('Post HRG Review/ Dev',                                 '#fef9c3'),
  ('Fully Favorable',                                      '#bbf7d0'),
  ('Partially Favorable',                                  '#bbf7d0'),
  ('Favorable',                                            '#bbf7d0'),
  ('Unfavorable',                                          '#fecaca'),
  ('Pending Decision',                                     '#fef08a'),
  ('Continued',                                            '#a5f3fc'),
  ('OTR AT HRG',                                           '#86efac'),
  ('OTR',                                                  '#86efac'),
  ('GOOD CAUSE LTR TO CLMT',                               '#fecaca'),
  ('WD CLMT DECEASED',                                     '#fecaca'),
  ('Dismissal',                                            '#fecaca'),
  ('Withdrawal - No Contact',                              '#fecaca'),
  ('Withdrawal - SGA',                                     '#fecaca'),
  ('Withdrawal - Client Terminated Rep',                   '#fecaca'),
  ('Withdrawal - In-Person',                               '#fecaca'),
  ('Withdrawal - Client Working/ Doing Better/WD Hrg Req', '#fecaca'),
  ('Withdrawal - UFD',                                     '#fecaca'),
  ('Withdrawal - Receiving Benefits',                      '#fecaca'),
  ('Withdrawal - Misc',                                    '#fecaca')
) AS v(option_value, color)
WHERE c.option_type = 'hearing_decision_status'
  AND c.option_value = v.option_value
  AND c.option_color IS NULL;

-- ── Medical record status ─────────────────────────────────────────────────────
-- Seeded from MR_STATUS_CLS. Options without a hardcoded colour (Incomplete,
-- Overpayment, Post Hearing Development, etc.) are intentionally left NULL so
-- they keep rendering as the neutral fallback badge.
UPDATE config_options c
SET option_color = v.color
FROM (VALUES
  ('Complete',                 '#e9d5ff'),
  ('In Progress',              '#fbcfe8'),
  ('Ready',                    '#bbf7d0'),
  ('Not Started',              '#fecaca'),
  ('URGENT! NEEDS ATTENTION',  '#b91c1c'),
  ('WITHDRAWAL',               '#e4e4e7')
) AS v(option_value, color)
WHERE c.option_type = 'medical_record_status'
  AND c.option_value = v.option_value
  AND c.option_color IS NULL;
