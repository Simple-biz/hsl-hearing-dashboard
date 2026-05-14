-- Add alternate-name aliases for representatives so the import-compare
-- flow can resolve sheet names that don't exactly match the canonical
-- name in the DB (e.g. sheet says "Alecia Reed" but DB stores
-- "Alecia Reed-Owens"). Admin can curate these per-rep in the Reps
-- settings page; the import lookup checks the main `name` column AND
-- this array on every row.
--
-- Stored as a TEXT[] (Postgres native array) rather than a separate
-- table because the cardinality is tiny (a handful of aliases per rep
-- across ~65 reps total) and we never need to join from aliases back
-- to anything else.

ALTER TABLE representatives
  ADD COLUMN IF NOT EXISTS name_aliases TEXT[] DEFAULT '{}'::TEXT[];

-- GIN index supports fast `$alias = ANY(name_aliases)` lookups even
-- when the table grows. Optional at current scale (65 rows), but
-- cheap insurance and required if we ever want to filter SQL-side.
CREATE INDEX IF NOT EXISTS idx_representatives_name_aliases
  ON representatives USING GIN (name_aliases);
