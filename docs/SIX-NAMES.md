# Six Names — implemented mission structure

**Source of truth (2026-09-27):**

| Document                           | Authority for                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| SIX NAMES — ACADEMY BUILD BRIEF    | Academy screens, behaviour, branching, state, persistence, Mission Control, completion             |
| Six Names Child Mission            | The physical activity — Case Board, tracker, Concern cards, Judgement cards, Final Judgement, Grow |
| Six Names Mission Note for Parents | Parent preparation, role, safety, outcomes, Mission Trail explanation                              |

These supersede Mission Build Brief v0.2, from which **version 1** was authored.

---

## Why version 2 rather than an edit

D-17 pins an in-progress run to the mission version it started with. The shape
changed substantially, so rewriting version 1's screens underneath a live run
would have broken it. Version 1 rows are untouched; `missions.version` is now
`2`, and new runs pin to it.

`supabase/seed/six_names_v2_screens.sql` deletes and re-inserts **version 2
only**. A guard asserts it never touches version 1.

## What changed from version 1

| Version 1 (Brief v0.2)                         | Version 2 (Academy Build Brief)                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `mission_brief` + `prepare` screens            | Removed. Preparation is the Child Mission's PREPARE section, on paper        |
| —                                              | **Screen 2, Seen / Said / Unknown** — seven items, shuffled, classified      |
| Concern cards as `multi_choice`, **persisted** | Handoff states. The choice is physical and **nothing is recorded**           |
| Decision 1 with three options                  | **Two** options, each with its full response text                            |
| Three Decision 1 consequences                  | **Two**                                                                      |
| Interactive `tracker` the child filled in      | **`tracker_confirmation`** — read-only canonical state per branch            |
| —                                              | **Screen 7, Seen / Said / Unknown Revisit** — three questions, no answer key |
| —                                              | **Screen 11, Good Stopping Point** — Continue or Pause Mission               |
| Evidence as a `content` screen                 | **`reveal`** — concealed until the child opens it                            |
| `judgement_reflection` as a stored `response`  | **`reflection`** — read-and-reflect, stores nothing                          |
| `final_judgement` as a stored `response`       | **`content`** — the Final Judgement stays on the physical card               |
| Trail: three physical + one digital            | **Three physical**, no digital, no upload                                    |

## The screen graph

Twenty-seven screens. Every one declares its own destination, so nothing
advances by sequence order.

```
the_list → seen_said_unknown → handoff_step3 → decision1
                                                  ├── ask_about_list        → consequence1_ask  → tracker1_ask  ─┐
                                                  └── stop_claim_spreading  → consequence1_stop → tracker1_stop ─┤
                                                                                                                 ↓
                          changed_list → ssu_revisit → handoff_step7 → decision2
                                                  ├── ask_everyone_pause → consequence2_pause     → tracker2_pause     ─┐
                                                  ├── share_the_role     → consequence2_share     → tracker2_share     ─┤
                                                  └── noor_steps_away    → consequence2_step_away → tracker2_step_away ─┤
                                                                                                                        ↓
                          stopping_point → evidence → handoff_step11 → judgement
                                                  ├── stand_by_both  → reflection_both ─┐
                                                  ├── reconsider_one → reflection_d1   ─┤
                                                  └── reconsider_two → reflection_d2   ─┤
                                                                                        ↓
                                                                          final_judgement → complete
```

Six valid routes. All six are driven end to end by the real reducer and real
navigation in `six-names.test.ts`, and were also walked against a live
PostgreSQL cluster.

## Canonical tracker state

The starting state is set physically by the child (Child Mission, SET UP):
Spread — Few · Support — Some support · Clarity — Guesswork.

| Stage                             | Spread          | Support           | Clarity           |
| --------------------------------- | --------------- | ----------------- | ----------------- |
| D1 · Ask about the list           | Groups          | Some support      | Guesswork         |
| D1 · Stop the claim spreading     | Groups          | Clearly supported | Guesswork         |
| D2 · Ask everyone to pause        | Nearly everyone | Clearly supported | Guesswork         |
| D2 · Continue, but share the role | Nearly everyone | Some support      | Guesswork         |
| D2 · Suggest Noor steps away      | Nearly everyone | Alone             | Guesswork         |
| Evidence opened                   | _unchanged_     | _unchanged_       | **Purpose clear** |

**It is written by the server, never by the browser.** The values live in the
screen's `canonicalTracker` configuration, which only ever reaches the
application through the gated RPC; `applyCanonicalTracker` merges them after
the child's own interaction, so nothing the client sent can overwrite them.
Evidence patches Clarity alone, which is how "new facts do not erase what
already happened" is enforced rather than merely stated.

## New screen types

Three, added by `20260927100000_six_names_screen_types.sql`. Each is a type of
interaction, not a mission (Tech Spec §62).

- **`sort_items`** — classify a shuffled set one item at a time against fixed
  categories, showing the authored classification after each selection and
  allowing correction. **No score exists anywhere**: not in the schema, not in
  state, not in the component. Nothing distinguishes a child who matched every
  classification from one who matched none.
- **`tracker_confirmation`** — a read-only statement of canonical state. It has
  no controls, which is the difference between confirming a tracker and
  collecting one.
- **`reflection`** — read-and-reflect. Optionally lists the options the child
  did _not_ choose, filtered using their own recorded choice. Collects nothing;
  Screen 14C's "which would you now consider?" selection is component state
  with no interaction kind to travel on.

`content` also gained `listObject` (the case object, with names marked struck
or added), `reflectionPrompts`, `secondaryAction` (Pause Mission) and
`canonicalTracker`; `choice` gained per-option `description` and `confirmNote`.

## State

Persisted, all through the existing engine:

mission status · current screen · confirmed Decision 1 · Decision 1 consequence
revealed (as a visit) · Decision 1 canonical tracker · Changed List reached ·
confirmed Decision 2 · Decision 2 consequence revealed · Decision 2 canonical
tracker · Evidence revealed · final Clarity · Judgement selection · completion.

**Not persisted, and with nowhere to be persisted:** tracker predictions (a
note on the decision screen, no field); physical Concern choices (no
`multi_choice` screen exists in the mission); Final Judgement text (the screen
is `content`); Screen 14 reflection text (no input in the `reflection` schema);
physical tracker movements; Mission Trail contents.

A live run confirmed `mission_responses` ends empty: **0 stored responses**.

## Mission Kit

Six Names Case Board · What's Changing? tracker and three counters · four
Concern cards · three Judgement cards · Final Judgement card · Child Mission.

The version 1 seed called the board the "Six Names Mission Board". All three
source documents call it the **Case Board**, and "Mission Board" is the name of
a deferred Academy-wide destination (Architecture §16, conflict C8) — so the
old title had a printable worksheet sharing a name with an unbuilt feature.
Retitled in `six_names_v2_kit.sql`; the storage path is unchanged, because it
is the same file.

All five printables now exist in `supabase/seed/assets/six-names/`. The Child
Mission PDF was supplied by the client on 2026-09-27 (8 pages, matching the
document the mission was authored from). While it was outstanding no substitute
was generated — the row was seeded and the Kit degraded honestly to its
unavailable state, per D-39.

The **parent note** is also supplied as a PDF. It lives in the same private
bucket under the mission's folder — not in `public/`, and not as a
`mission_resources` row, which would list adult guidance among the child's
printables. For Parents mints a signed URL and redirects to it, falling back to
the text note for any mission without a document. Verified live: the entitled
family sees the object, a non-entitled family and anonymous callers see none.

The remaining launch dependency is uploading the assets to Storage at the
seeded paths and flipping `published`.

## Security

Verified by executing the migrations and seeds against a real PostgreSQL 16
cluster as a non-owner `authenticated` role — see `docs/LIVE-VALIDATION.md`.
