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

---

# Hosted staging — Six Names v2 integration and QA

**Run:** 2026-09-28
**Against:** the hosted staging project `WLA Academy- staging`
(`zvquddwdcysgrcuvywqw`, PostgreSQL 17.6, eu-west-1) — **not** a shim. This
closes gaps 1, 2, 3 and 6 of section 3 above for the Six Names path: PostgREST,
GoTrue, Storage policies and the Next.js application were all exercised for
real. Stripe (gap 4) and concurrency (gap 5) remain unexercised.

## What was applied

Three migrations (`20260927100000`, `20260927100100`, `20260927110000`) and
four seeds. Staging was on 11 of 14 migrations and running mission version 1;
it is now on 14 of 14 and version 2. All six Mission Kit PDFs were uploaded to
the private `mission-resources` bucket.

Verified **after** the push rather than assumed from its exit code, per D-37.

## D-17 holds in production

A pre-existing in-progress run was on staging, pinned to `mission_version = 1`
and sitting on the v1 screen `tracker1`. After the upgrade it is **unchanged**:
still v1, still on `tracker1`, with its own v1 state (`decision1_move: 'b'`).
New runs pin to version 2. Version 1's 21 screens remain intact beside version
2's 27.

## Verified on hosted staging

| Check                            | Result                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| Mission version / published      | `version = 2`, `published = false`                                   |
| Screens                          | v1: 21 · v2: 27                                                      |
| Completion rule                  | all five conditions, including `screen_visited: final_judgement`     |
| Mission Kit                      | 5 resources, Child Mission first, all six PDFs in Storage            |
| Child Mission PDF via signed URL | 200, 50,684 bytes, 8 pages, **sha256 identical** to the repo asset   |
| Entitled family                  | signed URL **granted**                                               |
| Other family, unentitled         | **400**                                                              |
| Anonymous                        | **400**                                                              |
| `/object/public/…`               | **400** — the bucket is private                                      |
| Unauthenticated direct object    | **400**                                                              |
| `mission_screens` direct read    | **0 rows** for entitled parent, other family and anonymous           |
| Cross-family isolation           | neither family sees the other's children, progress or entitlements   |
| Gated RPC, other family          | raises `not_your_child`                                              |
| Client forging an entitlement    | **403**                                                              |
| Screens served per request       | exactly **1**, always the current one                                |
| `next_sequence_key`              | **null** — D-42 is live; no unused branch key is disclosed           |
| Reflection branches              | unused option **labels** only; no consequence text in the payload    |
| Completed run                    | 3 physical Trail entries, no files, `mission_responses` = **0 rows** |
| Canonical tracker after Evidence | Spread and Support unchanged, Clarity → `Purpose clear`              |

## Browser QA — actually performed

Signed in as a real parent (session cookies produced by `@supabase/ssr` itself,
never typed into a form) against hosted staging.

**Route 1 (Ask about the list → Ask everyone to pause) was played end to end
through the browser** and reached `status = complete`: the list, Seen/Said/
Unknown, all three handoffs, both decisions, both consequences, both tracker
confirmations, the Changed List, the revisit, the stopping point, Evidence,
Judgement, reflection and Final Judgement.

The other five routes were driven through the **gated RPC as an authenticated
parent** — the same path the application uses — asserting per route that only
the selected consequences and tracker confirmations are reachable, that no
unused consequence appears, that the Changed List falls between the decisions
and Evidence after Decision 2. All five passed.

Pause/resume, Mission Control and responsive layout were exercised in the
browser. Zero horizontal overflow at 375, 768, 1024 and 1512 across My
Missions, Mission Home, Mission Kit and Active Mission.

## Found and fixed during this run

`resolveMissionCover` dropped the cover image's written description whenever
`cover_image` was set, so the photograph was described locally and undescribed
on staging. Fixed, regression-tested, mutation-tested — see D-47.

---

# Academy completion pass — 2026-09-28

**Against:** hosted staging (`WLA Academy- staging`, PostgreSQL 17.6) and a
clean local PostgreSQL 16 cluster. Six Names remained `published = false`
throughout.

## Migrations

11 → 14 → **16**. Added this pass:

- `20260928100000_analytics_and_admin_stats.sql` — ANALYTICS-01, plus the
  admin's per-mission counts and version usage.
- `20260928100100_lock_is_admin.sql` — closes the privilege escalation below.

All 16 apply cleanly **from an empty database**, followed by all 6 seeds.

## Found and fixed during this pass

**1. Privilege escalation — any parent could make themselves an administrator.**

```
set role authenticated;
set request.jwt.claim.sub = '<any parent>';
update profiles set is_admin = true where id = '<their own id>';
-- succeeded
```

0001's `parent updates own profile` policy had no `with check` and no column
restriction; 0002 later added `is_admin` to that table. An admin can edit the
mission catalogue and what is charged, so this was a real escalation, live on
staging. Closed with two independent locks (D-49), each verified to hold on its
own. Confirmed on staging afterwards: self-promotion returns **403**, renaming
still returns **204**.

Two details made the first attempt silently useless and are recorded because
they will recur: a **column-level REVOKE is a no-op while a table-level GRANT
exists**, and **`current_user` inside a `security definer` function is the
function OWNER**, not the caller.

**2. A `"use server"` module exported a non-async value.**

`actions.ts` exported `emptyAdminState`. Next refuses that, so importing the
module threw at evaluation and the whole editor PAGE 500'd — not just the save.
Typecheck, lint and the unit suite were all green; only a real browser POST
surfaced it. Moved to `schemas.ts`, with a guard that now scans every
`"use server"` file in the repository.

**3. Accessibility defects (WCAG 2.2 AA).** Audited on 12 rendered pages:
pages whose only heading was an `h2` (full-page empty/error states), `h1 → h3`
skips on My Missions, Mission Kit and Mission Trail, several sub-24px targets,
and `<a>` wrapping `<button>` in nine places — invalid HTML, and the reason a
211×22 target was sitting around a correctly sized one. All fixed; the audit
now reports **0 issues** across all 12 pages.

## Verified on hosted staging

| Check                                       | Result                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Migration state                             | 16 of 16 applied, none pending                                           |
| Six Names                                   | version 2, **published = false**                                         |
| Parent self-promoting to admin              | **403**, `is_admin` unchanged                                            |
| Parent renaming themselves                  | 204                                                                      |
| `admin_mission_stats` as a parent           | `not_admin`                                                              |
| `analytics_events` read by a parent         | **0 rows** (RLS on, no policy)                                           |
| Ordinary parent reaching `/admin`           | redirected to the Academy                                                |
| Anonymous reaching `/admin`                 | redirected                                                               |
| Admin editing the catalogue                 | saved; `published`, `version`, `completion_rule` and price all unchanged |
| Analytics on a real start                   | one row: name, mission, version, timestamp — **no child id**             |
| Forging an event for another family's child | `not_your_child`                                                         |
| Six Names, all six branches                 | **6 / 6 PASS**                                                           |
| Accessibility, 12 pages                     | 0 issues                                                                 |
| Responsive, 16 page×width combinations      | 0 horizontal overflow                                                    |

## Still unverified

- **Stripe end to end.** No `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`
  exists in this environment, so checkout, the webhook, entitlement creation
  and idempotency have never been exercised against Stripe. The code path is
  covered by unit tests only.
- **Transactional email.** No `RESEND_API_KEY` or `EMAIL_FROM`, so
  `sendMissionAccessEmail` has only ever taken its not-configured branch.
- **Concurrency.** Simultaneous `start_mission` calls and racing webhook
  deliveries remain single-transaction by construction and un-raced.

---

# Final integration pass — 2026-09-28

Migrations **16 → 18**. All 18 apply from an empty database, followed by all 6
seeds. Staging is at 18/18, none pending. Six Names stayed `published = false`.

## Found and fixed

1. **Free access required Stripe credentials.** `createAdminClient()` validated
   all five environment variables together, so a free-mission grant threw
   whenever Stripe was unconfigured. Split per service (D-53).
2. **An administrator could rewrite `missions.version`, and delete missions.**
   `PATCH {"version": 99}` succeeded against staging — verified, then restored
   to 2 immediately. Scoped to catalogue columns (D-54).
3. **Over-redaction in the logger** dropped `error.name` and the analytics
   event name (D-55).

## Stripe — what was and was not tested

**Not tested end to end.** No `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`
exists in this environment, so no Checkout session was created and no webhook
was ever delivered. No payment was simulated and nothing was weakened to make a
test pass.

What WAS established, at the database boundary rather than in the UI:

| Check                                  | Result                                                             |
| -------------------------------------- | ------------------------------------------------------------------ |
| Duplicate webhook delivery             | second `stripe_events` insert rejected by primary key              |
| Duplicate entitlement grant            | 1 row after two identical grants (`unique (child_id, mission_id)`) |
| Client inserts `mission_entitlements`  | RLS violation                                                      |
| Client inserts `stripe_events`         | RLS violation                                                      |
| Client inserts `checkout_intents`      | RLS violation                                                      |
| Other family reads a checkout intent   | 0 rows                                                             |
| A `purchase` entitlement grants access | buyer starts and reads their screen                                |
| Unrelated family with no entitlement   | `not_entitled` / `not_your_child`                                  |

Plus 45 source-level commerce tests covering price provenance, child
resolution from `checkout_intents` rather than Stripe metadata, signature
verification, unpaid sessions, amount reconciliation and claim release.

**Remaining configuration:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, a webhook
endpoint registered for `checkout.session.completed`, and a published priced
mission to buy.

## Email — what was and was not tested

**No message was sent.** No `RESEND_API_KEY` or `EMAIL_FROM` exists. Verified
behaviourally in its real unconfigured state: returns
`{ sent: false, reason: "not_configured" }`, never throws, and logs neither the
recipient nor the child's name.

**Remaining configuration:** `RESEND_API_KEY`, `EMAIL_FROM` with a verified
sending domain, and `NEXT_PUBLIC_SITE_URL` for the link.

## Verified live in this pass

20/20 security checks at the server/database boundary · 6/6 Six Names branches
· D-17 holds (the pre-existing run is still pinned to v1 on `tracker1`) ·
accessibility 0 issues across 14 pages · responsive 0 overflow across 16
page×width combinations · admin editor saves without touching `published`,
`version`, `completion_rule` or price.

---

# Fresh-database version lifecycle — 2026-10-10 (D-111)

**Found:** building a local Supabase stack from scratch for the Six Names demo,
Six Names came up with **0 `mission_versions` rows** and its Kit and parent note
at **v1** while `missions.version` is 2. A v2 run found no Kit and no note, and
`private.mission_file_released` refused every Kit file even once uploaded.

**Cause:** the backfills in `20260929100000` and `20260929110000` act on rows
that already exist. Staging had its seeds first; a fresh database runs every
migration, then the seeds. The 2026-09-28 "applies from an empty database"
results above pre-date both migrations and stand. From 2026-09-29 the harness
(`scripts/local-db.sh`) re-ran the backfill by hand with the immutability
triggers disabled, so the regression runners never saw the real path.

**Fixed:** `private.backfill_mission_version_lifecycle()`, called by the last
seed. The harness now runs that seed — no manual backfill, no disabled trigger.

| Check (throwaway PostgreSQL 16 cluster, real migrations + seeds) | Result |
| ----------------------------------------------------------------- | ------ |
| `scripts/run-version-lifecycle.sh`                                | **64 / 64 PASS** |
| …the same suite on the pre-fix path (no lifecycle seed)           | 19 FAIL — reproduces the bug |
| `scripts/run-six-names-branches.sh` (now on the real path)        | 64 / 64 PASS |
| `scripts/run-security-regression.sh` (now on the real path)       | 166 / 166 PASS |
| Six Names v2 `validate_mission_version`                           | 0 blocking, 0 advisory |
| Re-applying the migration to a populated database                 | succeeds, 0 initialised, no row changed |

**Not run:** a true `supabase db reset` — on the working local stack it would
erase the demo account and its Stripe test purchase. The working local stack
has not had the migration applied (it predates the commit); every throwaway
cluster above has.

## Hosted staging deployment — 2026-10-11

Commit `2905cd7` pushed to `origin/academy-mvp` (fast-forward from `ec1bcab`),
then migration `20261010120000_seeded_mission_version_lifecycle` applied to
hosted staging. Staging is now at **`20261010120000`** (38 migrations). No
frontend was deployed: there is no staging frontend, and GitHub shows no
Vercel status or deployment on the repo. Production untouched.

**Re-run before pushing `2905cd7`:** the three runners above (64 / 64, 64 / 64,
166 / 166), `npm test` (751 / 751, 39 files), `npm run typecheck` and
`npm run lint` clean.

**How it was applied:** `supabase db push --db-url <session pooler> --skip-vault`
(CLI 2.116.0), no `--include-seed`. In that version each migration file and
its history row go to the server as one pipelined batch — one implicit
transaction — so a failure would have left neither. The seed is not needed on
an environment whose missions already have a lifecycle.

| Check | Before | After |
| ----- | ------ | ----- |
| Pending migrations (local vs staging) | only `20261010120000` | none — 38 applied, matching the 38 local files |
| `--dry-run` | lists only `20261010120000`; seeds `[]`, roles `[]` | — |
| Missions with no version rows / partial lifecycle | 0 / 0 | 0 / 0 |
| Function `private.backfill_mission_version_lifecycle()` | absent | owner `postgres`, SECURITY INVOKER, `search_path=public`; EXECUTE held only by `postgres` (not PUBLIC, `anon`, `authenticated`, `service_role`) |
| Missions (24), version rows (31), screens (211), Kit rows (28), parent notes (20) | digest | identical |
| Entitlements (131), progress (110), state (110), responses (103) | digest | identical |
| Six Names | unpublished, not free, £12.00 GBP, v2 | unchanged |
| Builder Bridge | unpublished | unchanged |
| Published missions | 0 | 0 |

The only differences before → after were the migration count and the
function's existence. A close-out re-check (read-only transactions) matched
both the post-deploy snapshot and the earlier post-QA snapshot byte for byte:
the QA gift entitlement for Six Names is still active with its child profile,
access credential and sessions unchanged, and its run is still in progress on
v2 with state and responses unchanged.

Before deploying, staging's mission flags were restored after manual QA had
published Six Names (free) and Builder Bridge: one guarded transaction, one row
each, `published` / `is_free` only, all QA data kept.
