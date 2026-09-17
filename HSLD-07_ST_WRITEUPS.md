# HSLD-07 Sprint Task Writeups

Full closeout prose for each closed sprint task in `[HSLD-07]`, in the sprint task description
format from `Developer_Doctrine_v1_11.md`. Open tasks are tracked only in
`HSLD-07_ST_TRACKER.md`; they get an entry here once closed.

---

ST1: Retarget branch topology onto `dev-env`/`hdf-prod` | Estimated 3 SP | Actual 3 SP | Completed 2026-09-17

Cherry-picked both PR #304 commits (`7ecce0f`, `0d7272c`) cleanly onto a new
`hhd-01/ci-migration-retarget` branch off `origin/dev-env`, then rewrote every retired-topology
reference across the five workflow files. `ci-migration.yml`'s `pull_request.branches` and
`cleanup-neon-branch.yml`'s `pull_request.branches` both dropped `develop` and the dead
`feature/mr-pivot-to-google-sheet-sync` in favor of `dev-env`. `migrate-production.yml`'s
`push.branches` moved from `main` to `hdf-prod`. `migrate-develop.yml` was renamed to
`migrate-dev-env.yml` (job id `migrate-dev-env`, concurrency group
`dev-env-database-migrations`, `push.branches: dev-env`), keeping the existing
`secrets.DEVELOP_DATABASE_URL` reference with an inline comment flagging the secret rename as
ST4's job. `ci-migration.yml`'s `migration-check` job's `parent_branch: develop_testing` became
`parent_branch: dev-env`. Cross-checked the Neon console (screenshot from Benedict, project
`dawn-term-28102320`) and found `migrate-production.yml` and `backup-production.yml` were both
forking their pre-migration and daily backups from a branch literally named `production`
(Idle, not the live database) instead of `production backup`, the Default and Active branch
`CLAUDE.md` documents as the real production data. Fixed all four `parent_branch: production`
occurrences (one in `migrate-production.yml`'s pre-migration backup step, three in
`backup-production.yml`'s create, record, and summary steps) plus their matching audit-text and
summary-table strings to `production backup`. Surfaced two Neon branches for cleanup under ST6:
leftover `pr-304`, never deleted by the never-firing `cleanup-neon-branch.yml`, and `db
testing`, a likely remnant of the old `develop_testing` setup.

Commits: `931916811539693089d50169ac329d50a6b92a27`, https://github.com/Simple-biz/hsl-hearing-dashboard/commit/931916811539693089d50169ac329d50a6b92a27

*3 SP: five workflow files touched across two commits' worth of branch and Neon-name
references, plus one live investigation loop (Neon console screenshot) that surfaced a second,
independent bug: the backup workflows targeting the wrong Neon branch, which would have
silently backed up a stale database instead of the real one.*

---

ST2: Reconcile the migration archive/baseline against `dev-env`'s current state | Estimated 3 SP | Actual 3 SP | Completed 2026-09-17

Snapshotted `dev-env`'s full 54-file migration set (`git ls-tree origin/dev-env -- src/migrations`)
and diffed it against the branch's archive plus active files, first catching two false signals:
a filename mismatch on `20260321_make_patient_portal_hearing_id_nullable (1).sql` (renamed to
drop the `(1)` suffix by PR #304 itself, not missing) and a wholesale CRLF versus LF line-ending
mismatch across every archived file that made a naive `diff` report every single one as
different when the content was actually byte-identical (confirmed with `diff --strip-trailing-cr`).
Once both were accounted for, all 54 files verified present and unchanged. Archived the 4 files
still sitting active in `src/migrations/` (`20260612_backfill_status_option_colors.sql`,
`20260722_add_client_engagement.sql`, `20260722_add_oho_ltr_to_rep_docs.sql`, and
`20260729_create_password_reset_tokens.sql`), one more than the 3 originally scoped during PR
review, since `20260612` also postdates the branch and had been missed in the earlier count.
None of the 4 carry `-- migrate:up`/`-- migrate:down` markers (all pre-date dbmate), so leaving
any of them active would have failed `migrate-production.yml`'s preflight structure check and,
more importantly, would have had dbmate try to re-apply schema already present on the real
database. `src/migrations/` now holds only `20260101000000_baseline.sql`, confirmed to still
pass the `migrate:up`/`migrate:down` structure check.

Commits: `9171772c8a47055de1446218bb6bc0ff8e3a922f`, https://github.com/Simple-biz/hsl-hearing-dashboard/commit/9171772c8a47055de1446218bb6bc0ff8e3a922f

*3 SP: a full 54-file verification pass against live `dev-env` content (not a spot check), two
false-positive signals that had to be diagnosed before trusting the result (a legitimate
filename rename, and a systemic line-ending mismatch), and 4 file moves whose correctness
depended entirely on that verification being right.*

---

ST3: Trim workflow scope to the agreed core three checks | Estimated 1 SP | Actual 1 SP | Completed 2026-09-17

Added `continue-on-error: true` to `ci-migration.yml`'s `security` job's `Gitleaks - secret
scan` step, the one hard-blocking check left after the earlier scoping conversation, matching
how `OSV-Scanner - dependency vulnerability report` and the `sql-lint` job's SQLFluff step were
already configured. `quality` (lint, typecheck, build) and `migration-check` (the Neon dry-run)
remain the only two hard gates in the workflow.

Commits: `964e42f224fca5a93b007f23b28a2f0ecaf201c1`, https://github.com/Simple-biz/hsl-hearing-dashboard/commit/964e42f224fca5a93b007f23b28a2f0ecaf201c1

*1 SP: single-flag change to one existing step, no structural or trigger changes.*

---

ST4: Supply missing secrets and confirm existing ones | Estimated 1 SP | Actual 1 SP | Completed 2026-09-17

Benedict added the missing `PRODUCTION_DATABASE_URL` repo secret directly via
`gh secret set PRODUCTION_DATABASE_URL --repo Simple-biz/hsl-hearing-dashboard`, pasting the
direct (non-pooler) Neon connection string for the `production backup` branch into the
interactive prompt so it never touched this session or its logs. Confirmed present via
`gh secret list --repo Simple-biz/hsl-hearing-dashboard`, which returns only secret names and
last-updated timestamps, never values. `DEVELOP_DATABASE_URL` and `NEON_API_KEY` were already
present from 2026-05-01 and `NEON_PROJECT_ID` (`dawn-term-28102320`) from the same date;
confirming their actual functional validity (that the key still authenticates and the project
id still resolves) requires a real API call, which is deferred to ST6's end-to-end workflow
run rather than tested in isolation here. The `DEVELOP_DATABASE_URL` secret rename, discussed
alongside this task, is left as optional follow-up cleanup, not required for the pipeline to
function.

Commits: none, this task made no code changes; it was GitHub repository secret administration
only.

*1 SP: no code touched, but real credential handling with a hard constraint (the value must
never pass through Claude or this session), satisfied by having Benedict run the command
directly in his own terminal.*

---

ST5: Resolve the Production environment's required reviewer gate | Estimated 2 SP | Actual 2 SP | Completed 2026-09-17

Fetched the `Production` GitHub environment's full protection settings via `gh api
repos/Simple-biz/hsl-hearing-dashboard/environments/Production` and found two separate
blockers, not the one originally scoped. First, the `required_reviewers` rule named
`jerup-dev` as the sole reviewer with `prevent_self_review: true`, meaning even swapping the
reviewer to Benedict's own account would still deadlock every run, since he would be the one
pushing to `hdf-prod` and could never approve his own deployment. Per Benedict's decision,
removed the rule entirely (`PUT` to the environment endpoint with `reviewers: []`), leaving
the automated safety nets (pre-migration Neon backup, nightly backup, PR-time migration
dry-run) as the actual protection instead of a human gate that could never fire. Second,
`deployment_branch_policy.custom_branch_policies` only allowed the `main` branch to deploy to
`Production`, meaning `migrate-production.yml`'s `push: branches: [hdf-prod]` trigger from ST1
would have run the workflow but then been silently blocked by the environment itself from ever
executing the `migrate-production` job. Deleted the `main` branch policy entry (id `48601721`)
and added `hdf-prod` (new id `60241827`) via the deployment-branch-policies endpoint. Verified
the final state: only the `branch_policy` protection rule remains, scoped to `hdf-prod`; no
`required_reviewers` rule present.

Commits: none, this task made no code changes; it was GitHub environment settings
administration via the API.

*2 SP: a repo-settings change with real production consequences, and a second, independent
blocker (the branch policy) discovered only by reading the full environment configuration
rather than trusting the reviewer issue to be the only problem.*

---

ST6: End-to-end validation before first real use | Estimated 3 SP | Actual 5 SP | Completed 2026-09-17

Attempted to open a PR from `hhd-01/ci-migration-retarget` into `dev-env` to validate
`ci-migration.yml`, then discovered a GitHub Actions constraint not accounted for in the
original scope: a `pull_request`-triggered workflow only runs once that workflow file already
exists on the pull request's branches, and since none of the five workflow files existed on
`dev-env` yet, validation genuinely required merging the epic's own branch first (PR #324).
That merge fired `migrate-dev-env.yml` for the first time ever; confirmed via the run log that
only `20260101000000_baseline.sql` showed as pending, applied cleanly, `Applied: 1 / Pending: 0`,
directly confirming ST2's archive reconciliation was correct. With the workflows now live on
`dev-env`, opened throwaway PR #325 with a no-op migration file
(`20260918000000_ci_validation_throwaway.sql`), which turned up two real bugs (closed under
ST7): a lint failure and an intermittent Neon connection error. After both were fixed, PR #325
re-ran clean end to end: `Code quality`, `SQL lint`, `Security scan`, and `Test migrations on
Neon branch` all passed, confirming the full `migration-check` loop against a freshly created
Neon branch. Closed PR #325 without merging and deleted its branch; `cleanup-neon-branch.yml`
fired successfully on the close event, confirmed via its own run log. Manually deleted the two
Neon branches identified as leftover during ST1, `pr-304` and `db testing`, directly in the
Neon console per Benedict's confirmation. The manual `backup-production.yml` dispatch originally
scoped here turned out to depend on a separate, larger blocker (GitHub's default branch), closed
instead under ST8.

Commits: none directly; the throwaway commit (`4a18bd7`) lived only on the deleted
`test/ci-validation-throwaway` branch, viewable via closed PR
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/325. The dev-env merge is
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/324.

*5 SP: a scoping assumption (that a PR into dev-env alone would be enough to validate) turned
out wrong and required merging the epic first, plus a full throwaway PR cycle, plus manual Neon
console cleanup across two branches, well past the original 3 SP estimate for what looked like
a single verification pass.*

---

ST7: Fix pre-existing lint failure and migration-check connection flakiness surfaced by ST6 | Estimated (retroactive) 3 SP | Actual 3 SP | Completed 2026-09-17

Two unrelated real bugs, both blocking the CI gates ST6 had just turned on for the first time.
First, `src/components/modals/portal-report-modal.tsx` had 2 pre-existing
`react-hooks/set-state-in-effect` errors (lines 94 and 102), invisible until lint started
running in CI at all. Traced the exact linter heuristic (it flags only the first synchronous
`setState` call reachable in an effect body, not every one) through two iterations: an initial
fix moved the wrong call and only shifted which line got flagged, the final fix consolidated
both resets (`prevInitialFilters`, `prevLocalFilters`) into React's documented
"adjusting state when a value changes" render-time pattern, verified with `npx eslint` (clean),
`npm run typecheck`, and `npm run build` (both clean once the untracked, gitignored
`Pre-Hearing-Medical-Records-Manager-main/` folder was excluded, exactly as any real CI checkout
already does since that folder was never git-tracked). Second, `ci-migration.yml`'s
`migration-check` job intermittently failed connecting to a just-created Neon branch with `pq:
SCRAM-SHA-256 error: server sent an invalid SCRAM-SHA-256 iteration count: "i=1"`, consistent
with the branch's compute still warming up; `create-branch-action` has no readiness wait, so
added a 5-attempt, 5-second-interval retry loop around the `Show pending migrations` step,
scoped only to `migration-check` since `migrate-dev-env.yml` and `migrate-production.yml`
connect to long-lived, already-warm branches.

Commits: `ad1bca0` (portal-report-modal.tsx fix),
https://github.com/Simple-biz/hsl-hearing-dashboard/commit/ad1bca0;
`55d04d4` (migration-check retry logic),
https://github.com/Simple-biz/hsl-hearing-dashboard/commit/55d04d4;
merged to dev-env via `f6b110c`,
https://github.com/Simple-biz/hsl-hearing-dashboard/commit/f6b110c.

*3 SP: two independent root causes in one pass, one requiring two iterations to get right after
misreading the linter's exact heuristic, verified against a real production build rather than
assumed fixed from the diff alone.*

---

ST8: Promote to hdf-prod and fix the actual production migration path | Estimated (retroactive) 5 SP | Actual 5 SP | Completed 2026-09-17

Attempting to manually dispatch `backup-production.yml` surfaced a structural blocker outside
the original scope entirely: GitHub only fires `schedule` and `workflow_dispatch` triggers for
workflow files present on the repository's default branch, which was still `main`, frozen per
`CLAUDE.md` and carrying none of these workflows. Per Benedict's decision, changed the
repository's default branch to `hdf-prod` via the GitHub API (`PATCH /repos/.../` with
`default_branch`), a settings change, not a `main` content change. That in turn meant the
workflow files still needed to exist on `hdf-prod` itself, so merged `dev-env` into `hdf-prod`
(PR #326) per Benedict's call to skip the usual Cloudflare tunnel preview for this infra-only,
non-UI change. The merge auto-triggered `migrate-production.yml` for the first time ever against
the real production database; it failed its own pooler-URL preflight check, twice, even after
Benedict reset the `PRODUCTION_DATABASE_URL` secret with a confirmed-correct, non-pooler
connection string each time. Added a temporary debug step (PR #327) that printed only the
hostname (never the credential) and found the workflow was actually reading a completely
different, stale hostname than either value just set, root cause: a `Production`
environment-scoped secret of the same name, last updated 2026-05-04, silently overriding the
repository-level secret every job under `environment: production` reads first. Reset
`PRODUCTION_DATABASE_URL` at the correct scope (`gh secret set ... --env Production`), reran the
job, confirmed the debug output now showed the correct hostname and the real migration applied
cleanly (`Applied: 1 / Pending: 0`, baseline only). Removed the debug step and the temporary
path-filter widening it needed (PR #328). Flagged to Benedict that the connection string typed
into this chat mid-diagnosis should be treated as exposed and the Neon role password rotated,
independent of this task's completion.

Commits: `61cf1e7` (add debug step), `27242de` (remove debug step); PRs
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/326,
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/327,
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/328.

*5 SP: a repo-wide settings change, a production promotion decision made without the usual
preview gate, two full failed production migration attempts before the actual root cause
(an environment-scoped secret override, not the connection string itself) was found, and a
live diagnostic step run against the real production environment to get there.*
