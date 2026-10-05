# WLA Academy Autonomous Build Completion Report

Branch `academy-mvp`, baseline `5293356`, final code commit `28f7f48` (docs and QA scripts follow it).
Nothing pushed. Updated 2026-10-05 after the verification of the same day concluded MORE IMPLEMENTATION
REQUIRED; every non-blocked item it listed is now implemented and verified as stated below.

Statuses: **COMPLETE** · **PARTIAL** · **BLOCKED**.

---

## 1. Exact remaining Enhancement Plan gaps

| Gap | Status | Why |
| --- | --- | --- |
| Family Mission Guide content on Account (§1) | **BLOCKED** | Source document not in the repository (OPEN-15). Placeholder shown, nothing invented (D-75). |
| Reading-level and vocabulary checks per age band (§12) | **BLOCKED** | Rules live in the Mission Manual (OPEN-15). Mission QA says plainly they are not applied (D-102). |
| Retention of published Mission Board items beyond withdrawal; parent-account deletion; Trail export | **BLOCKED** | Policy decision OPEN-14. Current behaviour keeps nothing a family withdraws. |
| General object recognition by camera (§5 "where specified") | Not required | No approved mission specifies it (D-104). Marker recognition (QR/barcodes) is COMPLETE and browser-verified; a future recogniser plugs into `code_entry` without engine change. |
| A support contact form | Not in Academy scope | The approved support copy refers to a public-site form; the Academy uses the approved copy and links (D-100 notes). |

There is no other unimplemented item in Enhancement Plan §1–§13.

## 2. What was implemented (this round)

| Item | Where | Decision |
| --- | --- | --- |
| `code_attempted` emitted for every code/symbol attempt (insights metric was always 0) | `runtime.ts` | — |
| Interruption-proof drafts for response, multi-choice, tracker and sort (sort keeps its order and place) | `screens/draft.ts`, `screens/index.tsx`, `six-names-types.tsx` | D-100 |
| Account: each child's missions with status; privacy and permissions (Trail privacy, access-code status per child, Board decisions); approved support copy | `app/account/page.tsx`, `board-permissions.tsx` | — |
| Printables to the WLA print standard: Karla/Fraunces embedded (OFL), fit-to-width, conditional fields, per-variant images and pages, output report, QA test-render per variant | `print.ts`, `admin/print-qa.ts`, `definition.ts`, `assets/fonts` | D-101 |
| Age 7–15 (blocking) and judging / bubbly language (advisory) from the authority; reading-level rules explicitly not applied | `validator.ts` | D-102 |
| Mission Control valid-return invariant: tested; materials link to a missing Kit item blocks publishing | tests, `validator.ts` | D-103 |
| Object recognition assessment | DECISIONS | D-104 |
| **Defect:** mission QA could not open a stage after a real-world interval, so such missions could not be published | `validator.ts` | D-105 |
| **Defect:** header, stats grids and asset keys overflowed at 200% text on phones | `app-shell.tsx`, `profile-switcher.tsx`, analytics/overview pages | D-106 |
| Builder label "Add trail entrie" → "Add trail entry" | `schema-form.tsx` | — |

Earlier rounds (D-73–D-99): see `docs/AUTONOMOUS-BUILD-PROGRESS.md`.

## 3. What was verified in the browser (staging, production build of the final code)

| Script | Result | Covers |
| --- | --- | --- |
| `forms-lifecycle.mjs` | **29/29** | Builder no-code path: mission logic (variables, pool, event via condition builder, checkpoint, completion condition) and eight screens (incl. effects, Mission Control audio, video, layers, Trail markers with a relation) entered ONLY through the generated forms; four assets through the Asset Manager; Kit; note; QA clear; branch test; flow map; publish; rollback to a v2 draft edited through the forms; duplication with media and Kit files copied |
| `forms-learner.mjs` | **26/26** | the form-built mission as a child: randomised pool (drawn, shown, stored, stable on reload); changing-condition event interrupting the route; Mission Control audio (signed, no autoplay, returns to the same screen); video with captions track, WebVTT served, transcript; layers toggle; real checkpoint wait and opening; interruption/resume of a typed answer; Trail relation linking to the earlier entry; analytics insights on the real run (starts, completions, event, Mission Control use, Trail saves, no child data) |
| `device-real.mjs` | **9/9** | compass from an emulated device-orientation feed, graded on the server as a sensor reading; QR read from a camera feed by BarcodeDetector; object-facing wording; camera stopped on read; no upload; completion |
| `text200.mjs` | **52/52** | 200% text size and zoom-200% (640px) on learner pages, a live Active Mission, builder, preview, analytics, admin overview, Board |
| `mechanics.mjs` | **21/21** | QR scan-to-reveal and exact resource; printable PDF in WLA type carrying the run's hidden variant code (decoded through the embedded font's ToUnicode map); timer; compass manual route; camera fallback |
| `account.mjs` | **6/6** | Account sections' content |
| `a11y3.mjs` | **52/52** | parent 24, admin 28 — 390, 834, 1180 landscape, 1512; one h1, no overflow, labels, names, 44px targets, visible focus |
| `sixnames.mjs` (final) | **216/216** | §8 below |
| Earlier rounds, unchanged code paths | library 102/0, learner library 25/25, media 20/21 (outage), Trail 12/12, patterns 12/12, Board 21/21 | |

## 4. Unit / API-only evidence (not exercised in a browser)

- Motion (shake) and tilt sensor paths — Chrome offers no motion emulation; compass is browser-verified. Real
  physical devices (iOS permission prompt, real magnetometer) not tested here.
- Printable image overlays and per-variant page selection; print-output QA blocking a broken print in the Builder.
- Pool weights and exclusions; variant age bands; QR conditions ("not yet"); timer `onExpire: stay`; per-screen
  retry button; workspace objects arriving by condition; `{{choice.x}}` recall; multi-level Mission Control.
- Mission Control focus return to its trigger (jsdom test only; closing by Escape without advancing is verified in the Six Names browser runs).
- Insights correctness beyond the counted measures checked in `forms-learner.mjs` (SQL-tested).

## 5. Blocked by OPEN-14 / OPEN-15

OPEN-14: published Board retention beyond withdrawal, parent-account deletion, Trail export.
OPEN-15: Family Mission Guide content; Mission Manual reading-level/vocabulary rules; Production Brief and
Child Mission authorities.

## 6. Final test counts

**712 tests in 35 files — all passing.** Typecheck and lint clean. Production build succeeds.

## 7. Migrations

**37**, local and staging in parity (no migration was needed this round). Six Names `published = false`;
no commit in this build touched its seed content.

## 8. Six Names final regression

Fresh disposable children (`QA … R4`), all six approved routes, one pass, final commit: **216/216.**
Per branch: selected consequence only (and the unused consequences never reach the page); tracker after each
decision; Changed List; Evidence hidden until its stage and shown in place once opened; Evidence changes Clarity
only; pause/resume to the exact screen and tracker; Mission Control offered, opens, reveals nothing, does not
advance; Judgement cards not marked right or wrong, choice recorded; no free-text field and no written answer
stored; a reload mid-sort returns to the same item; Final Judgement stays physical; completion as closure;
Trail shows exactly the child's own entries; no other child appears; run pinned to v2 and complete.
Also: Six Names SQL routes 64/0; Six Names unit tests 103/103 (including the 18 routes against the original reducer).

## 9. Builder no-code verification

**Verified (29/29 + 26/26):** a reusable mission can be created, edited, previewed, tested (QA + branch test),
published, rolled back to a new draft, edited again and duplicated entirely through the Builder's forms, with no
JSON field opened, and then played by a child end to end.

## 10. Security

Local regression **166/0** (runners fail on any hidden error); staging, through the real API as real roles,
**67/0**; staging lifecycle **54/0**. No new client grants; analytics carry only structural detail; drafts are
tab-scoped and never mission state.

---

## Known limitations

- Camera scanning needs `BarcodeDetector` (Chromium today); typing always works.
- Dragging is a mouse enhancement; tap and keyboard are complete.
- Printables: WLA fonts cover Latin characters; the approved base PDF carries all other presentation.
- QR sheets print from draft/in-review versions (D-61) and stay valid after publish.
- QA simulation bounded (400 paths; one held step per screen); a direct publish RPC bypasses the TS checks but not
  the database gate (D-85).
- Board shows approaches only for missions the child has finished (D-96, reversible).
- QA fixtures on staging: the QA parent (manual QA access pack) and its `QA …` children; unpublished QA
  missions `qa-library-mission`, `qa-mechanics-mission`, `qa-patterns-mission`, `qa-board-mission`,
  `qa-forms-*` and their duplicates.
