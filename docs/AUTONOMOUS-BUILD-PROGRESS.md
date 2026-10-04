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
