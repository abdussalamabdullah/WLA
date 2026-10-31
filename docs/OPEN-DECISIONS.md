# WLA Academy — Decision Inventory

Status as of 2026-09-26. Supersedes the review brief of the same date.

## Status key

|                                               | Meaning                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| ✅ **Resolved (provisional)**                 | Decided and recorded. Implementable. Reversible if the product direction changes. |
| 🕒 **Deferred**                               | Deliberately not built for MVP. Revisit on an explicit trigger.                   |
| 🔴 **Requires explicit decision**             | Product, privacy, legal or launch-scope. Must not be decided technically.         |
| ⛔ **Blocked by missing WLA source material** | Cannot proceed until the client supplies an approved document or asset.           |

**None of these are implemented yet.** This document records what was decided,
not what was built.

---

# ✅ Resolved (provisional)

## OPEN-01 — Public site stays in Lovable · D-25

The public website remains in Lovable. The Academy stays in this codebase.

The Lovable public site is the **visual and UX reference** for the Academy —
not a technical dependency. Nothing in this codebase may import from, call or
require Lovable at runtime. The Handover's position stands: Lovable is "a
reference, a prototype, and, where useful, a source of reusable code" and must
not become a permanent production dependency.

**Implication.** Public routes here stay minimal stubs. `/missions/[slug]`
keeps its working purchase entry so the Mission Detail → Checkout → entitlement
→ My Missions journey stays walkable (Brief §48). Cross-domain session handling
between the Lovable site and the Academy is unresolved and will need attention
before launch.

---

## OPEN-05 — Child age is metadata · D-26

Age is display information, never an access gate.

`birth_year` stays optional. Missions continue to advertise their bands
(7–11, 11–15) as guidance. No check blocks a purchase or an entitlement.

**Current state matches this already** — verified by search: `birth_year` is
stored and shown as "Born 2014", and is compared to `min_age`/`max_age`
nowhere.

---

## OPEN-08 — Resend for transactional email · D-27

Resend is approved. Scope is **essential Academy and purchase communication
only** — not a broad email system.

Initial scope: one purchase/access confirmation, sent after the webhook creates
the entitlement. No marketing, digests, reminders, re-engagement or
notification emails (notifications are deferred by Architecture §22).

**Still needed from you:** the sending domain and sender identity.

**Separate issue, unchanged by this decision.** Supabase Auth's default sender
is rate-limited and unsuitable for production. It needs a custom SMTP sender
before launch regardless of what application email exists.

---

## OPEN-09 — Sentry for error monitoring · D-28

Sentry is approved, kept deliberately lightweight.

Scope: error capture with scrubbing so mission responses, child names and child
ids never leave the system. No performance monitoring, session replay, custom
dashboards or alerting infrastructure.

Priority follows Tech Spec §33 — authentication, mission access, mission state,
progress persistence, evidence storage and completion.

---

## OPEN-10 — SQL seeds for mission content · D-29

Mission content is authored as version-controlled SQL seeds. **No CMS or admin
authoring interface is built yet.**

`supabase/seed/six_names.sql` is the worked pattern. The D-08 schema and the
`is_admin` flag already exist, so an interface can be added later without
schema change — but building one now would guess at what the first approved
Build Brief actually needs.

**Revisit trigger:** the third mission, or the first mission authored by
someone without repository access.

---

## OPEN-11 — WCAG 2.2 AA · D-30

**WCAG 2.2 AA is the MVP accessibility target.** Palette constraints are
respected while implementing it.

**Correcting my earlier statement.** I previously said AAA was not achievable
on this palette. That was wrong. Measured against Warm Cream `#F5EFE3`:

| Foreground               | Ratio      | AA normal (4.5) | AAA normal (7) |
| ------------------------ | ---------- | --------------- | -------------- |
| Charcoal Brown `#3A2F2A` | **11.3:1** | pass            | **pass**       |
| Deep Olive `#5F6A4F`     | **5.0:1**  | pass            | fail           |

Body and supporting text in charcoal already clears AAA. Olive clears AA at all
sizes, and clears AAA's 4.5:1 large-text threshold at 24px or 18.66px bold.
Only _small olive text_ falls short — which D-11 had already moved to charcoal.

So AAA is not foreclosed by the brand. AA is simply our chosen MVP target.

Already built in: global focus-visible rings, 44px touch targets, labelled
inputs with `aria-describedby` errors, `role="alert"` on failures, status never
carried by colour alone, reduced-motion support, `aria-busy` on pending
actions. **None of this has been audited** — Sprint 10.

---

## OPEN-12 — Mission Kit available indefinitely · D-31

Kit resources remain available after completion, without time limit, unless a
later retention policy explicitly changes it.

Matches Architecture §7 ("before, during and after"). No expiry logic exists in
the codebase — verified by search — so this requires no work.

---

# 🕒 Deferred

## OPEN-07 — Gift rules not yet decided · D-140

Gifting is built (D-140). These business rules are **not decided, and nothing has been invented for them**:

- **Expiry:** a paid gift stays redeemable indefinitely.
- **Refunds:** refunds aren't handled (D-20). A gift refunded in Stripe stays redeemable until someone acts; there is no admin action for it yet.
- **Transfer or correction:** a mistyped recipient address can't be changed. There is no admin action for it yet.
- **A mission unpublished after purchase:** the gift can still be redeemed, as an existing entitlement would still work.
- **Who may redeem:** the link and the address prove the mailbox, so the account that redeems may use a different email from the gift's (D-140). Decide if the account's email must match.
- **A site-wide limit on `/redeem` requests:** gifts are protected per link, per code and per gift (D-142, D-145), but request volume isn't limited. Anyone can make a gift recipient receive up to 30 code emails an hour by typing their address. Set a limit at the hosting edge before launch.
- **Several gifts to one address:** they are handled one at a time, oldest first (D-145). A recipient isn't told a second gift is waiting until they redeem again.

## OPEN-24 — The website's own accounts · D-141

The public website has its own `/auth`, `/account`, `/my-missions`, `/admin/gifts` and a legacy `gifts` table, on a different Supabase project from the Academy's. Gifting no longer uses them. **Decide** whether they should be retired in favour of the Academy's, or the projects unified.


---

# 🔴 Requires your explicit decision

_OPEN-02 is resolved — moved to the Resolved section above. See
`docs/TYPOGRAPHY.md`._

---

## OPEN-14 — Retention and deletion policy · policy pending

**Split deliberately into two things.**

**In scope technically:** account deletion. It does not exist at all today —
only child-profile deletion does. For a UK product processing children's data
this is likely a legal requirement, not a feature. I will build the capability.

**Requires your explicit approval:** the policy itself. I have not made and
will not make a retention assumption on a children's product. Questions for
product and privacy sign-off:

1. Is deletion immediate and irreversible, or is there a grace period? A grace
   period means retaining children's data after a deletion request, which needs
   a stated justification.
2. Can a family export their Mission Trail before deleting? Architecture §15
   treats the Trail as the child's own record.
3. What is retained after deletion for legal or financial reasons — Stripe
   payment records, for instance — and for how long?
4. Does deleting the parent account delete every child profile with it?

**2026-10-04 (D-77):** still pending and now formally a blocker for three
things only — how long published Mission Board contributions are retained,
account deletion, and Trail export. Nothing else in the Enhancement Plan waits
on it. The Mission Board inherits the current behaviour below (immediate
removal on withdrawal or child deletion).

**2026-10-04 (D-96), as built:** the Mission Board keeps nothing a family has
withdrawn — withdrawal deletes the contribution at once, and child-profile or
Trail-entry deletion cascades to it. Rejected contributions stay visible to the
parent (who can withdraw them) and are not shown anywhere else. What remains
blocked on this policy: retention of PUBLISHED contributions beyond the
family's own withdrawal, parent-account deletion, and Trail export.

**Current behaviour, unchanged pending your decision:** immediate hard delete
of a child profile, cascading to entitlements, progress, state, responses and
Mission Trail evidence. The confirmation names all three data categories.

---

## OPEN-15 — Authority documents cited by the Enhancement Plan are not in the repository · needs source files

The Enhancement Plan cites the **Mission Manual**, the **Production Brief**,
the **Child Mission** and the **Family Mission Guide** as authorities. None is
in `docs/source/`. Consequences until they arrive (D-75):

- the account page shows a Family Mission Guide placeholder, not invented copy;
- the authoring QA's age-band and child-language checks use only the rules
  that can be derived without the Mission Manual (reading-length and banned
  gamification vocabulary already prohibited by CLAUDE.md), marked advisory.

---

# ✅ Previously blocked — now unblocked

## OPEN-21 — May an author approve their own Journal revision? · RESOLVED → D-130

Approval is no longer a prerequisite for publication: an authorised author
publishes their own article. Optional reviews remain, and a reviewer still
cannot record a review of a revision they edited (it would mean nothing).

## OPEN-22 — Where does the public Journal live? · RESOLVED → D-131

On the Lovable public website at `/journal`, reading WLA's public Journal API.
The Next.js public Journal pages were removed.

## OPEN-23 — Confirm the Medium source · needs the export

No Medium export was available. Supply Medium's "Download your information"
archive (or confirm another source). Until then the importer is verified only
against fixtures built to Medium's documented export markup (D-129). Tags are
not in Medium's export and will need adding by hand.

---

## OPEN-20 — Mandatory review before publishing · needs product decision

Raised 2026-10-13 by the Mission Builder usability work (D-121). Nothing was
changed pending this decision.

**As built:** a draft can be marked "ready for review" (it must pass the
automatic checks), returned to draft, or published directly. "In review" locks
nothing and notifies no one; any admin can publish from either state. The
builder now says exactly that rather than implying an approval step exists.

**Questions:**

1. Should a version have to be "ready for review" before it can be published?
2. If so, may the person who built it also approve it, or must it be someone
   else? That needs a notion of author and reviewer the admin does not have.
3. Should anything happen when a version is marked ready — a notification is
   on the standing prohibitions list, so this would need explicit approval.

Making review mandatory would change `set_mission_version_status`'s legal
transitions (a migration) and the publish panel. Until decided, the current
transitions stand.

---

## OPEN-03 — Mission Build Brief · UNBLOCKED 2026-09-26

**Six Names Mission Build Brief v0.2** received and adopted as the working
mission specification. Stored at
`docs/source/mission-briefs/Six Names Build Brief v0.2.md`.

Sprint 9 can proceed for Six Names only. The engine registry is populated from
this brief — not invented, and not extended to any other mission.

**One caveat carried forward, non-blocking.** The brief is headed
_"Draft v0.2 — WLA approval required before production"_, §11 lists eight items
needing approval, and §12 states the narrative _"must not be treated as existing
WLA copy until approved"_. Because mission content is data (D-29 SQL seeds),
unapproved copy is cheap to revise and does not block building the mechanism.
Implementation proceeds; the copy is seeded as supplied and revisions are edits
to one seed file.

---

## OPEN-13 — Six Names assets · UNBLOCKED 2026-09-26

The standalone Child Mission document is confirmed unavailable. Its
child-facing content is now carried by §4 of the Build Brief, which is the
production source.

**Still outstanding, not blocking the build:** the four printables exist as
PNG and need print-ready PDFs at the seeded Storage paths before the mission
can be published. `published` stays `false` until then.

---

# Summary

|     | Item                  | Status                                     |
| --- | --------------------- | ------------------------------------------ |
| 01  | Public site — Lovable | ✅ D-25                                    |
| 02  | Typefaces             | 🔴 D-33 — method set, needs Lovable access |
| 03  | Mission Build Brief   | ⛔                                         |
| 05  | Child age             | ✅ D-26                                    |
| 07  | Gift rules            | 🕒 D-140                                   |
| 08  | Transactional email   | ✅ D-27                                    |
| 09  | Error monitoring      | ✅ D-28                                    |
| 10  | Mission authoring     | ✅ D-29                                    |
| 11  | Accessibility         | ✅ D-30                                    |
| 12  | Kit retention         | ✅ D-31                                    |
| 13  | Six Names assets      | ⛔                                         |
| 14  | Retention policy      | 🔴 policy pending; capability in scope     |
| 20  | Review before publish | 🔴 needs you — see OPEN-20 below            |
| 21  | Journal self-approval | ✅ D-130 — approval optional                |
| 22  | Public Journal home   | ✅ D-131 — Lovable, via the WLA API         |
| 23  | Medium source         | ⛔ needs the Medium export                  |
| 24  | Website's own accounts | 🔴 needs you — see OPEN-24 above           |

**13 resolved · 1 deferred · 3 need you (OPEN-14, OPEN-20, OPEN-24) · 1 blocked on source material (OPEN-23).**

---

## Implementation status — unchanged by this document

Nothing above is built. Separately, and unaffected by these decisions:

**Verified by automated tests (157):** the pure mission engine, both
behavioural session tests, auth and child-profile validation, price formatting,
and the structural guards.

**Reviewed statically only — asserts source text, not behaviour:** all SQL
semantics, webhook ordering and idempotency, redirect guards,
account-enumeration protection, price authority.

**Not verified at all — requires the live environment:** every RLS policy, the
three Postgres functions, storage policies, Stripe signature verification,
webhook delivery, retry and duplicate handling, concurrency, and the end-to-end
payment flow. **None of these may be described as runtime-verified until tested
against live or test Supabase and Stripe.**

## OPEN-25 — Covers on the Academy's public pages · D-146, D-109

Covers now display on the Academy's public pages, but those pages still list only the temporary hard-coded catalogue (D-109), which has Six Names alone. A new mission shows on the public website and in My Missions, not on Academy public pages. Decide whether those pages stay, or the website alone is the public catalogue.

## OPEN-26 — Descriptions for uploaded covers · D-146

A mission cover has no description field, so an uploaded cover has empty alt text unless it is written into `SUPPLIED_COVER`. The title always sits beside the image, so this is permitted (`covers.ts`), but Six Names' photograph is the only one described. Decide whether administrators should write one.
