# Live database validation — Sprint 9

**Run:** 2026-09-26
**Against:** PostgreSQL 16.15, an isolated cluster created for this run, with a
minimal shim replicating Supabase's primitives — `auth.users`, `auth.uid()`
reading `request.jwt.claim.sub`, the `anon` and `authenticated` roles, and the
`storage` schema. Queries ran as `authenticated`, a non-owner non-superuser
role, so RLS applied exactly as it does in production.

**Not run against:** a hosted Supabase project.

---

## Scope of this validation — read first

> **This is NOT equivalent to validation against a hosted Supabase project,
> and must not be cited as such.**

What it genuinely establishes: the SQL is correct, and **Postgres itself
enforces the access rules** — RLS policies, the security-definer functions,
constraints, cascades and transaction behaviour all ran for real, as a
non-owner non-superuser role, against a real database engine. That is a
materially stronger claim than any source-level test, and it is what found the
`start_mission` regression.

What it does not establish: anything above the database. Supabase is Postgres
**plus** PostgREST, GoTrue, Storage and their configuration. Every one of those
was shimmed or absent. A defect in the API layer, the auth service, bucket
policies or the Next.js client would not have shown up here.

Three sections follow, and they are deliberately separate:

1. **Discovered and fixed during live validation**
2. **Verified against the real PostgreSQL / RLS environment**
3. **Still unverified — requires a hosted Supabase project**

---

## 1. Discovered and fixed during live validation

**A real defect that source-level tests could not see.**

The screen_access migration removed every client read policy from
`mission_screens`.
`start_mission` was `security invoker`, so it runs as the calling
`authenticated` role — and lost its read access along with everyone else. Its
lookup of the mission's first screen silently returned NULL.

The observable effect: **every newly started mission would have opened on
"this mission isn't ready to start yet"**, because `current_screen_key` was
null and `get_current_mission_screen` then correctly returned nothing.

Fixed in `20260925220700_start_mission_access.sql` by making `start_mission` a
`security definer`, consistent with `get_current_mission_screen`. It already
re-established ownership and entitlement itself, so nothing is weakened —
`auth.uid()` still reflects the caller. A regression guard now asserts that any
function reading `mission_screens` is definer and performs both checks.

---

## 2. Verified against the real PostgreSQL / RLS environment

All eight requested checks, plus five more the live environment made cheap.

| #   | Check                                             | Result                                                            |
| --- | ------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | All eight migrations execute cleanly              | 15 tables, 4 functions, no errors                                 |
| 2   | Authenticate as a real parent                     | `auth.uid()` resolves from the JWT claim                          |
| 3   | **Entitled client cannot read `mission_screens`** | **0 rows** as entitled parent; **0 rows** as anon                 |
| 3b  | Control — tables that should be readable are      | own children: 2 · published missions: 1                           |
| 4   | **Gated RPC returns only the current screen**     | 1 row · `mission_brief` · `next=prepare` · body present           |
| 5   | **Later Evidence unavailable before its stage**   | 0 rows from RPC; 0 rows from a direct table read                  |
| 6   | **Non-current consequence unavailable**           | at `consequence1_b`, siblings `1_a`/`1_c` and `later_evidence`: 0 |
| 7   | **Cross-family access blocked**                   | `get_current_mission_screen` raises `not_your_child`              |
| 7b  | Non-entitled sibling blocked                      | `start_mission` raises `not_entitled`                             |
| 8   | **Completion creates Trail evidence**             | 4 rows — 3 physical, 1 digital                                    |
| 8a  | Digital evidence carries the response, no file    | `storage_path = null`, description = the child's text             |
| 8b  | **Trail creation is idempotent**                  | second call: still 4 rows                                         |
| 8c  | `completed_at` does not move                      | 1 distinct value across both calls                                |
| 8d  | A completed mission is terminal                   | re-start returns `complete`, does not reset                       |

### Additional checks

| Check                              | Result                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| Cross-family RLS on learner data   | parent B sees 0 of parent A's progress, evidence and responses     |
| Client cannot forge an entitlement | insert rejected: "new row violates row-level security policy"      |
| Child deletion cascade             | evidence 4→0, progress 1→0, responses 1→0, state 1→0               |
| `on_auth_user_created` trigger     | fired on user creation; profile existed without an explicit insert |
| Seeds apply                        | 1 mission, 21 screens, 5 resources                                 |

The cascade result also confirms the deletion confirmation copy is truthful:
removing a child really does remove progress, responses and Mission Trail
evidence.

---

## 2b. Verified locally by automated tests only — a weaker claim

205 tests, clean typecheck, lint and build. These prove the **intended
mechanism in the codebase**: the mission engine's branching, reveals, resume,
completion evaluation and state transitions; Six Names conformance to Build
Brief v0.2; and the structural guards.

Where a test asserts SQL or TypeScript _source text_, it proves the protection
is present and cannot be removed silently. **It does not prove the database
enforces it** — which is precisely the gap the 0008 defect fell into.

---

## 3. Still unverified — requires a hosted Supabase project

Six gaps. None is closed by anything above, and each needs the hosted stack:

| #   | Gap                                  | Why the local run could not cover it                                                                                                                     |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PostgREST / API path**             | The `/rest/v1/` HTTP surface was never exercised. RLS is the mechanism and is verified at the database, but the API layer that applies it was absent.    |
| 2   | **GoTrue authentication flows**      | Signup, email confirmation, password reset and session refresh. `auth.uid()` was shimmed faithfully; the service that issues the JWT was not running.    |
| 3   | **Storage policies and signed URLs** | `storage.objects` was a plain shimmed table. Bucket policies applied syntactically, but no file was uploaded or fetched and no signed URL was issued.    |
| 4   | **Stripe**                           | Entirely unexercised. Signature verification, webhook delivery, retry and duplicate handling. No key has ever been used.                                 |
| 5   | **Concurrency / race conditions**    | Simultaneous `start_mission` calls; two webhook deliveries racing for one event id. Both are single-transaction by construction; neither has been raced. |
| 6   | **Next.js → Supabase end-to-end**    | Every check above was SQL issued through `psql`. The application has never run against a real database.                                                  |

Detail on each:

- **PostgREST** — the actual `/rest/v1/mission_screens` HTTP path. RLS is the
  mechanism and it is now verified at the database, but the API surface itself
  has not been exercised.
- **Supabase Auth (GoTrue)** — real signup, email confirmation, password reset
  and session refresh. `auth.uid()` was shimmed faithfully but GoTrue was not
  running.
- **Storage policies** — `storage.objects` was shimmed as a plain table. The
  bucket policies in 0001 are syntactically valid and applied, but no file was
  uploaded or fetched, and no signed URL was issued.
- **Stripe** — signature verification, webhook delivery, retry and duplicate
  handling, and the `stripe_events` claim under genuine concurrency. Entirely
  unexercised; no key has ever been used.
- **Concurrency** — simultaneous `start_mission` calls, and two webhook
  deliveries racing for the same event id. Both are single-transaction by
  construction, neither has been raced.
- **The Next.js path end to end** — every check above was SQL. The application
  has never run against a real database.

---

## 4. Remaining open decisions — none resolved or assumed here

- **OPEN-14** — retention and deletion policy. Unresolved by instruction. The
  cascade above is current behaviour, not an approved policy.
- **OPEN-13** — four Mission Kit printables need print-ready PDFs at the seeded
  Storage paths. `published` stays `false`.
- **C9-6** — the eight content items in Build Brief §11 remain subject to WLA
  approval. All copy is in one seed file; revising it touches no engine code.
- **OPEN-02 remainders** — Fraunces axis settings, letter-spacing, and
  responsive type sizes. Needs the Lovable CSS export or mobile screenshots.

**None of these is affected by the live validation, and none has been resolved
or assumed.** The next step is a decision about how to handle hosted Supabase
validation alongside these.

---

## Status

**Sprint 9: closed**, subject to the six gaps in section 3.
Sprint 10 not started.

---

# Six Names v2 reconciliation — live validation

**Run:** 2026-09-27
**Against:** PostgreSQL 16.15, an isolated cluster created for this run, with
the same minimal Supabase shim (`auth.users`, `auth.uid()`, the `anon` /
`authenticated` / `service_role` roles, the `storage` schema). Queries ran as
`authenticated`, a non-owner non-superuser role, so RLS applied as in
production.

**Not run against:** a hosted Supabase project. Every gap in section 3 above
still stands — PostgREST, GoTrue, Storage policies, Stripe, concurrency, and
the Next.js path end to end.

## Discovered and fixed during this run

**The key of an unused branch was being disclosed.**

A child sitting on the Decision 1 consequence for "Ask about the list"
received:

```
screen_key        = consequence1_ask
next_sequence_key = consequence1_stop
```

`next_sequence_key` is the next screen _by sequence_, and the two Decision 1
consequences are adjacent. No content leaked — `mission_screens` still has no
client read policy and the sibling's body was never retrievable — but the
browser was told the name of a branch that child will never reach.

`next_sequence_key` is the last fallback in `resolveNextScreen`, used only when
a screen declares no destination of its own. Every v2 screen declares one, so
the value was sent and never read. `20260927100100_withhold_unused_next_key.sql`
withholds it in exactly that case: when the screen has a top-level `next`, or
is a `choice` whose every option has one. Screens that genuinely rely on
sequence order — every version 1 screen — still receive it.

Confirmed after the change: at `consequence1_ask` and at `decision1`, the key
is withheld.

## Verified against the real PostgreSQL / RLS environment

| #   | Check                                                      | Result                                                    |
| --- | ---------------------------------------------------------- | --------------------------------------------------------- |
| 1   | All twelve migrations execute cleanly                      | no errors                                                 |
| 2   | All five seeds apply                                       | v1 21 screens, v2 27 screens, both intact                 |
| 3   | `start_mission` pins the CURRENT version                   | `mission_version = 2`, opens on `the_list`                |
| 4   | **Entitled client cannot read `mission_screens`**          | **0 rows**                                                |
| 5   | **Gated RPC returns exactly one screen**                   | `the_list`, with its own `next`                           |
| 6   | **Unused Decision 1 consequence unreachable**              | at `consequence1_ask`: **0 rows** for `consequence1_stop` |
| 7   | **Evidence unreachable before its stage**                  | **0 rows**                                                |
| 8   | Evidence served only when it IS the current screen         | `PROJECT EQUIPMENT CHECK` returned at `evidence`          |
| 9   | **Unused Decision 2 consequences unreachable at Evidence** | **0 rows**                                                |
| 10  | **Cross-family access blocked**                            | raises `not_your_child`                                   |
| 11  | **Completion creates the right Trail**                     | 3 rows, all `physical`                                    |
| 12  | Nothing digital, nothing stored as a file                  | `digital = 0`, `storage_path is not null = 0`             |
| 13  | **No text was ever collected**                             | `mission_responses` = **0 rows**                          |
| 14  | Canonical tracker survives completion                      | Clarity = `Purpose clear`, Spread and Support unchanged   |
| 15  | Trail creation is idempotent                               | second `complete_mission`: still 3 rows                   |
| 16  | One `get_current_mission_screen` overload only             | `count = 1` (the 0008 lesson holds)                       |

## Verified by the graph walk

The v2 screen graph was read back **out of the database** and traversed for all
six routes. For every route: only the selected consequences and tracker
confirmations are reachable, the Changed List falls between Decision 1 and
Decision 2, Evidence falls after Decision 2, and the route ends at `complete`.
No dangling target, and no screen relies on sequence fallthrough.

## Still unverified

Everything in section 3 above. Additionally:

- **The Academy screens have not been played by a real child through the
  browser.** The authenticated Academy routes talk to hosted staging, which was
  not signed into. The new screen types were rendered from fixture data and
  measured at 375 / 768 / 1024 / 1512 — 0 horizontal overflow at every size —
  but the mission has not been played end to end in a browser against a
  database.
- **The hosted staging project has not been updated.** No migration or seed was
  pushed. Staging still runs version 1.
