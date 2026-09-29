# WLA Academy — Personal Review Access Pack

Prepared 2026-09-29. Uncommitted, staging only.

---

## 0. Read this first — where "staging" actually is

**There is no deployed staging frontend.** I inspected the deployment
configuration rather than assuming one existed, and found none:

| Looked for | Result |
| --- | --- |
| `vercel.json`, `.vercel/` | absent |
| `netlify.toml`, `Dockerfile`, `fly.toml`, `render.yaml`, `app.json`, `Procfile` | absent |
| `.github/workflows/` | absent |
| `next.config.ts` | present but effectively empty |
| `NEXT_PUBLIC_SITE_URL` | not set |
| `supabase/config.toml` → `[auth].site_url` | `http://127.0.0.1:3000` |
| git remote | `origin/academy-mvp`, last pushed commit 2026-09-27 (predates this work) |

So "staging" is **the hosted Supabase project only** —
`WLA Academy- staging`, ref `zvquddwdcysgrcuvywqw`, eu-west-1, `ACTIVE_HEALTHY`.

**Every URL in this pack is `http://localhost:3000/...`, served by the app run
on your machine against that hosted staging backend.** That is the only way to
review the Academy today. To start it:

```
cd /Users/user/Desktop/WLA
npm run dev          # http://localhost:3000
```

`.env.local` already holds the two variables the Academy review needs
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public by
design). Everything in sections 4–6 works with just those.

**What will not work, and why.** `.env.local` has no
`SUPABASE_SERVICE_ROLE_KEY`, no Stripe keys and no Resend key. So:

- `/purchase/six-names` — needs Stripe. Also 404s regardless, because Six Names
  is unpublished, which is correct and must stay that way.
- `/try-free` free-mission grant and `/redeem` gift redemption — need the
  service-role key.
- Password reset email — needs the mail provider.

None of those are on the Academy review path.

---

## 1. Review accounts

All three are QA-only accounts on `@wla-staging.test`, a reserved
non-routable TLD. No real personal address is involved. Email confirmation was
pre-set, so none of them needs an inbox.

| | Email | Password | Role |
| --- | --- | --- | --- |
| **A** | `wla-review-admin@wla-staging.test` | `WLA-Review-Admin-2026` | parent + `is_admin = true` |
| **B** | `wla-review-parent@wla-staging.test` | `WLA-Review-Parent-2026` | ordinary parent, `is_admin = false` |
| **C** | `wla-review-family@wla-staging.test` | `WLA-Review-Family-2026` | ordinary parent, `is_admin = false` |

Sign in at **http://localhost:3000/login**.

These are temporary review passwords for a staging backend and are the only
credentials disclosed anywhere in this pack. No service-role key, database
password, Stripe secret, webhook secret or session token appears here.

### Admin QA state cleanup

The earlier QA parent B (`qa-parent-b-…@wla-staging.test`) had been promoted to
`is_admin = true` during admin testing. It has **not** been deleted. Its
`is_admin` is revoked, verified at the database boundary rather than in the UI:

```
admin_mission_stats() as review-admin           → HTTP 200, returns the catalogue
admin_mission_stats() as review-parent          → HTTP 400  P0001 "not_admin"
admin_mission_stats() as review-family          → HTTP 400  P0001 "not_admin"
admin_mission_stats() as QA parent B (demoted)  → HTTP 400  P0001 "not_admin"

select email from profiles where is_admin       → exactly one row:
                                                   wla-review-admin@wla-staging.test
```

And through the app: `/admin` returns 200 only for account A; accounts B and C
are redirected to `/academy/my-missions`.

---

## 2. Route inventory

Read from the actual `src/app` tree (31 route files), then **probed live** —
anonymous and as each of the three accounts. "Status" columns below are measured,
not inferred.

### PUBLIC — no authentication

| URL | Purpose | Auth | Openable | Note |
| --- | --- | --- | --- | --- |
| `/` | Home | none | yes | real content |
| `/about` | About | none | yes | **stub** |
| `/journal` | Journal | none | yes | **stub** |
| `/labs` | Labs | none | yes | **stub** |
| `/missions` | Public catalogue | none | yes | **stub** |
| `/missions/[slug]` | Public mission detail | none | yes | **stub**; renders for *any* slug |
| `/reviews` | Reviews | none | yes | **stub** |
| `/gift` | Gift purchase | none | yes | **stub** |
| `/redeem` | Gift redemption | none | yes | needs service-role key to complete |
| `/try-free` | Free-mission entry | none | yes | real; grant needs service-role key |

Every page marked **stub** renders the line "Public-site stub. Copy is owned by
the Public Website Master." They are deliberate placeholders, not unfinished
Academy work. Because they carry no mission data, the fact that
`/missions/six-names` returns 200 while Six Names is unpublished is **not** a
content leak — it is the same stub `/missions/anything-at-all` returns.

### AUTHENTICATION

| URL | Purpose | Auth | Openable | Note |
| --- | --- | --- | --- | --- |
| `/login` | Sign in | none | yes | **start here**; honours `?next=` |
| `/signup` | Create account | none | yes | signed-in visitors bounce to My Missions |
| `/forgot-password` | Reset request | none | yes | email send not configured |
| `/auth/callback` | OAuth/confirm handler | none | no | route handler, not a page |

### ACADEMY — parent session required

`middleware.ts` protects `/academy` and `/account`: anonymous requests 307 to
`/login?next=<path>`.

| URL | Purpose | Auth | Openable | Recommended route in |
| --- | --- | --- | --- | --- |
| `/academy/my-missions` | Collection + status | parent | yes | **the Academy entry point** |
| `/academy/missions/six-names` | Mission Home | parent + entitlement | yes | from My Missions |
| `/academy/missions/six-names/kit` | Mission Kit (5 PDFs) | parent + entitlement | yes | Mission Home → Mission Kit |
| `/academy/missions/six-names/parents` | For Parents | parent + entitlement | yes | Mission Home → Read the parent note |
| `/academy/missions/six-names/active` | **Active Mission** | parent + entitlement + started run | yes | Mission Home → Start/Continue |
| `/academy/missions/six-names/trail` | Mission Trail | parent + entitlement | yes | Mission Home / Completion |
| `/academy/missions/six-names/complete` | Completion | parent + entitlement + complete run | yes | reached by finishing |
| `/account` | Account | parent | yes | header → Account |
| `/account/children` | Child profiles | parent | yes | Account → Children |
| `/account/children/new` | Add a child | parent | yes | Children → Add |
| `/account/children/[childId]` | Edit a child | parent + owns child | yes | Children → a child |
| `/account/password` | Change password | parent | yes | Account → Password |

**All Academy mission routes need an active child selected first.** With more
than one child and none chosen, they fall back to the "Whose missions?"
selector. Open `/academy/my-missions`, pick a child, then deep links work.

### MISSION — how many URLs the mission engine exposes

**Exactly one: `/academy/missions/six-names/active`.**

The 27 Six Names v2 screens are **not independently addressable, by design.**
There is no `/active/decision1`, no `?screen=` parameter, and no way to jump to a
screen. Which screen you see is decided server-side by
`get_current_mission_screen(child_id, mission_id)` from the child's persisted
position, and that RPC is the only path to screen content — `mission_screens`
has no client read policy at all, so future and concealed screens are never sent
to the browser.

I did not create shortcuts around this. Every review state in section 4 was
built by walking the real engine — `start_mission`, then
`get_current_mission_screen` / `persist_mission_state` per step, and
`complete_mission` at the end. To move a run to a given screen you play to it.

Verified while building the states:

```
get_current_mission_screen → returns exactly 1 screen per call, never a list
review-parent asking for Layla (another family's child) → P0001 "not_your_child"
review-parent asking for Bilal (own child)              → 1 screen: decision1
review-family: Idris → decision1   Layla → evidence     (same parent, isolated)
```

### ADMIN — `is_admin` required

`/admin` is **not** in the middleware's protected list; the gate is
`requireAdmin()` in `src/app/admin/layout.tsx`. The outcome is still correct —
an anonymous visitor is sent to `/academy/my-missions`, which middleware then
sends to `/login` — but it arrives in two hops rather than one.

| URL | Purpose | Auth | Openable | Measured |
| --- | --- | --- | --- | --- |
| `/admin` | Mission catalogue + counts | parent + `is_admin` | yes | 200 for A; 307 → My Missions for B and C |
| `/admin/missions/six-names` | Mission Detail editor | parent + `is_admin` | yes | 200 for A; 307 → My Missions for B and C |

### API / non-page routes — not for browser review

| URL | Purpose | Auth |
| --- | --- | --- |
| `/api/webhooks/stripe` | Stripe webhook | Stripe signature |
| `/api/log` | Client error sink | parent session |
| `/auth/callback` | Auth code exchange | none |
| `/purchase/[slug]` | Checkout bridge | parent (see defect below) |

---

## 3. Six Names review links

Sign in as **B — `wla-review-parent@wla-staging.test`**, open
`/academy/my-missions`, choose a child, then:

- Mission Home — http://localhost:3000/academy/missions/six-names
- Mission Kit — http://localhost:3000/academy/missions/six-names/kit
- For Parents — http://localhost:3000/academy/missions/six-names/parents
- Active Mission — http://localhost:3000/academy/missions/six-names/active
- Mission Trail — http://localhost:3000/academy/missions/six-names/trail
- Completion — http://localhost:3000/academy/missions/six-names/complete

**For Parents redirects to the PDF.** Verified in a real headless browser, not
just by status code: it mints a short-lived signed Storage URL and lands on
`six-names-parent-note.pdf`, `200 application/pdf`. The path stays stable and
bookmarkable, and no signed URL is embedded in any other page's HTML.

Mission Kit carries five PDFs — child mission, mission board, concern cards,
judgement cards, what's-changing tracker. Opening or printing any of them does
not touch progress.

---

## 4. Review states

Built through the mission engine as described in section 2. All five runs are
pinned to **v2**.

| Parent | Child | Mission | Version | Status | Current stage | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| B review-parent | **Ada (Not Started)** | Six Names | — | **Not Started** | no run exists | `Not Started → Open Mission` |
| B review-parent | **Bilal (In Progress)** | Six Names | v2 | **In Progress** | `decision1` — Decision 1 | `In Progress → Continue`; resume mid-mission |
| B review-parent | **Cara (Completed)** | Six Names | v2 | **Complete** | `complete` | `Complete → View Mission`; Trail, Completion |
| C review-family | **Idris** | Six Names | v2 | **In Progress** | `decision1` — Decision 1 | early stage, for switching |
| C review-family | **Layla** | Six Names | v2 | **In Progress** | `evidence` — Evidence | late stage, *other* branch |

All five children hold an active Six Names entitlement (`source = admin`, the
enum's existing QA/grant source — Six Names is paid, so there is no self-serve
path). Ada's is deliberately unused: **Not Started is the absence of a progress
row**, which is what the app derives from, so she was entitled and never started.

Cara's run is a genuine 19-screen walk —
`the_list → seen_said_unknown → handoff_step3 → decision1 → consequence1_ask →
tracker1_ask → changed_list → ssu_revisit → handoff_step7 → decision2 →
consequence2_pause → tracker2_pause → stopping_point → evidence →
handoff_step11 → judgement → reflection_both → final_judgement → complete` —
and her Mission Trail holds the three derived entries: Case Board, What's
Changing? tracker, Final Judgement card.

Layla took the **opposite** branch (`stop_claim_spreading` → `share_the_role`),
so her Evidence screen sits on a different path from anything in account B. That
makes branch isolation visible, not just child isolation.

Rendered status text, measured per active child:

```
Ada   → "Not Started"  + "Open Mission"
Bilal → "In Progress"  + "Continue"
Cara  → "Complete"     + "View Mission"
```

**Existing data untouched.** The pre-existing v1 pinned run is unchanged —
still `in_progress` on `tracker1`, `updated_at 2026-09-28T21:33:31Z`, from
before this task. No QA account, child, run or entitlement was deleted. 43 child
profiles are preserved.

One note on the admin dashboard: its **Started** and **Completed** columns read
from `analytics_events`, which only the running app writes — `In progress` and
`Quiet 14d` read from `mission_progress`. Because I drove these runs through the
RPCs directly, I emitted the matching `mission_started` / `mission_completed`
events through `record_mission_event`, the same function the app calls, so the
dashboard is coherent. The 32 older QA runs predate that and still show no
events; that is pre-existing QA noise, not a product fault.

---

## 5. Multi-child test

**Account:** `wla-review-family@wla-staging.test` / `WLA-Review-Family-2026`

| | Child 1 | Child 2 |
| --- | --- | --- |
| Name | **Idris** | **Layla** |
| Status | In Progress | In Progress |
| Stage | `decision1` — Decision 1 | `evidence` — Evidence |
| Branch | nothing decided yet | `stop_claim_spreading` → `share_the_role` |

**How to switch.** Sign in and open `/academy/my-missions`. With two children
and none selected you get the "Whose missions?" screen — choose one. After that
the Academy header carries a quiet profile switcher (a pill showing "Idris's
Missions ⌄"); open it to change child. It calls `switchActiveChildAction`, which
verifies ownership before writing the httpOnly `wla_active_child` cookie and
revalidates the Academy layout, so the **whole** context switches at once.

**Isolation, measured.** Switching to Idris shows Decision 1; switching to Layla
shows Evidence. No state bleeds. I also tried the attack directly: putting
Layla's child id in `wla_active_child` while authenticated as *account B*. The
app ignored it and fell back to B's own selector; PostgREST returned `[]` for
both Layla's profile and her progress; and the gated screen RPC returned
`not_your_child`. The boundary holds at the database, not just in the interface.

---

## 6. Admin review links

Sign in as **A — `wla-review-admin@wla-staging.test`**.

- Mission catalogue — http://localhost:3000/admin
- Six Names editor — http://localhost:3000/admin/missions/six-names

The catalogue currently reads: Six Names · v2 · **Draft** · £12.00 · Entitled 39
· Started 6 · Completed 1 · In progress 36 · Quiet 14d 0.

The editor writes only presentational content — title, description, lab, age
band, duration, delivery, price, currency, cover, free flag, published. `slug`,
`version`, `completion_rule`, `mission_screens` and `is_admin` are deliberately
**not** editable, and that is enforced by column-level grants and policies, not
by the form. Admins also cannot read `mission_screens`, so concealed Evidence
content stays concealed from them too.

**Do not press Publish.** Six Names must stay `published = false`.

---

## 7. One defect found while inventorying routes

I did not fix it, because this task was explicitly not a product-change task.

**`/purchase/six-names` returns HTTP 500 for an anonymous visitor.**

The page's own comment says "Protected by middleware", but `/purchase` is not in
`PROTECTED_PREFIXES` (`src/lib/supabase/middleware.ts:6`, which lists only
`/academy` and `/account`). So `getPurchasableMission` → `requireParent` throws
an unhandled `AccessError` and the route 500s instead of redirecting to
`/login?next=/purchase/six-names`.

```
GET /purchase/six-names            (anonymous)    → 500
  Error [AccessError]: Not signed in.
    at requireParent (src/lib/permissions/index.ts:67:11)
    at async getPurchasableMission (src/features/commerce/queries.ts:15:24)
    at async PurchasePage (src/app/purchase/[slug]/page.tsx:35:19)

GET /purchase/six-names            (signed in)    → 404   (correct: unpublished)
```

No data is exposed — it fails closed. It is a wrong-response-code and
error-handling defect, not an access-control hole. The fix is one line: add
`/purchase` to `PROTECTED_PREFIXES`. Say the word and I'll do it.

---

## FINAL STATE

```
Staging frontend deployment ........ NONE EXISTS (verified, not assumed)
Review target ...................... http://localhost:3000 + hosted Supabase staging
Supabase project ................... WLA Academy- staging / zvquddwdcysgrcuvywqw / eu-west-1 / ACTIVE_HEALTHY

Review accounts created ............ 3  (admin / parent / family, all @wla-staging.test)
Review children created ............ 5  (Ada, Bilal, Cara, Idris, Layla)
Entitlements granted ............... 5  (Six Names, source=admin, active)
States covered ..................... Not Started, In Progress, Complete  ✓
Admins in the system ............... 1  (wla-review-admin only)
QA parent B ........................ KEPT, is_admin revoked, verified at the DB boundary

Six Names .......................... v2, published = FALSE, £12.00 GBP   (unchanged)
Runs ............................... v1 in_progress 1 (pre-existing, UNTOUCHED)
                                     v2 in_progress 35, v2 complete 2
Child profiles ..................... 43 preserved, 0 deleted
Migrations ......................... 18 local = 18 remote, 0 pending
Tests / typecheck / lint ........... 357 passed / clean / clean

Commits made ....................... 0        (HEAD = origin/academy-mvp, 0 ahead)
Pushes made ........................ 0
Product changes made ............... 0
Secrets exposed .................... 0
```
