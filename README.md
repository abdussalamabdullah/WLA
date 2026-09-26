# Within Lab Academy

Mission-delivery platform for children aged 7–15.

> **Build a secure, reusable mission-delivery system that lets a child access,
> perform, pause, resume and complete WLA missions, while keeping the
> meaningful work outside the interface wherever possible.** — PRD §39

## Status

Sprints 1b–4 complete: design system, Academy shell, authentication, child
profiles, My Missions, Mission Home, Mission Kit, For Parents, Mission
Complete and Mission Trail.

No mission content — no Mission Build Brief has been approved yet
(`docs/DECISIONS.md` → OPEN-03), so `mission_screens` is empty and the mission
engine is deliberately unexercised by real content.

| Sprint | Scope                                                   | Status                                   |
| ------ | ------------------------------------------------------- | ---------------------------------------- |
| 1      | Audit existing app                                      | N/A — no existing codebase (conflict C4) |
| 1b     | Foundation: tokens, shell, schema, RLS, engine skeleton | **Done**                                 |
| 2      | Auth + child profiles                                   | Not started                              |
| 3      | My Missions                                             | Routes stubbed                           |
| 4      | Mission Home                                            | Routes stubbed                           |
| 5      | Mission engine screens                                  | Registry empty by design                 |
| 6      | Persistence + resume                                    | Schema ready                             |
| 7      | Mission Trail + evidence                                | Schema ready                             |
| 8      | Commerce (Stripe → entitlement)                         | Webhook implemented                      |
| 9      | First mission                                           | **Blocked** — needs a Build Brief        |
| 10     | QA                                                      | Not started                              |

## Getting started

```bash
cp .env.example .env.local     # fill in Supabase + Stripe credentials
npm install
npm run dev
```

Apply the schema with the Supabase CLI (`supabase db push`) or by running
`supabase/migrations/0001_init.sql` in the SQL editor. Then regenerate types:

```bash
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```

## Architecture

```
Cloudflare → Vercel → Next.js (App Router) → Supabase
                                              ├── Auth      (parent accounts)
                                              ├── Postgres  (+ RLS)
                                              └── Storage   (resources · evidence)
```

### Layout

```
src/
├── app/
│   ├── (public)/      Home · Missions · Mission Detail · Labs · Journal · About
│   ├── (functional)/  try-free · reviews · gift · redeem
│   ├── (auth)/        login · signup · forgot-password
│   ├── (academy)/     my-missions · Mission Home · kit · parents · active · complete · trail
│   ├── account/       account · children · password
│   ├── auth/callback/ email confirmation + password reset landing
│   └── api/webhooks/stripe/     ← the only path that creates a paid entitlement
├── features/
│   ├── mission-engine/   schemas · navigation · registry   ← the core
│   ├── auth/             schemas · actions (Supabase Auth only)
│   ├── children/         queries · actions · active-child (httpOnly cookie)
│   └── missions · mission-trail · entitlements
├── components/   ui · system · mission · navigation · profile · academy
├── lib/
│   ├── supabase/   client · server · admin (RLS-bypassing, server-only)
│   └── permissions/   ← every child-scoped query passes through here
├── middleware.ts     session refresh + route protection
├── styles/tokens.css
└── types/database.ts

supabase/migrations/   schema · RLS · storage policies
docs/
├── DECISIONS.md       conflicts, open questions, decisions taken
├── DATA-MODEL.md      table-to-requirement mapping
└── source/            the governing documents
```

Maps onto Tech Spec §36, with `pages/` → `app/` (decision D-05).

### The two load-bearing ideas

**One engine, many missions.** A mission is data — rows in `missions`,
`mission_screens`, `mission_resources` — rendered by a shared engine.
`screen_type` selects a component via `features/mission-engine/registry.ts`;
branching, reveals and completion are all configuration. Adding a mission adds
no application code.

**The parent owns the account; the child owns the record.** Progress keys on
`child_id + mission_id`, never `parent_id`. RLS enforces the family boundary;
`lib/permissions` enforces the child boundary within it. See conflict **C2**.

## Before you change anything

Read `CLAUDE.md` and `docs/DECISIONS.md`. Several behaviours are **locked** by
the Academy Architecture and a long list of features is explicitly prohibited.
Where documents conflict, record it — do not resolve it in code.
