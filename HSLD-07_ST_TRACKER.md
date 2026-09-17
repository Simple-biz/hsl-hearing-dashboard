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
| ST5 | Resolve the Production environment's required reviewer gate | Iterating | 2 | 2 | Closed 2026-09-17. Removed the required-reviewers rule entirely and fixed a second, separate blocker found in the same settings: the deployment branch policy only allowed main, not hdf-prod. See writeups file. |
| ST6 | End-to-end validation before first real use | Iterating | 3 | 5 | Closed 2026-09-17. Discovered pull_request-triggered workflows only fire once the workflow file exists on the base branch, so validation required merging dev-env's HSLD-07 work first. Verified the first-ever automated dbmate run against dev-env (baseline-only, clean), then a throwaway PR confirmed the full quality plus migration-check loop (including the ST7 fixes) passing end to end. Cleaned up the leftover `pr-304` and `db testing` Neon branches from ST1. See writeups file. |
| ST7 | Fix pre-existing lint failure and migration-check connection flakiness surfaced by ST6 | Mixed (Inherited for the effect pattern, Iterating for the retry logic) | Retroactive, not sized before starting; unplanned scope surfaced mid-validation | 3 | Closed 2026-09-17. Two unrelated real bugs, both blocking the newly-enabled CI gates: a pre-existing react-hooks/set-state-in-effect violation in portal-report-modal.tsx (fixed with React's documented render-time state-adjustment pattern), and an intermittent SCRAM auth failure connecting to freshly created Neon branches (fixed with a bounded retry loop). See writeups file. |
| ST8 | Promote to hdf-prod and fix the actual production migration path | Iterating | Retroactive, not sized before starting; unplanned scope surfaced only once production promotion was attempted | 5 | Closed 2026-09-17. Discovered GitHub's schedule and workflow_dispatch triggers only fire from the repository's default branch, changed default branch from the frozen main to hdf-prod. Merged dev-env into hdf-prod (no tunnel preview, infra-only change, no user-facing UI affected). First production migration run failed safely on the pooler-URL preflight check twice, root cause was a stale environment-scoped PRODUCTION_DATABASE_URL secret (dated 2026-05-04) silently overriding the repo-level one of the same name. Fixed at the correct scope, verified with a temporary hostname-only debug step (never printed the credential), confirmed the real production migration applies cleanly (baseline-only, Applied: 1 / Pending: 0), then removed the debug step. See writeups file. |

Epic total: 13 Estimated SP across the original 6 sprint tasks (each 8 SP or under, clearing
the 8 SP formation floor), plus 8 additional Actual SP across ST7 and ST8, unplanned scope
surfaced entirely during ST6 validation, authorized by Benedict as it was discovered rather
than pre-sized.
