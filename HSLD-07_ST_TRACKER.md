# HSLD-07 Sprint Task Tracker

Epic: CI/CD Backlog Remediation. Split epic; picking up PR #304 as one lump task would size
well above 8 SP, so it is forcibly decomposed per the 8 SP ceiling. Tasks are interdependent by
construction: ST6 cannot run until ST1 through ST5 land.
Change classification: MAJOR across the epic, it automates production database migrations and
introduces new external dependencies (dbmate, Neon branch actions, Gitleaks/OSV containers).

Context: PR #304 (`cleanup/ci-migration-retarget`, opened by John Vincent Caballero,
2026-06-09) built the CI/CD automation but targeted the retired `develop`/`main` branches and
`develop_testing` Neon branch, and its migration archive/baseline split predates migrations
since applied to `dev-env`. John is no longer on the team; Benedict (sole developer on Hearing
Dash) is completing this directly.

Full closeout prose for each closed task lives in `HSLD-07_ST_WRITEUPS.md`.

| Task | Name | Mode | Estimated SP | Actual SP | Status |
|------|------|------|--------------|-----------|--------|
| ST1 | Retarget branch topology onto `dev-env`/`hdf-prod` | Inherited (Preserve) | 3 | 3 | Closed 2026-09-17. Cherry-picked PR #304's two commits onto a new branch off `dev-env`, retargeted all five workflow files, and fixed a second bug found along the way: the backup workflows were forking from an Idle `production` branch instead of the real, Active `production backup` branch. See writeups file. |
| ST2 | Reconcile the migration archive/baseline against `dev-env`'s current state | Inherited (Preserve) | 3 | 3 | Closed 2026-09-17. Archived all 4 outstanding files and verified all 54 of `dev-env`'s migrations exist byte-identical in archive or as the active baseline file. See writeups file. |
| ST3 | Trim workflow scope to the agreed core three checks | Iterating | 1 | 1 | Closed 2026-09-17. Added continue-on-error to the Gitleaks step. See writeups file. |
| ST4 | Supply missing secrets and confirm existing ones | Iterating | 1 | 1 | Closed 2026-09-17. Benedict added PRODUCTION_DATABASE_URL directly via gh secret set; confirmed present via gh secret list without the value ever passing through Claude. NEON_API_KEY and NEON_PROJECT_ID functional validity deferred to ST6's live workflow run. See writeups file. |
| ST5 | Resolve the Production environment's required reviewer gate | Iterating | 2 | Not started | Scope: replace or drop the `Production` GitHub environment's required reviewer rule, currently `jerup-dev`, who is no longer on the team and would otherwise block every production migration run indefinitely. |
| ST6 | End-to-end validation before first real use | Iterating | 3 | Not started | Scope: open a throwaway PR touching `src/migrations/`, confirm the full `migration-check` loop, build/typecheck/lint, and a manual `backup-production.yml` run; also clean up the leftover `pr-304` and `db testing` Neon branches found during ST1. |

Epic total: 13 Estimated SP across 6 sprint tasks, each 8 SP or under, clearing the 8 SP
formation floor.
