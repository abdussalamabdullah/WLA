# Autonomous build — progress journal

Scope authority: `docs/source/WLA Academy Enhancement Plan.md` (approved
2026-10-04) on top of the amended Academy Architecture. Technical design:
`docs/FOUNDATION-ARCHITECTURE.md`. Decisions: `docs/DECISIONS.md` D-73 onward.

Baseline: commit `5293356` (user). 476 tests, 26/26 migrations on staging.

---

## Phase 0 — Authority and decision reconciliation · COMPLETE

**Objective:** apply the plan's "Required Authority Updates" before changing
architecture; settle the decisions Part 3 named.

**Done:**
- Enhancement Plan stored as `docs/source/WLA Academy Enhancement Plan.md` (verbatim text).
- Architecture amended in place, marked *[Enhancement Plan]*: §2/§16/§23 Mission Board placement;
  §16 permission/anonymisation/moderation model; §3 Child Access Code and Family Mission Guide;
  §17 reset vs replay; §22 deferrals updated; lock table.
- CLAUDE.md: authority order, Mission Board naming note, "never add" list.
- D-73 Mission Board · D-74 Child Access Code · D-75 Family Mission Guide · D-76 analytics privacy v2
  · D-77 OPEN-14 scoped blocker · D-78 reset vs replay · D-79 builder "fails to open" root cause.
- OPEN-14 narrowed; OPEN-15 (Mission Manual, Production Brief, Child Mission, Family Mission Guide absent).
- Code: Mission Board link moved from Mission Home to beneath the collection on My Missions; account page
  gains child switching ("Open X's missions") and the Family Mission Guide section (placeholder copy, D-75).

**Builder bug (Part 18):** not a builder defect — `ChunkLoadError` from a stale port-3000 server
started 2026-09-29 whose `.next/` was replaced by later builds. Creation, version, slug, route and
loader verified correct on current code and on staging (D-79).

**Tests:** 477 (placement guard added).

**Blockers:** OPEN-14 (Mission Board retention period, account deletion, Trail export) · OPEN-15.

**Next dependency:** F1 state + variable model.

---

## Phase 1 — Engine foundation (F1–F4, F8 model, F5/F6 storage) and automated QA · COMPLETE

**Objective:** the reusable state/condition/gating/contract/model layer every later capability depends on.

**Requirements addressed (Enhancement Plan):** §3 branching, convergence, multiple outcomes, conditional
reveals/unlocks, compound conditions, unselected branches inaccessible, later states responding to earlier
choices, variables (visible/hidden/counters/resources), changing state, persistence, variants, events,
randomisation, delayed reveals/timers/staged progression; §4 shared interaction contract (state, validation,
persistence, retry, Trail status, progression); §12 automated mission QA (all 17 listed checks + undeclared
variables + unsatisfiable conditions), branch testing, Draft→Test(review)→Publish gating.

**Implementation:** `features/mission-engine/` — `conditions.ts` (F2), `variables.ts` (F1), `definition.ts`
(F8 canonical model + common screen fields), `contract.ts` (F4), `runtime.ts` (`step`, `startRun`),
`projection.ts`, `store.ts` (service-role), `persistence.ts` (both actors), `validator.ts` (static + simulation).
Learner Preview runs the same runtime and renders the same projection.

**Migrations:** `20261004100000_engine_foundation` (0027), `20261004110000_validator_v2` (0028). Staging 28/28.

**Defects found and fixed (pre-existing):**
- D-80 — families could write their own run directly (PATCH `current_screen_key` to Evidence; call
  `complete_mission`). Now service-role-only writes.
- D-81 — unopened Six Names Evidence text, its condition and `next` keys were in the page source.
- D-83 — a forged `visit` would skip a decision once the whole model is server-side; contracts now enforce kinds.
- D-84 — sort-screen shuffle loop starved the transition after it ("Saving…" for ever); earlier misattributed.

**Tests:** vitest 560 (foundation 46, validator 26, Six Names on the runtime 18 routes + QA, contract/projection,
sort-screen behavioural); security regression 107/0 (19 new, mutation-tested); Six Names SQL 64/0;
staging lifecycle 54/0.

**Browser QA:** Six Names six branches on staging through the new runtime: **174/0**. Evidence leak re-measured
in the page source: gone.

**Decisions:** D-80 … D-85.

**Known limitations:** the validator's simulation is bounded (400 paths, ~4×screens steps); a direct
`set_mission_version_status` RPC bypasses the semantic (TS) checks but not the structural SQL gate (D-85).

**Next dependency:** Mission Control v2 + central analytics (F5 instrumentation), then F6 Trail UI, F7 assets.

---

## Phase 2 — Mission Control v2 and analytics reporting · COMPLETE

Committed as `2d52d3e` and `2b922ee`: levelled, state-aware support with recovery items and central
reporting; `admin_mission_insights` (0029) answering the plan's §11 questions from aggregates only.

---

## Phase 3 — Builder (Plan §12) · COMPLETE (pattern library and asset manager follow with F7)

**Implementation:** `schema-form.tsx` generates screen and mission-logic editors from the runtime's own zod
schemas, with a condition builder that offers the mission's own vocabulary; `definition-editor.tsx` (variables,
unlocks, events, variants, pools, checkpoints, workspaces, stages, completion; JSON fallback); `flow-map.tsx`
(every route/option/next/otherwise/event edge; convergence, gating and QA markers; text equivalent); preview
device frames, state inspector and jump-to-state; rollback (new draft from any version); duplication
(`admin_duplicate_mission`, 0030, copies in-database with Kit files copied by the action).

**Migrations:** 0030. **Tests:** security regression 114/0 (duplication checks). Commit `293faf5`.

---

## Phase 4 — Interaction library (Plan §4) · COMPLETE

**Objective:** reusable interaction types with shared state, validation, persistence, Trail status and
conditional progression; the persistent workspace on the same state model.

**Implementation:** 14 types (D-86) — schema, server contract, authoring lint, catalog template and component
each; graded-input model shared by all checkable types; `state.outcomes`, `{outcome}` and `{placed}` refs;
definition `workspaces`. Validation failures shown as guidance, not as failed saves (D-87). QA simulation
follows recovery routes and held screens (D-88).

**Migrations:** `20261004140000_interaction_library` (0031) — enum values; SQL gate learns outcome routes.
Local 31/31, staging 31/31.

**Tests:** vitest 632 (library 58: every template passes QA and plays to completion; graded matching and
normalisation; answers/outcomes/routes/bindings/readout rules absent from the projection; 17 forged-input
refusals; recovery routes; workspace persistence across screens; lint codes). Security regression 118/0.
Six Names SQL 64/0.

**Browser QA (`library.mjs`, staging data, production build):** a mission with all 18 library screens built
entirely in the Admin UI (incl. D-79: a freshly created mission's builder loads) and played in Learner
Preview, each screen audited at 390 / 834 / 1512 (overflow, 44px targets, labels, names, heading order):
**102/0**. Two real defects found and fixed (workspace QA sampling; nested `storeAs` reaching the page).

**QA fixture created on staging:** mission `qa-library-mission` (unpublished draft, no learners).

**Known limitations:** dragging is mouse-only enhancement (tap/keyboard are the complete path); the map is a
simple percentage diagram, not a geographic map; simulation readouts are rule-based text, not a numeric model.

**Next dependency:** F7 assets/media (hotspot and map images become version-pinned assets), then F6 Trail UI,
mechanics, Mission Board.

---

## Phase 5 — F7 assets and media · COMPLETE

**Implementation:** `mission_assets` + private `mission-media` bucket (0032); draft-only authoring functions;
version copy and duplication carry media; `media.ts` resolver; `store.signMedia` (current screen, pinned
version); `MediaBlocks` (inline, zoom, before/after, layers, audio + transcript, video + captions); builder
Asset Manager with server-side MIME/size checks and required accessibility fields; validator checks every
`asset:` reference. D-89.

**Defect found and fixed (pre-existing, D-90):** an analytics name or detail key not on the allow-list rolled
back the learner's entire save. 0033 isolates each event; a unit test keeps engine events and the allow-lists
in step. The trigger was the new simulation event — caught only by playing as a real learner.

**Migrations:** 0032 `mission_media`, 0033 `engine_save_resilient_analytics`. Local and staging 33/33.

**Tests:** vitest 642; security regression 134/0 (13 media checks; analytics-resilience check mutation-tested).

**Browser QA (staging, production build):**
- `media.mjs` 20/21 — uploads through the Asset Manager, refusal without alt text, signed URLs, zoom dialog,
  before/after by named choice, audio transcript, `asset:` image in an interaction, audits at 390/834/1512. The
  one failure was a staging outage during the first upload (`auth.getUser` ServiceUnavailable in the server
  log); a probe afterwards saved normally.
- `learner-library.mjs` **25/25** — the library mission published (kept out of the catalogue), one QA child
  given a fixture entitlement, every library screen played through the real server path: server grading,
  no answers/routes/bindings/rules in the page source on full reloads, pause/resume, server-decided simulation
  readouts, workspace persistence, signed media for the learner, completion, and the recorded state/outcomes/
  responses/analytics checked in the database.

**Performance note:** the builder re-render after a save fetched and signed draft media twice; now once.

**QA fixtures on staging:** mission `qa-library-mission` (v1 published, `published = false` in the catalogue);
children `QA Library *` under the QA parent with fixture entitlements; media files under the mission's folder.

---

## Phase 6 — F6 Mission Trail v2 and recall · COMPLETE

**Implementation:** Trail entries show date (`<time>`), during-the-mission vs at-the-end, and a link to the
entry they relate to; the Trail names its Lab; `child_session_trail` v2 (0034) returns the same fields to the
child session; recall tokens `{{response.x}}` / `{{choice.x}}` / `{{multi.x}}` resolved server-side from the
run's own responses (`engine_load_run` v2) and in Preview from the preview run; validator recall checks. D-91.

**Harness defect found and fixed (D-92):** SQL runners silently dropped checks whose statements errored; one
0031 check had passed for the wrong reason. Runners now fail on any hidden error.

**Migrations:** 0034. Local and staging 34/34.

**Tests:** vitest 648; security regression 139/0 (first ever `child_session_trail` checks: relations returned,
sibling entries never, forged token refused); Six Names SQL 64/0.

**Browser QA (`trail.mjs`, staging):** parent and child-session Trail at 390/1512 — Lab, dates, source,
physical-entry wording, audits: 12/12 (the code created for the child login was turned off again afterwards).
