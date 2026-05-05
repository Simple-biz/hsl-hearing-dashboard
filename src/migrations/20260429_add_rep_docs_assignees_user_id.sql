-- Link `rep_docs_assignees` rows to actual user accounts so the system can
-- answer "is the current user the assignee of this row?" — used by:
--   * the rep-docs acknowledge gate (re-tightening it to assignee-only)
--   * the changes-modal assignee filter (exact-match instead of substring)
--   * future "my assignments" filter on the rep-docs page
--
-- Nullable on purpose: contractors and generic labels (e.g. shared queues)
-- stay unlinked. The admin UI on /settings exposes a "Linked User" picker to
-- set / change / clear the link per-assignee.

ALTER TABLE rep_docs_assignees
  ADD COLUMN IF NOT EXISTS user_id INT
    REFERENCES users(id) ON DELETE SET NULL;

-- Prevent two assignees from pointing at the same user (would make
-- "current user's assignee row" ambiguous). Partial index — multiple unlinked
-- rows are still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS rep_docs_assignees_user_id_unique
  ON rep_docs_assignees (user_id) WHERE user_id IS NOT NULL;

-- Seed backfill: auto-link assignees whose name exactly matches a user's
-- full_name (case/space-insensitive). Ambiguous matches (different spelling,
-- married names, etc.) are left for admins to resolve manually via the
-- settings UI.
UPDATE rep_docs_assignees ra
SET user_id = u.id
FROM users u
WHERE ra.user_id IS NULL
  AND LOWER(TRIM(ra.name)) = LOWER(TRIM(u.full_name));
