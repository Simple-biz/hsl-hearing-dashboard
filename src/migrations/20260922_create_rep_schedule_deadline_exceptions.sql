-- migrate:up

-- Lets staff grant a specific rep permission to submit their own schedule
-- past the self-service 45-day deadline for one specific month, instead of
-- staff always entering it on the rep's behalf. Same override-table shape
-- as user_page_access / user_field_access: presence of a row grants the
-- exception, no row means the deadline applies normally. No expiry column --
-- once the rep locks their schedule using the exception, the normal
-- schedule_locked guard takes back over on its own.

CREATE TABLE IF NOT EXISTS rep_schedule_deadline_exceptions (
  id          SERIAL PRIMARY KEY,
  rep_id      INTEGER NOT NULL REFERENCES representatives(id),
  year_month  VARCHAR(7) NOT NULL,
  granted_by  INTEGER REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rep_id, year_month)
);

-- migrate:down

DROP TABLE IF EXISTS rep_schedule_deadline_exceptions;
