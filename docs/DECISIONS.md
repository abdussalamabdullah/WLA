# WLA Academy — Decisions & Open Questions

The single place where ambiguity is recorded rather than resolved in code.

Tech Spec §55: _"When requirements conflict: Stop and flag the conflict. Do not
silently resolve a product conflict through code."_

**Authority order** (Tech Spec §55, UI/UX §2, Brief §56):

1. Academy Architecture (LOCKED)
2. Public Website Master
3. Mission Build Brief
4. Designer Brief / UI-UX Specification
5. Technical Specification
6. Developer judgement

---

## Decisions taken

| ID       | Decision                                                                                                              | Date       | Rationale                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-01** | **Next.js (App Router), greenfield**                                                                                  | 2026-09-25 | Tech Spec §40 requires server-verified payment webhooks, §47 forbids the service-role key in frontend code, §25/§26 require entitlement checks before a mission renders. A pure SPA cannot satisfy these without bolting on separate functions. §2 mandates Vercel, which Next targets natively.                                                                                       |
| **D-02** | **Academy MVP in scope; public routes stubbed**                                                                       | 2026-09-25 | Matches the PRD, which is explicitly an Academy MVP. Public routes exist so the purchase → entitlement → My Missions journey (Brief §48) can be walked end to end.                                                                                                                                                                                                                     |
| **D-03** | **No child login. Parent session only.**                                                                              | 2026-09-25 | Matches Tech Spec §5/§8 as written. Collects no credentials from 7-year-olds, consistent with Brief §46. See **C2** for the security consequence.                                                                                                                                                                                                                                      |
| **D-04** | **Stripe, priced in GBP**                                                                                             | 2026-09-25 | Client decision. **Supersedes the ₦ figures in Brief §48** — the only place a currency appears in any source document. `missions.price_pence` stores GBP pence.                                                                                                                                                                                                                        |
| **D-05** | `app/` replaces Tech Spec §36's `pages/`                                                                              | 2026-09-25 | §36 calls its own structure "a recommended organisation". `features/`, `components/`, `lib/`, `types/` are preserved exactly; `pages/` maps to the App Router equivalent. Flagged rather than assumed.                                                                                                                                                                                 |
| **D-06** | **Navigation follows the Public Website Master**                                                                      | 2026-09-25 | Resolves C1. The Master copy is the self-declared public-site structure authority, is the later document, and states it has already reconciled with the locked Academy decisions. Routes are unaffected — only grouping. See C1.                                                                                                                                                       |
| **D-07** | **Parent-session only; sibling separation enforced by server + database authorisation at all four validation steps.** | 2026-09-25 | **Client confirmed — closed.** Resolves C2. Architecture §3 gives the parent ownership of access and permissions, so a parent reaching their own child's record is the ownership model, not a violation. See C2.                                                                                                                                                                       |
| **D-08** | **Editable content = Postgres tables + a thin internal admin**                                                        | 2026-09-25 | Resolves C3. Neither a full custom CMS nor an external one. The Six Names printables confirmed Mission Kit resources need no editor at all. See C3.                                                                                                                                                                                                                                    |
| **D-09** | **Price and currency come from mission data, never from UI code**                                                     | 2026-09-25 | Client instruction. `missions.price_minor` + `missions.currency`; `formatPrice(amount, currency)` takes both. GBP is the launch value, not an assumption baked into components.                                                                                                                                                                                                        |
| **D-10** | **Free access is an entitlement source, not a separate architecture**                                                 | 2026-09-25 | Client instruction. The Academy asks whether the child has valid access, never why it was granted. `entitlement_source` is recorded for reporting; no access logic branches on it.                                                                                                                                                                                                     |
| **D-11** | **Olive for large emphasis/buttons/active states; charcoal for small body and supporting text on cream**              | 2026-09-25 | Client instruction, resolving the 5.0:1 contrast note. Encoded as `--color-text-action` plus a documented rule at the top of `tokens.css`.                                                                                                                                                                                                                                             |
| **D-12** | **Mission engine stays generic; no mission becomes a hard-coded exception**                                           | 2026-09-25 | Client instruction. Six Names is seeded as _data only_ (metadata, Mission Kit, parent note) — zero mission-specific code. `mission_screens` stays empty until an approved Build Brief validates the engine.                                                                                                                                                                            |
| **D-13** | **Auth is email + password**                                                                                          | 2026-09-25 | Proceeded on the documented OPEN-04 default. PRD §8 asks for registration, login, logout, session and "password/account recovery", and forbids extra identity providers at MVP. **Reversible**: switching to magic link changes `features/auth/actions.ts` and the two form components only.                                                                                           |
| **D-14** | **Completion rule stored as `missions.completion_rule` (jsonb)**                                                      | 2026-09-25 | Tech Spec §31 requires completion be determined by mission configuration. One nullable column on an existing table — no new table, no new concept. A mission with no rule never auto-completes.                                                                                                                                                                                        |
| **D-15** | **Atomic persistence via three Postgres functions**                                                                   | 2026-09-25 | Tech Spec §32 requires completion be atomic. `start_mission`, `persist_mission_state` and `complete_mission` each touch 2–3 tables, so each is one transaction. All `security invoker`, so RLS still applies, and each re-checks ownership independently.                                                                                                                              |
| **D-16** | **`respondedScreens` mirrored into mission state**                                                                    | 2026-09-25 | Lets the configured completion rule be evaluated without a second query, and is written in the same transaction as the response so the two cannot diverge. Answers themselves stay in `mission_responses`.                                                                                                                                                                             |
| **D-17** | **Pin an in-progress mission to the version it started with**                                                         | 2026-09-26 | Client decision (closes OPEN-15). `mission_screens.version` + `mission_progress.mission_version` + a `completion_rule` snapshot on the progress row. New starts use the current published version; an existing run is never re-pinned; a completed run keeps its version. **No publishing system**: no draft/live workflow, no diffing, no in-flight migration, no version-history UI. |
| **D-18** | **Interaction → persist → success → advance. No offline persistence, retry queue or conflict resolution.**            | 2026-09-26 | Client decision (closes OPEN-16). A failed write returns a typed retryable value; nothing revalidates or redirects; the learner stays put and retries. The Academy never shows a transition the server has not persisted.                                                                                                                                                              |
| **D-22** | **Stripe Checkout: server-created sessions, server-read prices, intent recorded before departure**                    | 2026-09-26 | `checkout_intents` records the verified child server-side before the parent leaves for Stripe, so the webhook resolves the child from our record rather than from round-tripped metadata.                                                                                                                                                                                              |
| **D-23** | **Webhook idempotency via a `stripe_events` claim ledger**                                                            | 2026-09-26 | The Stripe event id is a primary key, so the insert _is_ the lock; a duplicate delivery exits before any work. Layered with the existing `unique (child_id, mission_id)` constraint. The claim is released on failure so Stripe's retry can genuinely re-run.                                                                                                                          |
| **D-19** | **Defer Mission Kit resource versioning**                                                                             | 2026-09-26 | Client decision (closes OPEN-17). Screen/progress pinning (D-17) stays separate from resources. A corrected resource is shown to everyone, including in-progress learners. No resource snapshots, version tables or publishing workflow.                                                                                                                                               |
| **D-20** | **Defer automated refund/dispute handling**                                                                           | 2026-09-26 | Client decision (closes OPEN-18). **Refunds are NOT handled.** No refund/dispute webhooks. Nothing sets `entitlement_status = 'revoked'`. Entitlements remain valid until an explicit server-side revocation mechanism exists. When built, revocation must affect **access only** — it must never delete or reset mission progress or Mission Trail evidence.                          |
| **D-21** | **Defer Stripe Tax / VAT**                                                                                            | 2026-09-26 | Client decision (closes OPEN-19). GBP prices are the final customer-facing prices. No tax calculation, collection or tax IDs. Commerce is structured so tax can be added later without touching the entitlement or payment model.                                                                                                                                                      |
| **D-24** | **Free missions: one server-side acquisition path**                                                                   | 2026-09-26 | Closes OPEN-06. `acquireMission()` is the single entry for free and paid; the browser submits only a child id and cannot say which a mission is. Free grants use the service role (no client insert policy) with `source: 'free'`, idempotent via `unique (child_id, mission_id)`, then return to My Missions. No Stripe involvement, no parallel architecture.                        |
| **D-25** | **Public site stays in Lovable; Academy stays here**                                                                  | 2026-09-26 | Provisional. Lovable is the visual/UX reference, never a runtime dependency. See `OPEN-DECISIONS.md`.                                                                                                                                                                                                                                                                                  |
| **D-26** | **Child age is metadata, not an access gate**                                                                         | 2026-09-26 | Provisional. `birth_year` stays optional; no check blocks access. Matches current behaviour.                                                                                                                                                                                                                                                                                           |
| **D-27** | **Resend for transactional email; essential communication only**                                                      | 2026-09-26 | Provisional. One purchase/access confirmation. No marketing or notification email. Sending domain still needed.                                                                                                                                                                                                                                                                        |
| **D-28** | **Sentry for error monitoring, lightweight**                                                                          | 2026-09-26 | Provisional. Error capture with scrubbing only — no performance monitoring, replay or alerting infrastructure.                                                                                                                                                                                                                                                                         |
| **D-29** | **Mission content authored as SQL seeds; no CMS yet**                                                                 | 2026-09-26 | Provisional. Revisit at the third mission or the first non-developer author.                                                                                                                                                                                                                                                                                                           |
| **D-30** | **WCAG 2.2 AA is the MVP accessibility target**                                                                       | 2026-09-26 | Provisional. Palette constraints respected. Charcoal on cream measures 11.3:1 (AAA); olive 5.0:1 (AA). AAA is not foreclosed — AA is the chosen target.                                                                                                                                                                                                                                |
| **D-31** | **Mission Kit remains available indefinitely after completion**                                                       | 2026-09-26 | Provisional. Matches Architecture §7. No expiry logic exists; none to be added.                                                                                                                                                                                                                                                                                                        |
| **D-32** | **Gift flow deferred**                                                                                                | 2026-09-26 | Provisional. Revisit only if gifting becomes an explicit launch requirement. Must reuse the entitlement model when built (Tech Spec §41).                                                                                                                                                                                                                                              |
| **D-33** | **Typefaces: extract from the approved Lovable design, never substitute**                                             | 2026-09-26 | Provisional. If the real faces cannot be established from the approved design, escalate as a design decision rather than choosing silently.                                                                                                                                                                                                                                            |
| **D-34** | **Six Names Build Brief v0.2 is the working mission specification**                                                   | 2026-09-26 | Client instruction. Adopted as-is; no alternative mission logic substituted. The brief self-describes as draft pending eight WLA approvals (§11) — non-blocking, because content is seeded data (D-29) and revisions are edits to one file.                                                                                                                                            |
| **D-35** | **OPEN-14 isolation: retention-dependent code stays separable**                                                       | 2026-09-26 | Client instruction. Account deletion remains in-scope capability; no retention period or grace period is invented. Anything depending on the unresolved policy is kept isolated so it can be changed without touching mission or entitlement logic.                                                                                                                                    |
| **D-36** | **Any function reading `mission_screens` must be `security definer` and re-check ownership + entitlement**            | 2026-09-26 | Found by live validation: 0007 silently broke `start_mission`, which was `security invoker`. Fixed in 0008. A regression guard enforces the rule. See `docs/LIVE-VALIDATION.md`.                                                                                                                                                                                                       |

---

## Conflicts found between source documents

### C1 — Primary navigation _(CLOSED — client decision, 2026-09-25)_

**Authority: the current reconciled WLA Public Website Master.**

| Group                      | Items                                             |
| -------------------------- | ------------------------------------------------- |
| Primary navigation         | Home · Missions · Labs · About                    |
| Separate functional routes | My Missions · Try a Free Mission · View a Mission |
| More                       | Journal · Reviews · Buy a Gift · Redeem a Gift    |

The older `Home | Missions | Labs | Journal | About` line in Academy
Architecture §1 is **superseded** for the public header.

**Do not reopen this.** Implemented in
`src/components/navigation/site-nav.tsx` as three exported constants.

---

### C2 — Child access and sibling isolation _(CLOSED — client confirmed, 2026-09-25)_

**Model:** parent-session only. No independent child accounts. No signed
active-child tokens. No separate child authentication for MVP.

The parent/guardian owns the account, access and permissions. Child profiles
own mission progress and the learning record (Architecture §3).

**Sibling data separation is enforced through server and database
authorisation.** It is not an interface convention, and must not be described
as one.

Every child-scoped operation validates, in order:

1. **authenticated parent session** — `requireParent`
2. **requested child belongs to that parent** — `requireOwnedChild`
3. **child has the required mission entitlement** — `requireEntitledMission`
4. **requested progress / state / evidence belongs to that child** —
   `requireOwnedProgress`, `requireOwnedState`, `requireOwnedEvidence`

A child id from the browser is never trusted. Neither is a progress, state or
evidence id: step 4 exists precisely because holding a valid record id must not
by itself grant access to that record. Each step re-asserts the boundary
**inside the query**, so an id belonging to a sibling returns no row.

**Cross-family isolation is absolute** and additionally enforced by RLS at the
database, independent of application code.

**Switching the active child switches the entire Academy context** — My
Missions, mission status, Mission Home, Active Mission, Mission Trail and
mission-specific state. Two mechanisms guarantee it:

- `switchActiveChildAction` calls `revalidatePath("/academy", "layout")`,
  discarding every cached Academy render beneath the shell;
- nothing is keyed on the active child alone — every query re-validates
  ownership server-side, so even a stale render could not fetch another
  child's data.

There is no path by which Child A's data can be displayed while Child B is
selected.

Active child is held in an **httpOnly cookie** (`features/children/active-child.ts`),
which is Tech Spec §8's "session/application state" stored where the browser
cannot alter it. It is not a token and carries no authority: ownership is
verified before it is written, and re-verified on every use.

---

### C3 — CMS instructions collided _(RESOLVED → D-08)_

PRD §28 and CMS-01 require editable Journal articles/categories, mission
catalogue and Mission Detail. Tech Spec §39 forbids _"a full custom CMS"_ **and**
_"another external CMS."_

**Decision: ordinary Postgres tables plus a thin internal admin.** That is
neither of the prohibited things — no page builder, no block editor, no
third-party service — while still satisfying CMS-01.

The supplied Six Names materials sharpened this. The four Mission Kit
printables are **print-ready artwork authored outside the system**, which means
the largest category of mission content needs _no editing interface at all_ —
a file in Storage plus a `mission_resources` row. That removes most of the
pressure that would otherwise push toward a real CMS.

| Content                     | Mechanism                                | Editing                                                                                                                            |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mission Kit resources       | Storage file + `mission_resources` row   | Upload; no editor needed                                                                                                           |
| Mission Note for Parents    | `mission_parent_notes.content`, markdown | Admin textarea                                                                                                                     |
| Mission catalogue / Detail  | `missions` columns                       | Admin form                                                                                                                         |
| Journal articles/categories | `journal_articles`, `journal_categories` | Admin form                                                                                                                         |
| Mission screens             | `mission_screens`                        | **SQL seed files** — authored from an approved Build Brief, version-controlled, reviewable. Not a no-code builder (Tech Spec §18). |

Schema added in `supabase/migrations/20260925220100_editable_content.sql`, gated behind
`profiles.is_admin` (set manually — there is no self-service route to admin).
**The admin UI itself is not built**: it is public-site scope under D-02.

---

### C4 — No existing codebase to audit _(mitigated by D-01)_

Tech Spec Sprint 1 requires inspecting the existing application before any
code is written. `/Users/user/Desktop/WLA` was empty; no Lovable export was
available. Sprint 1 could not be performed.

**If the Lovable repository exists**, supplying it would let the public-site
stubs be replaced with the real implementation and would settle **OPEN-02**.

---

### C5 — Is Mission Board in the MVP? _(needs a decision)_

- Brief §29: design the destination "only where sufficiently defined"
- PRD §25: "reasonable to leave Mission Board out of the first slice"
- UI/UX §67: lists a Mission Board shell in the screen inventory

**Not scaffolded.** No route exists. Submission, moderation, likes, comments
and ranking are explicitly deferred by Architecture §22 and must not appear.

---

### C6 — Journal scope is ambiguous

PRD §4 marks Journal CMS as "public website scope, not Academy core", yet it
remains inside CMS-01 and the editable-content list. Resolved for now by D-02
(stubbed). Revisit with C3.

---

### C7 — `mission_drop_off` is not an event

Tech Spec §42 lists it beside `mission_started` and `mission_completed`, but
drop-off cannot be emitted by a client — it is _derived_ (started, not
completed within N days). It will be computed from `mission_progress`, not
tracked. No decision needed; recorded so the requirement is not mis-read as an
event later.

---

### C8 — "Mission Board" means two different things _(naming collision — please rename one)_

The supplied Six Names materials include a printable worksheet titled
**"SIX NAMES — MISSION BOARD"**: six zones the child writes into as the case
develops. It is a physical Mission Kit resource.

The Academy also has a **Mission Board** (Architecture §16): an Academy-wide
secondary destination showing selected, anonymised WLA practice, sitting
beneath Mission Home.

These are unrelated. One is a sheet of paper in a child's hands; the other is a
shared-practice surface in the product. They will be conflated — by a developer
reading a Build Brief, by a designer, or by a future mission author.

**Recommendation:** rename the printable (e.g. _"Six Names — Case Board"_ or
_"Decision Board"_), since the Academy Mission Board name is locked by
Architecture §16 and the printable's name is not.

**Interim mitigation:** the seed file and `CLAUDE.md` both carry an explicit
warning. No code references either yet.

---

## Open questions

| ID              | Question                                                                                                                                                                                                                                                                                                                                                                                                                                | Blocks                | Default if unanswered               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------- |
| **OPEN-01**     | Should the public site be built here, or does the Lovable implementation continue to serve it?                                                                                                                                                                                                                                                                                                                                          | Public-site work      | Stubs remain                        |
| **OPEN-02**     | **DESIGN-SYSTEM DECISION, PENDING.** The serif + humanist-sans _direction_ is confirmed and must be kept; the final typefaces are explicitly NOT chosen. Current pairing is a placeholder to be confirmed against the existing public prototype/assets. **Exact typefaces.** No document names one — only "warm editorial serif" + "humanist sans" (Designer Brief §345). UI/UX §8 requires locking them against the Lovable prototype. | Visual fidelity       | Lora + Source Sans 3 placeholders   |
| **OPEN-03**     | **No Mission Build Brief exists.** _Mars Bridge Builder_ and _Six Names_ are named; only Six Names has assets.                                                                                                                                                                                                                                                                                                                          | **Sprint 9 entirely** | Engine stays content-free           |
| ~~**OPEN-04**~~ | **RESOLVED (D-13).** Auth method: email + password.                                                                                                                                                                                                                                                                                                                                                                                     | —                     | —                                   |
| **OPEN-05**     | Is a child's age a _gate_ or _metadata_? Missions advertise bands (7–11, 11–15) but nothing says access is blocked.                                                                                                                                                                                                                                                                                                                     | Child profile form    | `birth_year`, display only, no gate |
| ~~**OPEN-06**~~ | **RESOLVED (D-24).** Free access is an entitlement source; `is_free` on the mission row decides. Which mission is free remains a content choice, not a code one.                                                                                                                                                                                                                                                                        | —                     | —                                   |
| **OPEN-07**     | Gift code format, expiry, and redemption-to-child assignment.                                                                                                                                                                                                                                                                                                                                                                           | Sprint 8              | None                                |
| **OPEN-08**     | Transactional email provider (PRD §4 lists purchase/access email in scope).                                                                                                                                                                                                                                                                                                                                                             | Sprint 8              | None                                |
| **OPEN-09**     | Error monitoring tool. Sentry assumed but unnamed.                                                                                                                                                                                                                                                                                                                                                                                      | Sprint 10             | Sentry                              |
| **OPEN-10**     | Who authors `mission_screens` rows, and through what interface?                                                                                                                                                                                                                                                                                                                                                                         | Sprint 9              | SQL seed files                      |
| **OPEN-11**     | Accessibility conformance target. WCAG 2.2 AA assumed; never stated.                                                                                                                                                                                                                                                                                                                                                                    | QA sign-off           | WCAG 2.2 AA                         |
| **OPEN-12**     | Does a _completed_ mission's Mission Kit stay downloadable indefinitely? Architecture §7 implies yes.                                                                                                                                                                                                                                                                                                                                   | Retention policy      | Indefinite                          |
| **OPEN-13**     | **Six Names Mission Kit artwork.** The four printables exist as PNGs; production needs print-ready PDFs uploaded to Storage at the seeded paths. The _Child Mission_ document has not been supplied at all.                                                                                                                                                                                                                             | Six Names launch      | Mission stays `published = false`   |
| **OPEN-14**     | **Retention / deletion policy.** Operational decision, non-blocking. Child deletion is currently an immediate hard delete cascading to progress, responses and evidence. No archive or soft-delete exists.                                                                                                                                                                                                                              | Operational sign-off  | Immediate hard delete               |
| ~~**OPEN-15**~~ | **RESOLVED (D-17).** Mission version pinning.                                                                                                                                                                                                                                                                                                                                                                                           | —                     | —                                   |
| ~~**OPEN-16**~~ | **RESOLVED (D-18).** Interrupted writes: retry, no queue.                                                                                                                                                                                                                                                                                                                                                                               | —                     | —                                   |
| ~~**OPEN-17**~~ | **RESOLVED (D-19).** Resource versioning deferred.                                                                                                                                                                                                                                                                                                                                                                                      | —                     | —                                   |
| ~~**OPEN-18**~~ | **RESOLVED (D-20).** Refunds/disputes deferred — NOT handled.                                                                                                                                                                                                                                                                                                                                                                           | —                     | —                                   |
| ~~**OPEN-19**~~ | **RESOLVED (D-21).** Stripe Tax/VAT deferred.                                                                                                                                                                                                                                                                                                                                                                                           | —                     | —                                   |

### Note on contrast (OPEN-11)

Deep Olive `#5F6A4F` on Warm Cream `#F5EFE3` measures **5.0:1**. That passes
WCAG AA for normal text (4.5:1) but fails AAA (7:1) and fails AA for text below
~19px if used at small sizes. Soft Sage is far lower and must remain a surface,
never a text colour — as the Designer Brief already specifies.

---

## Standing prohibitions

Never add without explicit written approval — Architecture §22, PRD §5,
Tech Spec §54/§60, UI/UX §76:

points · badges · streaks · rankings · leaderboards · gamification · confetti ·
social profiles · chat · comments · likes · notifications · mission replay ·
My Missions search or filter · public Mission Trail sharing · compulsory
evidence upload · Mission Board submission or moderation · a parent dashboard ·
a no-code mission builder · an AI tutor · a global file library
