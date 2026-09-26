-- ============================================================================
-- Sprint 8 — Stripe Checkout
--
-- Tech Spec §40: "The Academy should NOT trust a frontend success message as
-- proof of payment. The actual payment provider webhook/server verification
-- should determine whether an entitlement is created."
--
-- There is deliberately no new payment architecture here. Entitlements remain
-- the single access concept (D-10); Stripe is just one `source` value.
-- ============================================================================

/*
 * Webhook idempotency ledger.
 *
 * Stripe retries on any non-2xx and can deliver the same event more than once
 * even on success. Two mechanisms guard against a double grant:
 *
 *   1. the unique (child_id, mission_id) constraint on mission_entitlements,
 *      which makes a repeat grant a no-op;
 *   2. this ledger, which makes a repeat event a no-op *before* any work runs.
 *
 * The primary key is the Stripe event id, so the insert itself is the lock.
 */
create table stripe_events (
  id           text primary key,          -- Stripe's evt_… id
  type         text not null,
  processed_at timestamptz not null default now()
);

alter table stripe_events enable row level security;
-- No policy: only the service-role webhook handler touches this table. A
-- table with RLS on and no policy is unreachable from any client.

/*
 * Checkout intents.
 *
 * Records which child a Checkout session was created for, server-side, at the
 * moment of creation. The webhook reads the intended child from HERE rather
 * than trusting Stripe metadata alone — metadata is round-tripped through the
 * browser's session and should not be the only record of who the purchase was
 * for.
 */
create table checkout_intents (
  id                  uuid primary key default gen_random_uuid(),
  stripe_session_id   text not null unique,
  parent_id           uuid not null references profiles(id) on delete cascade,
  child_id            uuid not null references child_profiles(id) on delete cascade,
  mission_id          uuid not null references missions(id) on delete cascade,
  -- Snapshot of what was actually charged, for reconciliation.
  amount_minor        int not null,
  currency            text not null,
  created_at          timestamptz not null default now()
);
create index on checkout_intents (parent_id);

alter table checkout_intents enable row level security;

-- A parent may see their own intents (to show "payment processing"), but may
-- never create or alter one: intents are written server-side only.
create policy "parent reads own checkout intents" on checkout_intents
  for select using (parent_id = auth.uid());
