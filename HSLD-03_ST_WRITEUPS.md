# HSLD-03 Sprint Task Writeups

Full closeout prose for each closed sprint task in `[HSLD-03]`, in the sprint task description
format from `Developer_Doctrine_v1_11.md`. Open tasks are tracked only in
`HSLD-03_ST_TRACKER.md`; they get an entry here once closed.

---

ST6: Fix rep schedule deadline boundary mismatch | Estimated 2 SP | Actual 2 SP | Completed 2026-09-18

Reported via Claudia, forwarding Alan Dunnigan's email: unable to lock his November schedule on
repeated attempts, then unable to even open a day on the calendar the following day. Root cause
was two independent deadline calculations disagreeing about the same day. The client,
`public-schedule-client.tsx`, computes `daysUntilDeadline` by comparing `deadlineDate` (midnight,
45 days before the 1st of the target month) against `new Date().setHours(0,0,0,0)`, so on the
deadline day itself `daysUntilDeadline` is `0`, not negative, and `isPastDeadline` stays `false`,
leaving the calendar and its Lock/Save buttons visibly editable. The server, `[token]/action.ts`,
instead compared the full current timestamp against that same midnight value
(`if (new Date() >= deadline) throw ...`), which is already true at any time on the deadline day,
so every `savePublicAvailability` and `resetPublicSchedule` call silently rejected with "The
45-day deadline has passed" while the UI still invited the attempt. Fixed both functions to
compare midnight-to-midnight, matching the client exactly: introduced `todayMidnight` (`new
Date()` with `setHours(0, 0, 0, 0)`) and changed the guard to `if (todayMidnight > deadline)`, so
the deadline day itself is consistently open on both sides. Alan's actual November entries were
left for staff/him to submit directly, not entered on his behalf. Verified against a Vercel
preview build off `dev-env` (`hsl-hearing-dashboard-b3au0e5no`) rather than a Cloudflare quick
tunnel, since quick tunnels are a deprecated technique per Benedict; skipped a second manual
tunnel-preview round for the same reason once the fix reached `hdf-prod`.

Commits: `f01b501` (dev-env), https://github.com/Simple-biz/hsl-hearing-dashboard/commit/f01b501;
merged to `hdf-prod` via PR #331, https://github.com/Simple-biz/hsl-hearing-dashboard/pull/331
(merge commit `c3bf813`).

*2 SP: a two-function, one-file logic fix with a precise existing pattern to match (the client's
own calculation), verified against a real preview build before merging, plus the GitHub
branch-protection detour of opening and merging a PR instead of pushing `hdf-prod` directly.*

---

ST7: Diagnose and fix stale Vercel production deployment | Estimated 3 SP | Actual 3 SP | Completed 2026-09-18

Surfaced when Benedict asked for the latest build state, recalling that Vercel had a history of
not auto-deploying for this project. `vercel ls` showed the only Production-target deployment
was 22 days old (`dpl_HwA3HEb58sAr1Gu7yqJaY4XPKDNB`, created 2026-08-28, aliased to
`hearings.hogansmith.com`), while everything pushed since had built as Preview only. An initial
read of local git history undercounted the gap and incorrectly suggested the ST6-adjacent
password-reset middleware fix (`f8f8bcb`) was still unmerged on `hdf-prod`; a fresh `git fetch`
corrected this; that commit was in fact already live in the Aug 28 deploy, so no self-checkout
regression existed and no correction was needed there. Located the Preview build matching
`hdf-prod`'s current HEAD (`hsl-hearing-dashboard-j9dz9k49r`, aliased to
`hsl-hearing-dashboard-git-hdf-prod-simpleandhsl.vercel.app`) and promoted it directly via
`vercel promote` to unblock production immediately (new production deployment
`dpl_GREdDGpYjtaukzaagRCrnucAcxPj`). Root-caused the recurring pattern by reading the Vercel
project's git link via the API (`GET /v9/projects/prj_RMf3x5PSLkA3KkDWmW6Pvdbw8Y9s`): `link.
productionBranch` was `main`, the frozen archive branch `CLAUDE.md` says to never touch, instead
of `hdf-prod`, so GitHub Actions pushes there were correctly building but never auto-promoting.
Two attempts to patch `productionBranch` directly through the generic project PATCH endpoint
both returned `400 Invalid request: should NOT have additional property`, confirming that field
isn't writable through that endpoint; handed off as a two-minute manual step instead of continuing
to guess at undocumented API shapes against a live project. Benedict located the correct control
under Project Settings → Environments → Production → Branch Tracking and set it to `hdf-prod`
directly. Verified end to end when ST6's PR #331 merge (`c3bf813`) auto-deployed to
`hearings.hogansmith.com` (`dpl_8G9BMgztr7cW1bFTZoMgR56HUr4x`) with no manual promote required,
confirming the fix holds for all future merges.

Commits: none, this task made no code changes; it was Vercel project and deployment
administration via the CLI, the read-only project API, and the dashboard's Branch Tracking
setting.

*3 SP: required discovering and correcting a wrong initial read of the git state mid-investigation,
two failed API attempts before falling back to a manual dashboard fix, and a live production
promote — real investigation depth, not a single obvious config toggle, closed out with an actual
end-to-end verification on the next merge rather than assumed fixed.*

---

ST8: Rep schedule deadline exception (self-exception feature) | Estimated 3 SP | Actual 3 SP | Completed 2026-09-22

Claudia approved (via reply to the ST6 follow-up email) letting staff grant a specific rep a
one-time exception to submit their own schedule past the 45-day deadline for one month, instead
of staff always entering it on the rep's behalf. Added migration
`20260922_create_rep_schedule_deadline_exceptions.sql` (`rep_id`, `year_month`, `granted_by`,
`granted_at`, unique on `rep_id, year_month`), matching the existing `user_page_access`/
`user_field_access` override-table shape rather than inventing a new pattern: presence of a row
grants the exception, no row means the 45-day deadline applies normally, no expiry column since
the normal `schedule_locked` guard takes back over once the rep locks. `getScheduleDeadlineException`
added to both `[token]/action.ts` (public) and `(dashboard)/schedule/action.ts` (duplicated per
this file pair's own established convention of not cross-importing between the two route trees,
same as `getFederalHolidays`/`getPublicHolidays`), and checked in `savePublicAvailability` and
`resetPublicSchedule` before rejecting a past-deadline save. Dashboard Schedule page gets a
"Grant Exception" button in the existing "Submission Deadline Passed" banner, calling a new
`grantScheduleException(repId, yearMonth)` (mirrors `unlockSchedule`'s shape, logs via the
existing `logAction` pattern). Public page's banner switches from red "Deadline Passed" to green
"Late Submission Allowed" once granted, via a `hasDeadlineException` state populated alongside
availability/hearings/holidays in `loadData`. User testing surfaced a real bug: switching months
on the public page briefly showed the *previous* month's lock/deadline banner while the new
month's `loadData()` call was still in flight (a rep granted an exception for October briefly saw
November's page still showing "Late Submission Allowed" before it corrected to "Deadline
Passed"). Fixed by adding a `monthLoading` flag, set for the duration of `loadData`, gating all
three deadline/lock banners so they render nothing mid-fetch instead of stale state — confirmed
purely cosmetic (the server always re-checks the exception fresh on save regardless of what the
banner happened to show) before shipping, then verified fixed by the user directly.

Commits: `1f69339`, https://github.com/Simple-biz/hsl-hearing-dashboard/commit/1f69339 (no
separate branch/PR, pushed directly to `dev-env` per Benedict's direction).

*3 SP: a new migration plus changes across four files (two action.ts pairs, two client
components), verified directly against `dev-env`, plus a real UI bug found during user testing
and fixed in the same task rather than deferred.*

---

ST9: Make rep schedule save atomic | Estimated 5 SP | Actual 5 SP | Completed 2026-09-22

`saveAvailability` (dashboard) and `savePublicAvailability` (public rep-token page) deleted a
rep's whole month of `rep_availability` rows, then re-inserted them one day at a time in a plain
loop with no transaction — a failure partway through (a bad value, a dropped connection, the
crash that likely hit Todd on Nov 17) left the delete committed with nothing written back,
silently wiping the rep's month. Opened PR #332 for review rather than pushing straight to
`dev-env`, per Benedict's call given the data-loss stakes. First revision added `dbTransactionPlain`
to `src/lib/db/index.ts` (mirroring the pre-existing, never-called `dbTransaction`/`dbWithRLS`
minus RLS scoping) and wrapped both delete-then-insert-loop sequences in it. Code review flagged
five real problems with that approach: it silently dropped `db.query`'s transient Neon-cold-start
retry; it held one pool connection open across up to ~62 sequential round trips instead of a
single bulk statement; a failed `ROLLBACK` on an already-broken connection could mask the
original error; `client.release()` was called without an error flag even after a failed
transaction, risking a poisoned connection returning to the pool; and — the sharpest finding —
this codebase already has a proven single-statement atomic-write convention (the archive CTE,
and the `unnest`-based bulk insert in `post-hrg-development/actions.ts`) that this PR bypassed
in favor of introducing the first real usage of a JS transaction wrapper in the codebase. Second
revision replaced the transaction with `WITH deleted AS (DELETE ...) INSERT ... SELECT ... FROM
unnest($5::date[], $6::boolean[], $7::availability_type[], $8::text[])` for the explicit day
writes plus a separate `generate_series`-based lock-fill insert, verified directly against
`dev-env` (mixed data types, empty-day save, lock-fill count). Second review pass caught that the
two statements were still non-atomic relative to each other when locking — a connection drop
between them could leave a month partially locked. Third revision folded both into one statement
via a second writable CTE (`inserted`, using `RETURNING availability_date` so the lock-fill
excludes whatever was just written, gated on `lockSchedule` directly in SQL), removing the
redundant `setDates`/`dates` duplicate array the same pass flagged. Third review pass caught the
most serious issue: `deleted` and `inserted` were sibling CTEs with no data dependency, and per
Postgres docs, sibling writable CTEs with no dependency execute in an unspecified order against
the same snapshot — reproduced reliably against `dev-env` (`duplicate key value violates unique
constraint`) on every re-save of an already-populated month, which would have broken the single
most common real action (editing an existing schedule) had it shipped. Fourth revision added
`RETURNING 1` to `deleted` and a `WHERE (SELECT count(*) FROM deleted) >= 0` guard to `inserted`'s
SELECT — `count(*)` always returns exactly one row regardless of how many rows were deleted, so
this never filters out a day, it only forces a real read dependency that makes Postgres run
`deleted` first, same intent as the codebase's own archive CTE. Verified with 7 consecutive
re-saves of an already-populated month (including one already-locked) against `dev-env`, all
succeeding with no constraint violation. Final review pass found no remaining correctness bugs —
it specifically tried two more angles (a UTC "today" cutoff concern, a missing `ON CONFLICT` on
`inserted`) and refuted both after live-testing. Two cleanup-only findings remain open, not
blocking: the ~68-line atomic-save block is now duplicated verbatim between the two files
(candidate for extracting a shared `saveRepAvailabilityMonth()` helper given how failure-prone
this logic proved across four revisions), and the `count(*) >= 0` ordering trick is less obvious
than the codebase's usual "real dependency" CTE pattern (heavily commented in place as the
mitigation). Merged via PR #332 (`--merge`, not squash, preserving all four revision commits);
branch archived under git tag `archive/fix-rep-schedule-save-transaction` and deleted.

Commits: `8fa52a5`, `0ffadcc`, `1a07495`, `e4e70b4`; PR
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/332; merge commit `7b07b1c`.

*5 SP (retroactive): three full review-driven revisions after the initial implementation, one of
which caught a bug that would have broken re-saving any already-populated schedule in production,
each verified with live queries against `dev-env` rather than trusted from the diff alone —
exactly the kind of task the doctrine's own bias note says to size higher than first instinct.*

---

ST10: Wire up toast confirmations app-wide | Estimated 3 SP | Actual 3 SP | Completed 2026-09-22

Recon before touching anything found `src/components/ui/sonner.tsx`'s `<Toaster/>` — a themed
wrapper around the `sonner` package, reading light/dark from `next-themes` — was never mounted
anywhere in `src/app`, despite two files (`representative-docs-client.tsx`,
`rep-docs-notes-panel.tsx`) already calling `toast()`/`toast.success()`/`toast.error()`; those
calls had been silently doing nothing since the Rep Docs page shipped. Also found, before
mounting anything globally, that `dashboard-client.tsx` already anchors a full-width bulk-action
bar (`fixed bottom-0 left-0 right-0`) and an auto-assign status box (`fixed bottom-6 right-6`) to
the bottom of the Hearing Dashboard page — Sonner's default corner — so the Toaster was first
mounted at `position="top-right"` to sidestep both; per Benedict's explicit follow-up request,
moved to `position="bottom-right"` instead, accepting that known overlap risk on the Hearing
Dashboard page specifically. Mounted inside `<ThemeProvider>` in `src/app/layout.tsx`, alongside
`<AuthProvider>{children}</AuthProvider>`, since the wrapper needs theme context. Dashboard
Schedule page (`(dashboard)/schedule/schedule-client.tsx`) had no save/action feedback at all;
wrapped `handleSave`, `handleUnlock`, `handleGrantException`, and `handleReset` in try/catch with
`toast.success()`/`toast.error()`, matching the Rep Docs page's exact pattern. User testing
surfaced a second instance of ST8's stale-banner-flash bug, this time on the dashboard side: the
`hasDeadlineException` fetch (a separate `useEffect` keyed on `[selectedRepId, selectedMonth]`,
not part of `loadData`) had no loading gate, so switching reps/months could briefly show the
previous selection's exception banner. Fixed with a new `exceptionLoading` flag, same shape as
ST8's public-page `monthLoading` guard. A second round of testing revealed the "toasts don't
appear" report was neither a Toaster-mounting bug nor a positioning issue — dev server terminal
logs showed the test traffic hitting `/schedule/[token]` (the public rep-facing page, identical
button labels to the dashboard: "Lock Schedule", "Save Draft", "Reset") rather than `/schedule`
(dashboard) — confirmed by screenshot. That page was out of the original scope, since it already
had its own separate inline `message`/`setMessage` banner predating this task; per Benedict's
explicit call that it should have been in scope from the start, removed that banner system
entirely (state, JSX block, both `setMessage` call sites) and replaced `handleSave`/`handleReset`
with the same `toast.success()`/`toast.error()` pattern, for full consistency across every
action-confirmation surface in the app. Both the dashboard and public paths confirmed working
directly by the user before commit.

Commits: `6591d67`, https://github.com/Simple-biz/hsl-hearing-dashboard/commit/6591d67 (pushed
directly to `dev-env`, no branch/PR).

*3 SP: three files touched including a full removal-and-replacement of an existing UI pattern,
a real collision-risk recon before the first line of code was written, two rounds of user testing
that each surfaced a genuine issue (a stale-banner-flash bug and a wrong-page mix-up requiring
log-based diagnosis), and a scope expansion mid-task once the public page's role became clear.*

---

ST11: Extract shared saveRepAvailabilityMonth helper | Estimated 2 SP | Actual 2 SP | Completed 2026-09-22

Closed out the two remaining cleanup findings from PR #332's final review pass. The ~68-line
atomic-save CTE block landed identically in both `saveAvailability`
(`(dashboard)/schedule/action.ts`) and `savePublicAvailability` (`[token]/action.ts`), flagged as
a real risk given the same logic had already taken three review-driven revisions to get right —
any future fix (a new `availability_type`, a timezone edge case, a schema change) would need to
be remembered and applied correctly in both places, or the two save paths would silently
diverge. Extracted into `src/lib/rep-schedule.ts` as `saveRepAvailabilityMonth(repId, yearMonth,
days, lockSchedule)`, matching this codebase's existing per-domain helper convention
(`src/lib/auto-assign.ts`: plain `db` import, no `"use server"` directive since it's called from
server actions rather than being one itself). Both callers now delegate to it; dashboard keeps
its own `logAction` call after, public keeps its own deadline-check gate (including the
staff-granted exception check) before. Pure code movement, no logic change — confirmed the
extracted query text is byte-identical to what was already exhaustively tested in ST9, then
re-ran the critical case directly against `dev-env` (re-save of an already-populated,
already-locked month) to confirm the extraction didn't silently introduce a copy-paste error.

Commits: `0c2a256`, https://github.com/Simple-biz/hsl-hearing-dashboard/commit/0c2a256 (pushed
directly to `dev-env`, no branch/PR — the two findings it closes were review feedback on an
already-merged PR, not new scope needing its own review cycle).

*2 SP: small, contained refactor across three files with no behavior change, but still re-verified
against `dev-env` rather than assumed correct from the diff, given how failure-prone this exact
logic had already proven across ST9's four revisions.*

---

ST12: Reconcile the two disagreeing schedule deadline rules | Estimated 3 SP | Actual 5 SP | Completed 2026-09-23

Two independent parts of the app decided "is the rep schedule submission deadline passed" using
two different formulas: the rep-facing pages (`public-schedule-client.tsx`, dashboard
`schedule-client.tsx`, and `[token]/action.ts`'s enforcement) used "45 days before the 1st of the
month," while `auto-lock`/`schedule-reminder` crons used "the 20th of the month, two months
prior." Before picking one, ran git archaeology to find out which came first and why they'd
diverged: `git log -S` on both formulas' source files, plus a full-history content grep (every
commit, not just messages) for "Austin" per Benedict's ask about a possible directive behind it.
Found both rules were the *same* rule at the original 2026-03-05 build (commit `b88e034`, Jeru
Palma) — the auto-lock cron's own `getDeadlineForMonth` used `firstOfMonth.setDate(getDate() -
45)`, identical to the pages. A 2026-07-22 commit (`3bbf815`, "automate monthly rep schedule
invitation cycle") changed only the cron side to the 20th-of-M-2 formula, describing it in the
commit message as a "fix" to the deadline calculation, with no PR description, code comment, or
linked issue explaining why. No trace of "Austin" found anywhere in the repo's full history,
GitHub PRs, or GitHub issues — the one hit (`20260514_seed_post_hrg_responsible_options.sql`) is
an unrelated dropdown config value, a staff name for post-hearing record assignment. Per
Benedict's decision, standardized on the crons' 20th-of-M-2 rule going forward, since it lands on
the same calendar day every time rather than shifting with month lengths. Added
`src/lib/schedule-deadline.ts` exporting `getScheduleDeadline(yearMonth): Date` — deliberately no
`db` import, so it's safe to import from client components without pulling server-only
dependencies into the client bundle. Both crons now import it instead of keeping their own
duplicate; `[token]/action.ts`'s `savePublicAvailability`/`resetPublicSchedule` enforcement and
both schedule pages' display logic now use it too. Updated "45-day deadline" wording to generic
"submission deadline" since the specific number is no longer accurate. Opened PR #333 rather than
pushing directly, per Benedict's explicit request this time (the branch had to be split off after
the fact: the initial commit had already landed directly on local `dev-env`, so it was moved to
its own branch and `dev-env` reset back to origin before pushing, to keep the PR diff clean).

Review round 1 (4 parallel angles) caught two real gaps the initial pass missed, both directly on
this task's own topic. First, the claim that `send-schedule-invites` was "already independently
consistent" turned out wrong on inspection depth, not on the math — it computed the right *value*
today but via its own inline `new Date(now.getFullYear(), now.getMonth(), 20)`, a fourth
independent copy of the formula rather than a call to the new shared function, undermining the
PR's own "single source of truth" claim; three separate reviewers flagged it as the exact drift
risk this task exists to close. Migrated it to `getScheduleDeadline(targetMonth)`, confirmed
algebraically equivalent to what it replaced. Second, and sharper: auto-lock's `isDeadlinePassed`
compared with `today >= deadline`, while the rep-facing pages use `today > deadline` (the
deadline day itself still counts as open, the exact convention ST6 established). Before this PR
the two sides referenced different calendar dates entirely, so this operator mismatch was
invisible; once both read from `getScheduleDeadline`, `>=` meant auto-lock could fire and lock a
rep's month hours before the UI itself considered that day closed — the same boundary-bug class
ST6 fixed once, resurfacing in a new spot the moment the two systems started agreeing on which
day to compare. Changed to `>`, confirmed via direct simulation that both sides agree on the
deadline day itself and the day after. Round 2 came back clean on this task's own scope (a
separate, unrelated bug it surfaced is ST13). Round 3 (final) returned no findings at all.

Verified live in the browser against `dev-env`, not just typechecked: public page (rep
`BenedictDevTest`, id 132) shows November 2026's deadline as September 20; staff dashboard shows
September 2026's deadline as July 20 — both correct per the new rule, confirmed on two different
months. Boundary fix verified via direct date-math simulation rather than a live cron run.

Commits: `6cd00c9`, `839dedb`, `531c9ba` (the latter is ST13's fix, same branch/PR); PR
https://github.com/Simple-biz/hsl-hearing-dashboard/pull/333, merge commit `898e15e`. Branch
archived under git tag `archive/fix-schedule-deadline-reconciliation` and deleted.

*5 SP: real investigative depth (git archaeology across two formulas' full history, an exhaustive
"Austin" search that came back empty), a genuine design decision presented with tradeoffs before
implementing, changes eventually spanning 8 files including the actual enforcement path, live
browser verification across two pages and two months, plus two full review-driven revisions after
the initial "done" state — including one that overturned this writeup's own first-pass claim that
a file didn't need touching.*

---

ST13: Auto-lock cron doesn't respect staff-granted deadline exceptions | Estimated 2 SP | Actual 2 SP | Completed 2026-09-23

Surfaced during ST12's review round 2, not part of its original scope: `auto-lock/route.ts`'s
per-rep loop never checked `rep_schedule_deadline_exceptions` before locking a rep's month with
default values. Confirmed via `git log -S` that this table name never appeared in this file's
history at all — a pre-existing gap from when ST8 built the exception feature, not a regression
from ST12's changes to `isDeadlinePassed`. Severity is what earns this its own ST rather than a
footnote: a staff-granted exception is only ever relevant once the deadline has already passed,
which is the exact same condition that makes `isDeadlinePassed` return true and trips the nightly
auto-lock run. In practice this meant the very first midnight after staff granted an exception,
the cron would find no `schedule_locked` rows for that rep/month (since the rep hasn't had a
chance to use the exception yet), and silently default-lock the month anyway — the exception
feature was close to non-functional for its actual use case. Added a
`rep_schedule_deadline_exceptions` lookup immediately after the existing "already locked" check,
skipping auto-lock for that rep/month when an exception row exists; same query shape as ST8's
`getScheduleDeadlineException`, kept as a local inline query rather than imported, per this file's
established pattern of not sharing DB-backed helpers across route trees. Added a new
`exceptionSkipped` counter to the cron's summary log line and JSON response, so this path is
visible in the activity log rather than silent. Verified the exact query directly against
`dev-env`: 0 matching rows before granting an exception, 1 after, confirming the skip condition
fires precisely when intended.

Commits: `531c9ba`, same branch/PR/merge as ST12 — https://github.com/Simple-biz/hsl-hearing-dashboard/pull/333, merge commit `898e15e`.

*2 SP (retroactive): small, contained fix (one file, one added query, one new counter), but a
real severity call to make it its own task rather than folding it into ST12's numbers, since it's
a distinct bug in a different feature (ST8's exception grant) surfaced only incidentally by
touching the same function.*
