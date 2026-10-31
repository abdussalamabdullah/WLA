-- ============================================================================
-- REDEEMING FROM THE WEBSITE WITH AN EMAILED CODE (D-145, amends D-140, D-142).
--
-- Typing an address proves nothing, so "Redeem a Gift" emails that address an
-- eight-character code and the recipient types it on the page. A correct code
-- leads to the same claim as the emailed link: the same cookie, the same
-- redeem_mission_gift. There is no second way to redeem.
--
-- A code is:
--   one gift's: its hash includes the gift's id, and the oldest paid gift for the
--     address gets it, so several gifts are handled one at a time;
--   single use: a correct code clears itself in the transaction that issues the
--     claim, and row locks mean only one of two simultaneous attempts can win;
--   short-lived: 15 minutes;
--   capped: five wrong attempts and it stops working, even if then correct;
--   replaced by the next one;
--   stored only as an HMAC under a pepper no API role can read.
--
-- Sending is limited to one code per gift every two minutes, separately from the
-- link's ten-minute limit, so a gift email just sent doesn't block a code.
-- Every failure returns one word, 'invalid', whether or not a gift exists.
--
-- Also: a claim now expires in the database, as well as in its cookie (24 hours).
-- ============================================================================

set search_path = public, extensions;

insert into app_secrets (name, value)
values ('gift_code_pepper', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

alter table mission_gifts
  add column code_hash text,
  add column code_expires_at timestamptz,
  add column code_failures int not null default 0 check (code_failures >= 0),
  add column code_sent_at timestamptz,
  add column claim_expires_at timestamptz;

-- A claim already open keeps its full day from now rather than vanishing.
update mission_gifts set claim_expires_at = now() + interval '24 hours' where claim_hash is not null;

alter table mission_gifts
  add constraint mission_gifts_pending_has_no_code check (status <> 'pending' or code_hash is null),
  add constraint mission_gifts_code_expires check ((code_hash is null) = (code_expires_at is null)),
  add constraint mission_gifts_claim_expires check ((claim_hash is null) = (claim_expires_at is null));

create or replace function private.gift_code_hash(p_gift_id uuid, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v_pepper text;
begin
  select value into v_pepper from app_secrets where name = 'gift_code_pepper';
  return encode(hmac(p_gift_id::text || ':' || normalize_child_code(p_code), v_pepper, 'sha256'), 'hex');
end;
$$;
revoke all on function private.gift_code_hash(uuid, text) from public, anon, authenticated;

/*
 * Make a code for the oldest paid gift to this address, and return it for the
 * server to email. Nothing comes back when there's no such gift or it's too soon,
 * and the caller can't tell its visitor which: it answers before this runs.
 * The code comes from gen_child_code, which uses gen_random_bytes. Service role only.
 */
create or replace function issue_gift_code(p_email text)
returns table (gift_id uuid, mission_id uuid, code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift mission_gifts%rowtype;
  v_code text;
begin
  select g.* into v_gift from mission_gifts g
   where g.recipient_email = lower(btrim(p_email)) and g.status = 'paid'
   order by g.paid_at, g.created_at, g.id
   limit 1
   for update;

  if not found then return; end if;
  if v_gift.code_sent_at is not null and v_gift.code_sent_at > now() - interval '2 minutes' then
    return;
  end if;

  v_code := gen_child_code();
  update mission_gifts g
     set code_hash = private.gift_code_hash(g.id, v_code),
         code_expires_at = now() + interval '15 minutes',
         code_failures = 0,
         code_sent_at = now()
   where g.id = v_gift.id;

  return query select v_gift.id, v_gift.mission_id, v_code;
end;
$$;
revoke all on function issue_gift_code(text) from public, anon, authenticated;
grant execute on function issue_gift_code(text) to service_role;

/*
 * The email didn't leave: forget the code and give the send limit back. Only if
 * this is still the current code, so a late failure can't cancel a newer one.
 */
create or replace function withdraw_gift_code(p_gift_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update mission_gifts g
     set code_hash = null, code_expires_at = null, code_failures = 0, code_sent_at = null
   where g.id = p_gift_id and g.code_hash = private.gift_code_hash(p_gift_id, p_code);
end;
$$;
revoke all on function withdraw_gift_code(uuid, text) from public, anon, authenticated;
grant execute on function withdraw_gift_code(uuid, text) to service_role;

/*
 * Answer the code form. 'matched' records the claim; anything else is 'invalid'.
 *
 * Returns rather than raises, so that counting a wrong attempt commits.
 * Every live code for the address is locked in a fixed order, so concurrent
 * attempts queue and the second finds the code already gone. Service role only.
 */
create or replace function confirm_gift_code(
  p_email text,
  p_code text,
  p_claim_hash text
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gift mission_gifts%rowtype;
  v_email text := lower(btrim(p_email));
begin
  for v_gift in
    select g.* from mission_gifts g
     where g.recipient_email = v_email and g.status = 'paid' and g.code_hash is not null
     order by g.paid_at, g.created_at, g.id
     for update
  loop
    if v_gift.code_expires_at > now() and v_gift.code_failures < 5
       and v_gift.code_hash = private.gift_code_hash(v_gift.id, p_code) then
      update mission_gifts g
         set claim_hash = p_claim_hash,
             claim_expires_at = now() + interval '24 hours',
             code_hash = null,
             code_expires_at = null,
             code_failures = 0,
             confirm_failures = 0
       where g.id = v_gift.id;
      return 'matched';
    end if;
  end loop;

  update mission_gifts g
     set code_failures = g.code_failures + 1
   where g.recipient_email = v_email and g.status = 'paid' and g.code_hash is not null
     and g.code_expires_at > now() and g.code_failures < 5;
  return 'invalid';
end;
$$;
revoke all on function confirm_gift_code(text, text, text) from public, anon, authenticated;
grant execute on function confirm_gift_code(text, text, text) to service_role;

-- The link's check, as before, with the claim's expiry. Nothing else changes.
create or replace function confirm_gift_email(
  p_token_hash text,
  p_email      text,
  p_claim_hash text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift mission_gifts%rowtype;
begin
  select * into v_gift from mission_gifts
   where redeem_token_hash = p_token_hash
   for update;

  if not found or v_gift.confirm_failures >= 10 then return 'invalid'; end if;

  if v_gift.recipient_email <> lower(btrim(p_email)) then
    update mission_gifts set confirm_failures = confirm_failures + 1 where id = v_gift.id;
    return 'mismatch';
  end if;

  if v_gift.status = 'redeemed' then return 'already_redeemed'; end if;
  if v_gift.status <> 'paid' then return 'invalid'; end if;

  update mission_gifts
     set claim_hash = p_claim_hash,
         claim_expires_at = now() + interval '24 hours',
         confirm_failures = 0
   where id = v_gift.id;
  return 'matched';
end;
$$;
revoke all on function confirm_gift_email(text, text, text) from public, anon, authenticated;
grant execute on function confirm_gift_email(text, text, text) to service_role;

-- As D-142, and a claim past its expiry is no claim. Redeeming clears any code.
create or replace function redeem_mission_gift(
  p_claim_hash text,
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
   where claim_hash = p_claim_hash
   for update;

  if not found then return 'invalid'; end if;
  if v_gift.status = 'redeemed' then return 'already_redeemed'; end if;
  if v_gift.status <> 'paid' or v_gift.claim_expires_at <= now() then return 'invalid'; end if;

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
         redeemed_child_id = p_child_id,
         code_hash = null,
         code_expires_at = null
   where id = v_gift.id;

  return 'redeemed';
end;
$$;
revoke all on function redeem_mission_gift(text, uuid, uuid) from public, anon, authenticated;
grant execute on function redeem_mission_gift(text, uuid, uuid) to service_role;
