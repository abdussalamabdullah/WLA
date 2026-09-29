# LMS evolution — progress

Working state for the LMS continuation. **Uncommitted; nothing pushed; staging only.**
The repository and the hosted database are authoritative — not earlier run reports.
Last updated 2026-09-29 (continuation run).

## Staging

- Project `zvquddwdcysgrcuvywqw` (eu-west-1). **Migrations: 26 local = 26 staging, 0 pending.**
- Reach it through the **session pooler**: `postgresql://postgres.<ref>:<pw>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`.
  `db.<ref>.supabase.co` is IPv6-only and this network has no IPv6 route (that is why an earlier push "failed");
  `--linked` uses a temporary login role that timed out. Password is in `.env.staging-db-url` (gitignored; do not echo it).
- Catalogue: **only `six-names`** — `published = false`, `missions.version = 2`; v1 `archived` (21 screens, 5 resources),
  v2 `published` (27 screens, 5 resources). 38 progress rows, 2 complete. Review accounts' entitlements intact.
- Bucket `mission-resources`: private; holds exactly the 6 Six Names files (all on released versions).
- `visual-qa-probe` retired via `delete_mission_if_unused` as the review admin (0 learner records); its file and two
  older lifecycle orphans (`probe-sheet.pdf`) removed through the admin session.

## Gap classification (against LMS brief + DECISIONS)

| Area | State | Evidence |
| --- | --- | --- |
| Version lifecycle / immutability (screens, Kit rows, note rows) | DONE | triggers on all three tables; `assert_editable_version` = draft/in_review only |
| **Kit FILES immutable / drafts private** | **DEFECT → FIXED (D-68)** | migration `20260929120000`; see below |
| Child code auth / sessions / revocation | DONE | staging-security 67/0 |
| Parent child management / access codes | DONE | present; covered by staging-security |
| Parent & child shells, My Missions (D-60, D-65, D-66) | DONE (code) | browser QA not yet run |
| Admin LMS (overview, missions, parents, children, orders, activity, analytics, settings, help) | DONE (code) | browser QA not yet run |
| Mission Builder: create → screens → decisions → branches → completion → Kit → note → validate → review → publish → new version → archive → safe delete | DONE | `scripts/lifecycle-staging.mjs` 54/0 on staging, no source edits |
| Kit authoring (add/upload/name/edit/reorder/replace/delete/validate) | DONE | `kit-editor.tsx`, `kit-actions.ts` |
| Kit draft preview/download for admin | PARTIAL → DONE | added this run (admin-session signing, no new route) |
| Parent Note authoring | DONE | `ParentNoteEditor`, `admin_save_parent_note` |
| Parent Note preview | NOT STARTED → DONE | added this run (reuses learner `ParentNote`) |
| Learner Preview | DONE | reuses `MissionScreenRenderer` + engine pure functions; no writes; parity with `persistence.ts` checked |
| Child Kit access — authorisation (D-64) | DONE | staging-security "CHILD MISSION KIT ACCESS" 11/11 |
| Child Kit access — file signing | DONE | key added by the user (session 3); child Kit verified in the browser |
| Mission Board | DONE (as approved) | signposted destination only (C5); nothing added |
| Browser QA (anon/parent/child/admin), a11y, responsive 390/834/1512 | DONE (session 3) | see ACCEPTANCE RUN |
| Production build | DONE | clean |

## DONE in this continuation

- **D-68 (defect fix).** Storage policies ignored versions: an admin could overwrite/delete the object behind a
  PUBLISHED resource, and an entitled family could sign a DRAFT file in the mission folder.
  `private.mission_file_released()` (unexposed schema) now gates family reads and admin delete; admin UPDATE removed.
  Applied to staging, verified live: parent B / family C sign published file 200; parent B signs a draft file 400;
  admin signs a draft file 200.
- `scripts/security-regression.sql`: +13 executed checks (mutation-tested: 4 fail on the old policies).
- `scripts/lifecycle-staging.mjs`: +3 checks (published file cannot be overwritten/deleted; orphan removed after safe
  delete — the script previously leaked one file per run).
- Builder: "Open file" per draft resource, "Open the attached document" for the note — `signDraftFiles()` in
  `src/features/admin/lms-queries.ts`, admin's own session, paths only from draft-only RPCs. No new route.
- Parent Note "Preview" in `kit-editor.tsx` rendering `components/academy/parent-note.tsx`.
- `mission-builder.test.ts`: +4 source guards (mutation-tested).
- D-68 recorded in `docs/DECISIONS.md`.

## ACCEPTANCE RUN (session 3) — COMPLETE (2026-09-30)

Environment: `SUPABASE_SERVICE_ROLE_KEY` present (new-format `sb_secret_…`, validated against staging admin API).
Production build served with `npx next start -p 3100` (port 3000 held by another local process — not touched).
Browser harness now in the repo: `scripts/browser/acceptance/` (see its README). Network on this machine failed
repeatedly during the run (80–100% packet loss spells); several fixes below were found because of it.

### Defects found by browser QA and fixed (each with a test that fails without the fix)

| # | Defect | Fix | Test |
| --- | --- | --- | --- |
| 1 | Public `/missions/[slug]` rendered any slug, incl. unpublished Six Names with "Get this mission" | 404 unless published (RLS decides) | storage.test.ts guard |
| 2 | Sign-in said "email and password don't match" for outages/rate limits | only `invalid_credentials` says it; others honest + logged | auth-errors.test.ts (behavioural) |
| 3 | Sign-up said "try again" for unfixable errors | mapped to field messages; existence not revealed | auth-errors.test.ts |
| 4 | Nothing linked to `/child/login` (D-72) | link on parent sign-in + code panel | storage.test.ts guard |
| 5 | Code panel copy addressed the child | reworded for the parent | — (copy) |
| 6 | Two h1s + repeated instruction on child selection | page duplicate removed | rendered audit |
| 7 | 9/12 builder templates could never be saved | rewritten to schemas | mission-builder.test.ts parses each |
| 8 | Failed reads reported as "not your child" (D-71) | `ServiceUnavailableError` | unavailable.test.ts (behavioural) |
| 9 | Middleware signed parents out on auth timeouts (D-71) | pass through when unknown | middleware.test.ts (behavioural) |
| 10 | `resolveAcademyActor` treated any error as anonymous | only AccessError | via 8/9 |
| 11 | Error boundary Try Again used `reset()` (no re-fetch in Next 16.3) | `retry()`, boundary owns h1 | storage.test.ts guard |
| 12 | `/complete` said "You finished something" to In Progress children | redirect unless complete (D-65) | storage.test.ts guard |
| 13 | **Six Names Evidence never displayed** — reveal advanced (D-69) | `screenAfterInteraction`, server + preview | navigation + completion-and-reveal tests |
| 14 | Supabase requests had no timeout — 15+ min "Saving…" on dead sockets (D-71) | `boundedFetch` 20s, uploads exempt | fetch.test.ts |
| 15 | **Completing response dropped → mission could never complete** (D-70) | persist answer, then complete | completion-and-reveal.test.ts |
| 16 | `notFound()` inside try → 404 shown as "couldn't load, try again" (Home, Kit, Trail) | moved out; app-wide guard | storage.test.ts walks src/app |
| 17 | Revoked child left on a "Please sign in" dead end | redirect to child/parent sign-in | storage.test.ts guard |
| 18 | Admin Free/Published checkboxes 24px (CLAUDE.md: 44px) | wrapping label row | rendered audit |
| 19 | Duplicate element ids when screen + resource forms open together | `useId` in resource form | mission-builder.test.ts |
| 20 | Active Mission header broke at 390px | logo+links row, title below (<sm) | rendered + screenshot |

### Browser QA results (real app, hosted staging)

| Context | Result |
| --- | --- |
| Anonymous | 19/20 → the 1 was defect 1 (fixed) |
| Parent B (collection, tabs, switcher, Home, Kit, For Parents, Trail, /complete gating, Account, Children) | 16/16 |
| Child sign-in edge cases (malformed, wrong, rate limit at 6th, regenerate, revoke ends open session, logout) | 13/13 |
| Child isolation (only own missions; Six Names ×6 routes 404 for unentitled child; no parent pages) | 16/16 |
| Child Mission Kit file (D-64): /api/kit link → 302 signed URL → PDF; forged id / no session / revoked code → 404 | 7/7 |
| Six Names — all six branches as child sessions | all 6 complete, v2-pinned, exact choices + tracker; Evidence hidden→shown on 5 (Ask→Pause went through it under the old bug, which is how 13 was found) |
| Admin nav (10 routes) | 12/12 |
| No-code lifecycle A–H (create→build→Kit→note→validate→preview→review→publish→learner completes→v2→archive→safe delete) | 12+20+11+6+(4→16 after fix 15)+10+8 = all pass |
| a11y/responsive 390/834/1512 | public 111/114 (3 = audit false positive, fixed in audit); parent 29/29; child 21/21; admin 36/36; builder draft 12/12 |

Lab/Age/Search filters render only at >3 missions (D-60): covered by `mission-collection.test.tsx`, not browser-tested.
The error boundary's `retry()` recovery is unit-guarded and documented but was not observed recovering in the browser
(the outage runs had the network fully down; healthy runs never hit the boundary).

### Staging end state (verified)

Migrations 26/26. Catalogue: only `six-names`, `published = false`, v1 archived / v2 published. Bucket: the 6 Six Names
files. All session-3 QA fixtures removed (QA parent deleted via admin API; its 7 children removed via the parent UI;
QA missions safe-deleted via the admin UI; orphan files removed). 34 older `QA …` children from previous runs'
`qa-parent-a/b` accounts remain — not created here, not touched.

## REMAINING PRODUCT DECISIONS (not defects)

- Screen configuration is authored as JSON in the builder. It works with no source edits, but it is not the plain-
  language form an LMS author expects. A per-type form editor is a design/product decision.
- `complete_mission` still fails the whole completion if a `digital` Trail entry has no source response (now
  unreachable through the engine, D-70). Making it skip such entries needs a migration — worth doing, not urgent.

## TEST RESULTS

| Check | Session start | Final |
| --- | --- | --- |
| vitest | 427/427 | **476/476** (20 files) |
| typecheck / lint | clean | clean / clean |
| production build | — | ✓ |
| security regression (local, real migrations) | 75/0 | **88/0** |
| Six Names branches + child session (local SQL) | 64/0 | **64/0** |
| staging security (real API) | 67/0 | **67/0** |
| staging lifecycle (API) | 54/0 | **54/0** |
