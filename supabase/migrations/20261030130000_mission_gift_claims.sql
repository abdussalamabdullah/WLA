-- ============================================================================
-- MISSION GIFT CLAIMS (D-142).
--
-- A claim used to be the emailed token itself, in a cookie. So anyone holding
-- the link could set that cookie by hand and never answer "Confirm your email":
-- the address was checked by the page, and enforced by nothing.
--
-- Now confirming the address is the only way to get a claim. The database checks
-- the address and records the hash of a new random secret, which goes in the
-- cookie. Redeeming accepts only that, never the link's token.
--
-- The address is also guessable, so wrong attempts are capped per link. At the
-- cap the link stops working; asking for a new one, which goes to the recipient,
-- replaces it and resets the count. Recipients are never locked out of a gift.
-- ============================================================================

alter table mission_gifts
  add column claim_hash text unique,
  add column confirm_failures int not null default 0 check (confirm_failures >= 0),
  add constraint mission_gifts_pending_has_no_claim check (
    status <> 'pending' or claim_hash is null
  );

/*
 * Answer "Confirm your email" for the holder of a link. Service role only.
 *
 * The address comes first: a wrong one learns nothing about the gift, not even
 * that it has been redeemed. `for update` so concurrent guesses all count.
 * Confirming again replaces the claim, so a gift has one open claim at a time.
 */
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
         confirm_failures = 0
   where id = v_gift.id;
  return 'matched';
end;
$$;
revoke all on function confirm_gift_email(text, text, text) from public, anon, authenticated;
grant execute on function confirm_gift_email(text, text, text) to service_role;

-- The parameter's meaning changes, so this replaces the function outright.
drop function redeem_mission_gift(text, uuid, uuid);

/*
 * Redeem exactly once, in one transaction, for the holder of a confirmed claim.
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
create function redeem_mission_gift(
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
