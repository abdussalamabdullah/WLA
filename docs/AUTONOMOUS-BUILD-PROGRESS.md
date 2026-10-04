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
