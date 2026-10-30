-- ============================================================================
-- MISSION GIFTS (D-140) — Tech Spec §41:
--   Gift Purchase → Gift Record → Redeem → Child Assignment → Mission Entitlement
--
-- A gift is NOT a second access system. It is a record of a paid-for mission
-- waiting to become an ordinary `mission_entitlements` row (source 'gift') for
-- a child the recipient chooses. Until then it grants nothing to anyone: the
-- purchaser gets no entitlement, and no child is attached.
--
-- status:
--   pending  — Checkout started. Not redeemable, and has no token at all.
--   paid     — the verified Stripe webhook confirmed payment. Redeemable once.
--   redeemed — became an entitlement. Terminal.
--
-- Only the SHA-256 of the redemption token is stored; the token itself exists
-- only in the email sent to the recipient and is never logged.
--
-- No client role can read or write this table: RLS is on with no policies, and
-- the grants are revoked as well. The recipient email and the token hash are
-- reachable only through the service role, after server-side checks, and
-- admins see gifts through admin_gifts(), which never returns the hash.
-- ============================================================================

create type gift_status as enum ('pending', 'paid', 'redeemed');

create table mission_gifts (
  id                        uuid primary key default gen_random_uuid(),
  mission_id                uuid not null references missions(id) on delete restrict,
  purchaser_id              uuid references profiles(id) on delete set null,
  -- Stored lower-case and trimmed, so matching a typed address is one rule.
  recipient_email           text not null
    check (recipient_email = lower(btrim(recipient_email)) and position('@' in recipient_email) > 1),
  stripe_session_id         text not null unique,
  stripe_payment_intent_id  text,
  -- Snapshot of what was actually charged, for reconciliation.
  amount_minor              int not null,
  currency                  text not null,
  status                    gift_status not null default 'pending',
  redeem_token_hash         text unique,
  link_sent_at              timestamptz,
  paid_at                   timestamptz,
  redeemed_at               timestamptz,
  redeemed_by               uuid references profiles(id) on delete set null,
  redeemed_child_id         uuid references child_profiles(id) on delete set null,
  created_at                timestamptz not null default now(),
  -- A gift can never look redeemable without having been paid for.
  constraint mission_gifts_paid_has_token check (
    status = 'pending' or (redeem_token_hash is not null and paid_at is not null)
  ),
  constraint mission_gifts_pending_has_no_token check (
    status <> 'pending' or redeem_token_hash is null
  ),
  constraint mission_gifts_redeemed_has_date check (
    status <> 'redeemed' or redeemed_at is not null
  )
);
create index mission_gifts_recipient_paid_idx on mission_gifts (recipient_email) where status = 'paid';
create index mission_gifts_purchaser_idx on mission_gifts (purchaser_id);
create index mission_gifts_mission_idx on mission_gifts (mission_id);

alter table mission_gifts enable row level security;
-- Deliberately no policies.
revoke all on table mission_gifts from public, anon, authenticated;

/*
 * Redeem exactly once, in one transaction.
 *
 * `for update` serialises concurrent attempts on the same gift; the second
 * finds it already redeemed. The entitlement insert and the status change
 * commit together, so neither can exist without the other. Ownership of the
 * child is re-asserted here even though the caller has already checked it.
 *
 * A child who already holds the mission does not consume the gift: it stays
 * available for another child. A revoked entitlement is never reactivated by a
 * gift (D-20 — revocation is only undone explicitly).
 *
 * Returns a status word rather than a row. Service role only.
 */
create or replace function redeem_mission_gift(
  p_token_hash text,
  p_child_id   uuid,
  p_parent_id  uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift mission_gifts%rowtype;
  v_existing entitlement_status;
  v_inserted uuid;
begin
  select * into v_gift from mission_gifts
   where redeem_token_hash = p_token_hash
   for update;

  if not found then return 'invalid'; end if;
  if v_gift.status = 'redeemed' then return 'already_redeemed'; end if;
  if v_gift.status <> 'paid' then return 'invalid'; end if;

  if not exists (
    select 1 from child_profiles where id = p_child_id and parent_id = p_parent_id
  ) then
    return 'forbidden';
  end if;

  select status into v_existing from mission_entitlements
   where child_id = p_child_id and mission_id = v_gift.mission_id;
  if found then
    return case when v_existing = 'active' then 'already_owned' else 'unavailable' end;
  end if;

  insert into mission_entitlements (child_id, mission_id, source, status, stripe_payment_intent_id)
  values (p_child_id, v_gift.mission_id, 'gift', 'active', v_gift.stripe_payment_intent_id)
  on conflict (child_id, mission_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then return 'already_owned'; end if;

  update mission_gifts
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_by = p_parent_id,
         redeemed_child_id = p_child_id
   where id = v_gift.id;

  return 'redeemed';
end;
$$;
revoke all on function redeem_mission_gift(text, uuid, uuid) from public, anon, authenticated;
grant execute on function redeem_mission_gift(text, uuid, uuid) to service_role;

/*
 * Admin view. Read only, like admin_orders: an administrator cannot fabricate
 * a payment or a redemption. Never returns the token hash or any Stripe id.
 */
create or replace function admin_gifts(p_limit int default 100)
returns table (
  id uuid, created_at timestamptz, mission_title text,
  purchaser_email text, recipient_email text,
  amount_minor int, currency text, status gift_status,
  paid_at timestamptz, redeemed_at timestamptz,
  redeemed_by_email text, redeemed_child_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select g.id, g.created_at, m.title, buyer.email, g.recipient_email,
         g.amount_minor, g.currency, g.status, g.paid_at, g.redeemed_at,
         redeemer.email, c.display_name
  from mission_gifts g
  join missions m on m.id = g.mission_id
  left join profiles buyer on buyer.id = g.purchaser_id
  left join profiles redeemer on redeemer.id = g.redeemed_by
  left join child_profiles c on c.id = g.redeemed_child_id
  order by g.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;
revoke all on function admin_gifts(int) from public, anon;
grant execute on function admin_gifts(int) to authenticated;
