# HSLD-03 Sprint Task Tracker

Epic: Rep Schedule Access Incidents (Claudia/HSL). Claudia Felix-Matias, Hogan Smith Law legal
assistant, approached Benedict directly with a string of representative complaints about being
unable to access or lock their November 2026 hearing schedules. ST1 through ST5 already exist
on the shared Monday board and are out of scope for this file; this tracker begins at ST6, the
next open task number, and covers only the sprint tasks closed so far in response to Claudia's
reports.
Change classification: MAJOR across the epic — ST7 changes production's deploy trigger from a
manual promote to fully automatic on every `hdf-prod` merge, a real change to deploy/exposure
surface; ST6 changes exactly when an existing validation check fails for real reps.

Full closeout prose for each closed task lives in `HSLD-03_ST_WRITEUPS.md`.

| Task | Name | Mode | Estimated SP | Actual SP | Status |
|------|------|------|--------------|-----------|--------|
| ST6 | Fix rep schedule deadline boundary mismatch | Inherited (Preserve) | 2 | 2 | Closed 2026-09-18. Server-side deadline check in `[token]/action.ts` rejected saves a full day earlier than the client's own `isPastDeadline` calc, so on the deadline day itself the calendar looked editable but every save/lock silently failed. Aligned the server check to the client's existing midnight-to-midnight comparison. See writeups file. |
| ST7 | Diagnose and fix stale Vercel production deployment | Iterating | 3 | 3 | Closed 2026-09-18. Production (`hearings.hogansmith.com`) was serving a build from Aug 28, 22 days and ~15 commits stale, while `hdf-prod` had moved on. Root cause: the Vercel project's Production Branch setting was still `main` (frozen, unused) instead of `hdf-prod`, so every push there only ever built as Preview. Manually promoted the current build to unblock immediately; Benedict corrected the Production Branch setting in the Vercel dashboard. Verified working end to end when ST6's PR #331 merge auto-deployed with no manual step. See writeups file. |
| ST8 | Rep schedule deadline exception (self-exception feature) | Inherited (Preserve) | 3 | 3 | Closed 2026-09-22. Claudia approved letting staff grant a specific rep permission to submit their own schedule past the 45-day deadline for one month, instead of staff always entering it on the rep's behalf. Added `rep_schedule_deadline_exceptions`, matching the existing `user_page_access`/`user_field_access` override-table convention; wired a check into both public deadline guards, a "Grant Exception" button on the dashboard Schedule page, and a banner-state fix for a stale-flash bug found during testing. Branch not used, committed directly to `dev-env`. See writeups file. |
| ST9 | Make rep schedule save atomic | Inherited (Preserve) | 5 | 5 | Closed 2026-09-22. `saveAvailability`/`savePublicAvailability` deleted a rep's whole month before re-inserting it one day at a time outside any transaction; a failure partway through left the delete committed with nothing written back. PR #332 went through three review-driven revisions before merge: a JS transaction wrapper (reverted — dropped the transient-connection retry, held a connection across ~60 round trips), a single CTE statement matching the codebase's own unnest bulk-insert convention (left the lock-fill non-atomic), then a fully-merged statement, then a fix for unordered sibling CTEs that reproducibly threw a duplicate-key error on every re-save of an already-populated month — caught by review and confirmed via live testing before it could ship. See writeups file. |

Epic total so far: 13 Estimated SP across the 4 sprint tasks closed to date (ST6-ST9), each
within the single-task 8 SP ceiling. Incident triage for the reps still reporting login/access
problems (Ellen — resolved; Todd, John Cahill, Stanley Lee — in progress) continues alongside
the n8n email pipeline incidents (misrouted test-node send, Gmail rate limiting) surfaced in the
same window; those will be added as further sprint tasks once that work closes.
