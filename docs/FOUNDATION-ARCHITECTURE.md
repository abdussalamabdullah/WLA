# WLA Academy — Foundation Architecture

The canonical technical explanation of the reusable mission platform built
from the Six Names baseline for the Academy Enhancement Plan
(`docs/source/WLA Academy Enhancement Plan.md`). Decisions: `docs/DECISIONS.md`
D-80 onward. Progress: `docs/AUTONOMOUS-BUILD-PROGRESS.md`.

**Rule:** a new mission is configuration — rows and a definition — never new
application code. A new *kind* of interaction is one contract module plus its
schema and component, never a mission-specific branch.

---

## 1. The shape in one picture

```
 browser                         Next server                                 Postgres (Supabase)
 ───────                         ───────────                                 ───────────────────
 MissionRunner ──interaction──▶ recordInteractionAction
                                  │ resolveAcademyActor
                                  ▼
                                gateway.resolve()  ── parent: requireEntitledMission (RLS)
                                  │                 └─ child:  child_session_mission (token)
                                  ▼
                                store.loadRun(progress.id) ─────────────▶ engine_load_run   (service_role only)
                                  │   { progress, model, full state }      pinned screens + definition
                                  ▼                                         + private state
                                runtime.step(model, state, key, i, now)    (pure, shared with Preview)
                                  │   { state, next, completed, response,
                                  │     evidence[], events[] }
                                  ▼
                                store.saveRun(...) ──────────────────────▶ engine_save        (service_role only)
                                  │                                         one transaction: state, private,
                                  ▼                                         response, Trail, progress,
 ◀── projected screen ──────── projectCurrent(model, key, state)           completion Trail, analytics
     + client state            (server-only fields removed)
```

Nothing in a browser can write a run (D-80). Nothing but the projection
reaches a browser (D-81).

---

## 2. The canonical model (F8) — `definition.ts`

```
MissionModel = {
  definition:     MissionDefinition    // mission_versions.definition (jsonb)
  screens:        MissionScreen[]      // mission_screens rows at the version
  completionRule: CompletionRule|null  // pinned on the run (D-17)
}
```

One model, consumed unchanged by the builder, the validator, Learner Preview
and the runtime. Versioned with the mission version: immutable once
published (`guard_mission_version_row`), copied by `create_mission_version`,
readable only through draft-only admin RPCs (`admin_draft_definition`) or by
the engine (D-61 preserved). `schemaVersion` lets the shape evolve.

**MissionDefinition**

| Field | Purpose |
| --- | --- |
| `variables[]` | Declared mission state (F1) |
| `unlocks[]` | `{key, when}` — gained once, never lost |
| `events[]` | Changing-condition events: `{key, when, effects[], goto?}` |
| `variants[]` | Approved variants: `{id, weight, ageBand?, values}` |
| `pools[]` | Controlled randomisation: `{key, items[{id, weight, when?}], pick, storeAs}` |
| `checkpoints[]` | Multi-session stages: `{key, screenKey, availableAfter?{since, seconds}}` |
| `completion?` | Mission-level completion condition (else the version's rule) |
| `stages` | Screen → stage label, for drop-off reporting |

**Common screen fields** (any type, beside its type configuration)

| Field | Purpose | Reaches browser? |
| --- | --- | --- |
| `routes[]` | Ordered conditional routing `{when, to}` | no |
| `requires` / `otherwise` | Gated content; skipped while false | no |
| `effects[]` | Applied on a successful interaction | no |
| `trail` | Mission Trail marker (F6) | title + type only |
| `retry` | `{allowed, maxAttempts?}` (D-78) | `allowed` only |
| `timer` | `{seconds, visible, onExpire}` | via `view.timerSeconds` |
| `media[]` | Asset blocks `{asset, when?}` (F7) | resolved, filtered |
| `support[]` | Mission Control v2 items `{level, kind, when?}` | filtered, no `when` |
| `required` | Must be on every completing path (QA) | no |
| `convergeAt` | Branches must meet here (QA) | no |

---

## 3. State (F1) — `variables.ts`, `schemas.ts`

`MissionStateData` keeps every pre-foundation field (visited, choices,
revealed, handoffs, multi-choices, responded, custom) and adds, all
defaulting to empty so old state parses unchanged:

`variables` · `unlocked` · `attempts` · `marks` (server-time) · `firedEvents` ·
`variant` · `seed` · `workspaces`

**Variables** are declared: `key, type (string|number|boolean|enum|counter|resource|list),
default, visibility (visible|hidden), persist (run|screen), operations?, min/max, values, maxItems`.
They change only through **effects**: `set · increment · decrement · toggle ·
add · remove · append · unlock · mark`, validated against the declaration and
clamped to constraints. Invalid effects are ignored at runtime (a child is
never stranded by an authoring mistake) and refused at publish by the
validator.

**Storage split.** `splitForStorage` puts hidden variables, the seed, fired
events and the variant in `mission_state_private` (RLS on, no client grants);
the rest in `mission_state` (family-readable). `mergeFromStorage` reverses it
inside the store.

**Six Names compatibility.** Its canonical tracker stays in `custom.tracker`
exactly as before; `readVariable` exposes it read-only as `tracker.<dimension>`.

---

## 4. Conditions (F2) — `conditions.ts`

One evaluator for routing, reveals, unlocks, gates, events, option
availability, Mission Control, media and completion.

```
Condition = {all:[…]} | {any:[…]} | {not:…} | {always:true}
          | {ref, op, value?}
op  = eq neq gt gte lt lte exists not_exists contains in
ref = var choice multi response visited revealed unlocked handoff event attempts variant elapsed{since}
```

Pure and total: malformed or mistyped input evaluates to false, never throws;
exceeding the depth limit fails the whole evaluation. Time (`elapsed`) uses
server time only. Legacy reveal conditions and completion rules are
*translated* (`fromLegacyReveal`, `fromLegacyCompletion`), never evaluated
separately — the legacy `response_exists` reveal keeps its original
"screen visited" meaning.

---

## 5. Runtime (F3) — `runtime.ts`

`step(model, state, currentKey, interaction, now)`:

1. refuse `custom`, a non-current screen, an unknown type;
2. checkpoint not yet open → failure `not_yet_available`;
3. `retry` → clear this screen's input only (D-78); `timer_expired` → accepted
   only if server time agrees;
4. contract `accepts` (enforced) and `validate` → a failure counts an attempt
   and moves nothing;
5. contract `apply` → legacy canonical tracker → screen and option effects;
6. `settle`: unlocks, then events (effects, `event:` mark, optional `goto`);
7. Trail evidence from the screen's marker (F6);
8. completion (definition condition, else pinned rule);
9. next: event `goto` → contract route → ordered `routes` → chosen option →
   `next` → sequence, then **gates** (`requires`/`otherwise`);
10. entering a screen: clear screen-scoped variables, `screen:` mark,
    checkpoint mark, `screen_entered` event.

`startRun` initialises once per run from a server-generated seed: declared
defaults → variant (weighted, age-band filtered) → pool draws (mulberry32).
Pause/resume and later logic always see the same variant and draws.

---

## 6. Interaction contract (F4) — `contract.ts`

Each screen type is one contract:

| Member | Meaning |
| --- | --- |
| `accepts` | Interaction kinds the screen takes — **enforced** |
| `validate` | Server-side input check → `{ok}` or `{code, message}` |
| `apply` | State change, response to store, `stay`, input text, effects, route, events |
| `secrets` | Config keys removed by the projection |
| `project` | Client-safe configuration (must stay schema-valid) |
| `samples` | (library types) inputs the QA simulator should try |
| `lint` | (library types) type-specific authoring checks |

Interaction kinds: the legacy `visit · choice · response · reveal ·
multi_choice · tracker · handoff`, plus `submit` (contract-defined value),
`retry`, `timer_expired`. `custom` is server-authored only.

---

## 7. Projection (F3) — `projection.ts`

The only thing a browser receives. Removes routing, gating, effects,
conditions, contract secrets, option destinations, unopened reveal content,
hidden variables, the seed, fired events and the variant; interpolates
`{{var.key}}` with **visible** variables only; filters support and media by
condition; adds `view` (`revealed`, `timerSeconds`, `canRetry`, `attempts`,
`waitSeconds`, `trail`). Learner Preview renders the same projection.

---

## 8. Storage and security (D-80)

| Table | Clients | Engine |
| --- | --- | --- |
| `mission_progress` | SELECT own | via `engine_save` |
| `mission_state` | SELECT own | via `engine_save` |
| `mission_state_private` | **none** | via `engine_save` / `engine_load_run` |
| `mission_responses` | SELECT own | via `engine_save` |
| `mission_evidence` | SELECT own | via `engine_save` |
| `mission_versions.definition` | **none** (column grants) | `engine_load_run`, draft RPCs |
| `analytics_events` | none | via `engine_save` / `engine_record_events` |

`engine_load_run`, `engine_save` and `engine_record_events` are executable by
`service_role` only. The store calls them with a progress id obtained from an
authorised read — never from the browser. Legacy write RPCs are revoked from
clients. Start RPCs (`start_mission`, `child_session_start_mission`) remain
client-callable: they only create a run at its first screen.

**Rollback / recovery.** All foundation migrations are additive (new columns
with defaults, new tables, new functions) plus revokes. Recovery of data is
not required to roll back; re-granting writes would reintroduce D-80 and must
not be done. Existing runs needed no data migration (verified: 38/38 runs
received an analytics key; Six Names in-flight runs play unchanged).

---

## 9. Automated mission QA — `validator.ts`

Static checks over the model plus **simulation** through the real runtime
along every decision and sample input (bounded; variants explored). Runs
while authoring (builder), before review and before publish
(`setVersionStatusAction`). The database's `validate_mission_version` (0028)
stays as the second line inside `set_mission_version_status`.

Codes: `no_screens, duplicate_sequence, invalid_config, unknown_screen_type,
broken_reference, dead_end, unreachable_screen, cannot_reach_complete,
missing_convergence, bypassable_required_content, reveal_without_trigger,
unlock_without_condition, unknown_event, handoff_without_return,
non_persisted_state, undeclared_variable, invalid_effect,
unsatisfiable_condition, conflicting_dependency, incomplete_variant,
pool_too_small, missing_asset, missing_alt_text, missing_transcript,
missing_captions, no_completion_rule, no_completion_screen` (blocking) and
`shadowed_route, unlock_never_gained, event_never_fires, short_timer,
hidden_timer, gamification_language, long_sentence, age_band_outside_mission,
missing_kit_resource, single_option_decision, screen_without_title`
(advisory). Library contracts add their own via `lint` (e.g. device fallback).

---

## 10. Analytics (F5, D-76)

Events are drafted by the runtime and contracts, written by `engine_save` in
the same transaction as the state they describe, keyed to a random per-run
`analytics_key` (never a child), with a structural `screen_key` and an
allow-listed `detail` (DB check constraint). Client-reported events (Mission
Control, Kit, device fallback) go through one allow-listed server action.

---

## 12. The interaction library (D-86) — `interactions/`

`schemas.ts` (configuration), `contracts.ts` (server behaviour), `lint.ts`
(authoring checks), `catalog.ts` (builder families + working starter
templates); components in `components/mission/screens/library.tsx`. Every type
takes `submit`; the contract checks the value's shape against the ids the
screen offers before anything changes.

| Plan §4 form | Type · mode |
| --- | --- |
| single choice · multiple selection · short text | `choice` · `multi_choice` · `response` (existing) |
| numeric entry | `numeric_entry` |
| code · word/phrase · passphrase · cipher validation | `code_entry` · `mode` |
| symbol/token sequence | `token_sequence` |
| sorting · sequencing · reordering · ranking · drag-and-drop | `arrange` · `sort` / `sequence` / `rank` |
| matching | `matching` |
| sliders · weighting · resource allocation | `allocate` · `sliders` / `weighting` / `allocation` |
| inventories | `inventory` (persists in a list variable) |
| side-by-side comparison · decision matrices | `compare` · `comparison` / `matrix` |
| image hotspots · annotation | `hotspot` · `find` / `annotate` |
| simple drawing | `sketch` (not stored unless `store`) |
| maps · route building · node/connection building | `map` · `route` / `network` |
| pattern building | `pattern_grid` |
| simple simulation controls | `simulation` (server-evaluated readouts) |
| reset / retry / retest | runtime `retry` (any screen with `retry.allowed`); simulation re-run |
| persistent workspace | `workspace` + definition `workspaces` |

**Graded input.** `outcomes: [{id, match, next?, effects}]` and `onNoMatch
{mode: retry|continue, message, next?, effects, fallbackAfter?, fallbackNext?}`
are server-only. A match records `state.outcomes[screen] = id`; a miss either
costs an attempt (shown as calm guidance, D-87) or records `no_match` and
continues; after `fallbackAfter` attempts it continues to `fallbackNext`
(interaction recovery). No outcomes = open-ended: any valid input is recorded.

**New condition refs:** `{outcome: screenKey}` and `{placed: "board.object"}`.

**What the page never receives:** outcomes, onNoMatch, storeAs (including a
control's), simulation readout conditions (the server sends the text that
applies), inventory items or board objects whose `when` does not hold.

**Workspace.** Defined once (`definition.workspaces`: zones, objects with
optional `when`, links); any number of screens show it (`arrange` or
`review`). The arrangement persists in `state.workspaces[key]` across screens
and sessions; objects arrive as their conditions hold; earlier arrangements
can be revised.

---

## 13. Assets and media (F7, D-89) — `media.ts`, `store.signMedia`

`mission_assets` (0032) holds a version's media — image, diagram, map,
animation, audio, video — with alt text, long description, transcript and
captions. Private bucket `mission-media`. No client role reads either.

* **Referencing:** a screen's `media: [{asset, display, caption, when,
  compareWith, labels, layers}]` (display: inline · zoom · before_after ·
  layers), or the string `"asset:<key>"` anywhere a configuration asks for an
  image (hotspot image, map background).
* **Release gating:** the projection drops media whose `when` does not hold;
  `loadStageVia` then signs (one hour, service role) exactly the keys the
  projected current screen references, at the run's pinned version.
  Preview signs draft media with the admin's own session.
* **Immutability:** rows follow `guard_immutable_mission_version`; published
  files cannot be deleted; new versions and duplicates copy rows (and the
  duplicate action copies files).
* **Accessibility is enforced twice:** at upload (text alternative for
  visuals, transcript for audio, captions or transcript for video) and by
  the validator before publish (`missing_alt_text`, `missing_transcript`,
  `missing_captions`, `missing_asset`).
* **Rendering:** `components/mission/media-blocks.tsx`, shown by every
  screen's frame under the body. No autoplay; zoom opens a dialog;
  before/after is a named choice, not a slider; layers are checkboxes.

---

## 14. Physical ↔ digital mechanics (D-93, D-94)

| Mechanic | Where | Server rule |
| --- | --- | --- |
| Timed stage | `timer` on any screen; `MissionTimer` | expiry accepted only by server time (±2 s) |
| Checkpoint | `definition.checkpoints[].availableAfter` | `checkpointWait`; step refused until open |
| Kit QR | `definition.qr`; `/q/<mission>/<code>` | `applyQr`: once, if `when` holds, never moves the child |
| Printable | `definition.prints`; screen `prints`; `/api/print/...` | pinned Kit PDF + run values, per request, no-store |
| Device input | `device_input` (compass · tilt · motion) | graded like any library input; manual route equal |
| Camera scan | `code_entry.scan` | client-only reading into the field; nothing kept |

A step for a screen the run has already left is a no-op returning the real
position (D-94).

---

## 11. Extending

* **New interaction type:** a module in `features/mission-engine/interactions/`
  exporting its config schema, contract (`accepts`, `validate`, `apply`,
  `project`, `samples`, `lint`), component and builder template; one enum
  value in a migration (`screen_type`). Nothing else changes.
* **New mission mechanic:** prefer a definition field consumed by the runtime
  over a new screen type.
* **Never:** branch on mission identity; evaluate a condition outside
  `conditions.ts`; send the browser anything but the projection; write run
  state outside `engine_save`.
