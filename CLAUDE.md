# WLA Academy — working rules

Read `docs/DECISIONS.md` before starting any task.

## Authority order

1. **Academy Architecture** (LOCKED — `docs/source/`)
2. **Public Website Master**
3. **Mission Build Brief** (none approved yet)
4. **Designer Brief / UI-UX Specification**
5. **Technical Specification**
6. Developer judgement

When two of these disagree, **stop and record it in `docs/DECISIONS.md`**.
Do not resolve a product conflict in code (Tech Spec §55).

## The two rules that shape everything

**1. Build the capability once; configure missions within it.** (Tech Spec §62)

Never create `MarsBridgeBuilder.tsx`. Never write `if (missionId === "mars")`.
A new mission is rows in `missions` / `mission_screens` / `mission_resources`,
never new application structure. If a mission seems to need new code, it needs
a new _screen type_ — one entry in `features/mission-engine/registry.ts` plus
its zod schema — and that is a product decision, not a shortcut.

**2. Progress keys on `child_id + mission_id`.** (Tech Spec §50)

Never `parent_id`. The parent owns the account; the child profile owns the
learning record. This is locked by Architecture §3.

## Access control — non-negotiable

There are no child accounts. The authenticated user is the **parent**, who owns
the account, access and permissions. Child profiles own mission progress and
the learning record.

**Sibling separation is enforced by server and database authorisation**, not by
interface behaviour. Every child-scoped operation validates, in order:

1. authenticated parent session — `requireParent`
2. requested child belongs to that parent — `requireOwnedChild`
3. child has the required entitlement — `requireEntitledMission`
4. requested progress/state/evidence belongs to that child —
   `requireOwnedProgress` · `requireOwnedState` · `requireOwnedEvidence`

Never trust a `childId` from the browser — **or a progress, state or evidence
id.** Holding a valid record id is not authorisation. Each check re-asserts the
boundary _inside the query_.

Cross-family isolation is absolute and additionally enforced by RLS.

Switching the active child must switch the **entire** Academy context. Use
`switchActiveChildAction`, which revalidates the Academy layout. There must be
no path by which Child A's data appears while Child B is selected.

Do not add signed active-child tokens or child authentication.

`src/lib/supabase/admin.ts` bypasses RLS. Its only legitimate uses are the
Stripe webhook and gift redemption. If you reach for it while serving a
logged-in parent, you are almost certainly doing something wrong.

## Locked product behaviour — do not redesign

| Surface                     | Rule                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| My Missions                 | Collection + status only. Not a dashboard, not a file store.                                                                      |
| Mission Home                | Permanent. Exists before, during and after. Start/Continue is the strongest action; Mission Kit and For Parents stay subordinate. |
| Mission Kit                 | What WLA _gives_. Opening, printing or downloading **must not touch progress**.                                                   |
| Mission Trail               | What the child _generates_. Private by default. Physical evidence is recorded, never faked as stored.                             |
| Mission Kit ≠ Mission Trail | These must never collapse into one "files" area (Brief §17).                                                                      |
| For Parents                 | Adult guidance. Not a parent dashboard. Opening it must not change state.                                                         |
| Mission Control             | Optional, secondary, calm. Never advances the mission, never reveals concealed content, never solves it.                          |
| Active Mission              | The quietest surface. Cream + charcoal; olive only for the primary action.                                                        |
| Completion                  | Closure, not performance. No confetti, scores, badges or upsell.                                                                  |
| Status                      | `Not Started → Open Mission`, `In Progress → Continue`, `Complete → View Mission`. Locked pairing.                                |
| Pause/resume                | Normal behaviour, not an edge case. State lives in Supabase, never only in localStorage.                                          |

## Naming trap

**"Mission Board" means two different things.** See conflict C8.

- _Six Names Mission Board_ — a printable worksheet. A Mission Kit resource.
- _Mission Board_ (Architecture §16) — an Academy-wide shared-practice
  destination beneath Mission Home. **Deferred; do not build it.**

Never let a Build Brief's use of the phrase pull the deferred Academy feature
into scope.

## Design system

Use tokens from `src/styles/tokens.css`. Never hard-code a hex value.

- Warm Cream carries the system. Olive is deliberate. Sage supports. Clay accents.
- Status must **never** be carried by colour alone (Architecture §20).
- Do not default to cards (Brief §34). Plain content on cream is usually right.
- Shadows are "paper lifted from a surface", not floating software.
- Every interactive element needs a visible focus state and a 44px touch target.
- No hover-dependent core interaction.

## Before adding a database table

Answer, in `docs/DATA-MODEL.md`: which numbered requirement does it serve; is
that requirement Must or deferred; can an existing table carry it; does it
store child data Brief §46 says not to collect. If deferred — stop.

## Never add without written approval

points · badges · streaks · rankings · leaderboards · gamification · confetti ·
social profiles · chat · comments · likes · notifications · mission replay ·
My Missions search/filter · public Trail sharing · compulsory uploads ·
Mission Board submission or moderation · parent dashboard · no-code mission
builder · AI tutor · global file library

These are deferred or prohibited by Architecture §22, PRD §5, Tech Spec §60 and
UI/UX §76. Technical ease is not a reason to add one.

## Commands

```
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
npm test           # mission engine navigation/branching/reveal tests
npm run lint
```
