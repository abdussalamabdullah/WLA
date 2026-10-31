-- Mission gifts, executed against the real schema (D-140). One transaction,
-- rolled back: nothing it creates survives. Run by scripts/run-gift-regression.sh.
\set ON_ERROR_STOP on
begin;
create temp table r (n serial, label text, ok boolean);
grant all on r to public; grant all on sequence r_n_seq to public;

-- Fixtures: two families and one priced mission of its own.
insert into auth.users (id, email, aud, role, instance_id, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('a0000000-0000-4000-8000-00000000000a','gift-a@wla-local.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','',now(),now(),'{}','{}'),
       ('b0000000-0000-4000-8000-00000000000b','gift-b@wla-local.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','',now(),now(),'{}','{}');
insert into child_profiles (id, parent_id, display_name) values
 ('c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a','Child A1'),
 ('c0000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-00000000000a','Child A2'),
 ('c0000000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-00000000000b','Child B1');
insert into missions (id, slug, title, lab, min_age, max_age, is_free, price_minor, currency, published)
values ('d0000000-0000-4000-8000-000000000001','gift-regression','Gift regression','decision',11,15,false,1200,'GBP',false);
insert into mission_gifts (id, mission_id, purchaser_id, recipient_email, stripe_session_id, amount_minor, currency, status, redeem_token_hash, paid_at)
values ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-00000000000b','r@example.test','cs_paid',1200,'GBP','paid','hash-paid',now());
insert into mission_gifts (id, mission_id, purchaser_id, recipient_email, stripe_session_id, amount_minor, currency)
values ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-00000000000b','r@example.test','cs_pending',1200,'GBP');

-- Schema refuses a redeemable gift that was never paid, and unnormalised addresses.
do $$ begin
  begin update mission_gifts set status='paid' where stripe_session_id='cs_pending';
        insert into r(label,ok) values ('a gift cannot become paid without a token and payment date', false);
  exception when check_violation then insert into r(label,ok) values ('a gift cannot become paid without a token and payment date', true); end;
  begin update mission_gifts set redeem_token_hash='x' where stripe_session_id='cs_pending';
        insert into r(label,ok) values ('a pending gift cannot hold a token', false);
  exception when check_violation then insert into r(label,ok) values ('a pending gift cannot hold a token', true); end;
  begin insert into mission_gifts (mission_id,recipient_email,stripe_session_id,amount_minor,currency)
        values ('d0000000-0000-4000-8000-000000000001','Mixed@Example.test','cs_x',1,'GBP');
        insert into r(label,ok) values ('recipient email must be stored normalised', false);
  exception when check_violation then insert into r(label,ok) values ('recipient email must be stored normalised', true); end;
  begin insert into mission_gifts (mission_id,recipient_email,stripe_session_id,amount_minor,currency)
        values ('d0000000-0000-4000-8000-000000000001','r@example.test','cs_paid',1,'GBP');
        insert into r(label,ok) values ('one gift per Stripe session', false);
  exception when unique_violation then insert into r(label,ok) values ('one gift per Stripe session', true); end;
end $$;

-- Client roles: no table access at all, no redeem function, no admin view.
set local role anon;
do $$ begin
  begin perform 1 from mission_gifts; insert into r(label,ok) values ('anon cannot read gifts',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot read gifts',true); end;
  begin perform redeem_mission_gift('hash-paid','c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a'); insert into r(label,ok) values ('anon cannot redeem',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot redeem',true); end;
  begin perform confirm_gift_email('hash-paid','r@example.test','c'); insert into r(label,ok) values ('anon cannot confirm directly',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot confirm directly',true); end;
  begin perform 1 from admin_gifts(); insert into r(label,ok) values ('anon cannot use the admin view',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot use the admin view',true); end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
do $$ begin
  begin perform 1 from mission_gifts; insert into r(label,ok) values ('a signed-in parent cannot read gifts',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot read gifts',true); end;
  begin insert into mission_gifts (mission_id,recipient_email,stripe_session_id,amount_minor,currency) values ('d0000000-0000-4000-8000-000000000001','z@example.test','cs_z',1,'GBP'); insert into r(label,ok) values ('a signed-in parent cannot create a gift',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot create a gift',true); end;
  begin perform redeem_mission_gift('hash-paid','c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a'); insert into r(label,ok) values ('a signed-in parent cannot call redeem directly',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot call redeem directly',true); end;
  begin perform confirm_gift_email('hash-paid','r@example.test','c'); insert into r(label,ok) values ('a signed-in parent cannot confirm directly',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot confirm directly',true); end;
  begin perform 1 from admin_gifts(); insert into r(label,ok) values ('a non-admin parent cannot use the admin view',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a non-admin parent cannot use the admin view',true); end;
end $$;
reset role;

-- The purchaser got nothing from buying it.
insert into r(label,ok) select 'buying a gift grants the purchaser no entitlement',
  not exists (select 1 from mission_entitlements e join child_profiles c on c.id=e.child_id where c.parent_id='b0000000-0000-4000-8000-00000000000b');

-- Confirming the address is the only way to a claim (D-142).
insert into r(label,ok) select 'the link''s token alone redeems nothing', redeem_mission_gift('hash-paid','c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a')='invalid';
insert into r(label,ok) select 'an unknown token confirms nothing', confirm_gift_email('nope','r@example.test','claim-x')='invalid';
insert into r(label,ok) select 'a wrong address is refused', confirm_gift_email('hash-paid','wrong@example.test','claim-x')='mismatch';
insert into r(label,ok) select 'and issues no claim', (select claim_hash is null and confirm_failures=1 from mission_gifts where stripe_session_id='cs_paid');
insert into r(label,ok) select 'a pending gift can''t hold a claim', not exists (select 1 from mission_gifts where status='pending' and claim_hash is not null);
do $$ begin
  begin update mission_gifts set claim_hash='x' where stripe_session_id='cs_pending';
        insert into r(label,ok) values ('the schema refuses a claim on an unpaid gift', false);
  exception when check_violation then insert into r(label,ok) values ('the schema refuses a claim on an unpaid gift', true); end;
end $$;
do $$ begin perform confirm_gift_email('hash-paid','wrong@example.test','claim-x') from generate_series(1,9); end $$;
insert into r(label,ok) select 'at ten wrong addresses, even the right one is refused', confirm_gift_email('hash-paid','r@example.test','claim-x')='invalid';
update mission_gifts set confirm_failures=0, redeem_token_hash='hash-new' where stripe_session_id='cs_paid';
insert into r(label,ok) select 'the old link is dead once replaced', confirm_gift_email('hash-paid','r@example.test','claim-x')='invalid';
insert into r(label,ok) select 'the replacement works, however the address was typed', confirm_gift_email('hash-new','  R@Example.TEST ','claim-paid')='matched';
insert into r(label,ok) select 'which issues the claim and clears the count', (select claim_hash='claim-paid' and confirm_failures=0 from mission_gifts where stripe_session_id='cs_paid');

-- Redemption outcomes.
insert into r(label,ok) select 'an unknown claim redeems nothing', redeem_mission_gift('nope','c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a')='invalid';
insert into r(label,ok) select 'another family''s child is refused', redeem_mission_gift('claim-paid','c0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-00000000000a')='forbidden';
insert into r(label,ok) select 'the refusal consumed nothing', (select status='paid' from mission_gifts where stripe_session_id='cs_paid');
-- A child who already has it does not use the gift up.
insert into mission_entitlements (child_id,mission_id,source) values ('c0000000-0000-4000-8000-0000000000a2','d0000000-0000-4000-8000-000000000001','purchase');
insert into r(label,ok) select 'a child who already has it does not consume the gift', redeem_mission_gift('claim-paid','c0000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-00000000000a')='already_owned' and (select status='paid' from mission_gifts where stripe_session_id='cs_paid');
insert into r(label,ok) select 'the first redemption succeeds', redeem_mission_gift('claim-paid','c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a')='redeemed';
insert into r(label,ok) select 'it became one gift-source entitlement for that child',
  (select count(*)=1 and bool_and(source='gift' and status='active') from mission_entitlements where child_id='c0000000-0000-4000-8000-0000000000a1' and mission_id='d0000000-0000-4000-8000-000000000001');
insert into r(label,ok) select 'the gift records who redeemed it and for which child',
  (select status='redeemed' and redeemed_by='a0000000-0000-4000-8000-00000000000a' and redeemed_child_id='c0000000-0000-4000-8000-0000000000a1' and redeemed_at is not null from mission_gifts where stripe_session_id='cs_paid');
insert into r(label,ok) select 'a second redemption is refused', redeem_mission_gift('claim-paid','c0000000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-00000000000b')='already_redeemed';
insert into r(label,ok) select 'and created no second entitlement',
  not exists (select 1 from mission_entitlements where child_id='c0000000-0000-4000-8000-0000000000b1');
-- The My Missions read: the same RLS as any other entitlement.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
do $$ begin insert into r(label,ok) select 'the recipient parent can read the entitlement', exists(select 1 from mission_entitlements where child_id='c0000000-0000-4000-8000-0000000000a1'); end $$;
select set_config('request.jwt.claims','{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}',true);
do $$ begin insert into r(label,ok) select 'the purchaser cannot read the recipient''s entitlement', not exists(select 1 from mission_entitlements where child_id='c0000000-0000-4000-8000-0000000000a1'); end $$;
reset role;
-- admin view never exposes the hash.
insert into r(label,ok) select 'the admin view has no token or Stripe column',
  not exists (select 1 from information_schema.routines rt, unnest(regexp_split_to_array(pg_get_function_result('admin_gifts(int)'::regprocedure), ',')) x where x ilike '%hash%' or x ilike '%stripe%');


-- =================== WEBSITE CODES (D-145) ===================
-- Fixtures: the claim above is already spent, so these are two fresh gifts.
insert into mission_gifts (id, mission_id, purchaser_id, recipient_email, stripe_session_id, amount_minor, currency, status, redeem_token_hash, paid_at, created_at)
values ('e0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-00000000000b','code@example.test','cs_c1',1200,'GBP','paid','hash-c1',now() - interval '2 days',now() - interval '2 days'),
       ('e0000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-00000000000b','code@example.test','cs_c2',1200,'GBP','paid','hash-c2',now() - interval '1 day',now() - interval '1 day');
create temp table codes (label text primary key, gift uuid, code text);
grant all on codes to public;
-- Client roles have no way to any of this.
set local role anon;
do $$ begin
  begin perform * from issue_gift_code('code@example.test'); insert into r(label,ok) values ('anon cannot issue a code',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot issue a code',true); end;
  begin perform confirm_gift_code('code@example.test','ABCD2345','c'); insert into r(label,ok) values ('anon cannot try a code directly',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot try a code directly',true); end;
  begin perform 1 from app_secrets; insert into r(label,ok) values ('anon cannot read the code pepper',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot read the code pepper',true); end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
do $$ begin
  begin perform * from issue_gift_code('code@example.test'); insert into r(label,ok) values ('a signed-in parent cannot issue a code',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot issue a code',true); end;
  begin perform confirm_gift_code('code@example.test','ABCD2345','c'); insert into r(label,ok) values ('a signed-in parent cannot try a code directly',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot try a code directly',true); end;
  begin perform withdraw_gift_code(gen_random_uuid(),'x'); insert into r(label,ok) values ('a signed-in parent cannot withdraw a code',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a signed-in parent cannot withdraw a code',true); end;
end $$;
reset role;

insert into r(label,ok) select 'no gift to that address: nothing is issued', not exists (select 1 from issue_gift_code('nobody@example.test'));
insert into r(label,ok) select 'an unpaid gift gets no code', not exists (select 1 from issue_gift_code('never-paid@example.test'));
insert into codes select 'first', gift_id, code from issue_gift_code('  CODE@example.test ');
insert into r(label,ok) select 'the oldest gift gets the code, however the address was typed', (select gift='e0000000-0000-4000-8000-000000000011' from codes where label='first');
insert into r(label,ok) select 'the code has eight characters from the alphabet', (select replace(code,'-','') ~ '^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$' from codes where label='first');
insert into r(label,ok) select 'it expires in fifteen minutes', (select code_expires_at between now()+interval '14 minutes' and now()+interval '16 minutes' from mission_gifts where stripe_session_id='cs_c1');
insert into r(label,ok) select 'only a keyed hash is stored', (select code_hash ~ '^[0-9a-f]{64}$' and code_hash <> encode(digest(replace(c.code,'-',''),'sha256'),'hex') and position(replace(c.code,'-','') in code_hash)=0 from mission_gifts g, codes c where g.stripe_session_id='cs_c1' and c.label='first');
insert into r(label,ok) select 'the younger gift got no code', (select code_hash is null from mission_gifts where stripe_session_id='cs_c2');
insert into r(label,ok) select 'asking again within two minutes sends nothing', not exists (select 1 from issue_gift_code('code@example.test'));
insert into r(label,ok) select 'and the code already sent still stands', (select code_hash is not null from mission_gifts where stripe_session_id='cs_c1');
insert into r(label,ok) select 'the link''s ten-minute limit is a separate column', (select link_sent_at is null from mission_gifts where stripe_session_id='cs_c1');
-- Five wrong attempts stop the code, even if the sixth is right.
insert into r(label,ok) select 'a wrong code is refused with the one word', confirm_gift_code('code@example.test','WRONG234','claim-w')='invalid';
insert into r(label,ok) select 'no gift to that address is the same word', confirm_gift_code('nobody@example.test','WRONG234','claim-w')='invalid';
insert into r(label,ok) select 'a wrong code is counted and issues no claim', (select code_failures=1 and claim_hash is null from mission_gifts where stripe_session_id='cs_c1');
do $$ begin perform confirm_gift_code('code@example.test','WRONG234','claim-w') from generate_series(1,4); end $$;
insert into r(label,ok) select 'at five wrong attempts even the right code is refused', confirm_gift_code('code@example.test',(select code from codes where label='first'),'claim-c1')='invalid';
insert into r(label,ok) select 'and no claim exists', (select claim_hash is null from mission_gifts where stripe_session_id='cs_c1');
-- Expiry.
update mission_gifts set code_sent_at = now() - interval '3 minutes' where stripe_session_id='cs_c1';
insert into codes select 'second', gift_id, code from issue_gift_code('code@example.test');
insert into r(label,ok) select 'a new code after two minutes resets the count', (select code_failures=0 from mission_gifts where stripe_session_id='cs_c1');
insert into r(label,ok) select 'the replaced code no longer works', confirm_gift_code('code@example.test',(select code from codes where label='first'),'claim-c1')='invalid';
update mission_gifts set code_expires_at = now() - interval '1 second', code_failures = 0 where stripe_session_id='cs_c1';
insert into r(label,ok) select 'an expired code is refused', confirm_gift_code('code@example.test',(select code from codes where label='second'),'claim-c1')='invalid';
-- A failed send withdraws only the current code.
update mission_gifts set code_sent_at = now() - interval '3 minutes', code_expires_at = now() + interval '10 minutes' where stripe_session_id='cs_c1';
insert into codes select 'third', gift_id, code from issue_gift_code('code@example.test');
select withdraw_gift_code('e0000000-0000-4000-8000-000000000011',(select code from codes where label='second'));
insert into r(label,ok) select 'withdrawing an old code leaves the current one', (select code_hash is not null from mission_gifts where stripe_session_id='cs_c1');
select withdraw_gift_code('e0000000-0000-4000-8000-000000000011',(select code from codes where label='third'));
insert into r(label,ok) select 'withdrawing the current code gives the send limit back', (select code_hash is null and code_sent_at is null from mission_gifts where stripe_session_id='cs_c1');
-- The right code, once.
insert into codes select 'fourth', gift_id, code from issue_gift_code('code@example.test');
insert into r(label,ok) select 'the right code matches, however it was typed', confirm_gift_code('code@example.test',lower((select code from codes where label='fourth')),'claim-c1')='matched';
insert into r(label,ok) select 'it issues a claim with an expiry', (select claim_hash='claim-c1' and claim_expires_at between now()+interval '23 hours' and now()+interval '25 hours' from mission_gifts where stripe_session_id='cs_c1');
insert into r(label,ok) select 'and clears itself', (select code_hash is null from mission_gifts where stripe_session_id='cs_c1');
insert into r(label,ok) select 'it can''t be used twice', confirm_gift_code('code@example.test',(select code from codes where label='fourth'),'claim-again')='invalid';
insert into r(label,ok) select 'the first claim is unchanged by that', (select claim_hash='claim-c1' from mission_gifts where stripe_session_id='cs_c1');
insert into r(label,ok) select 'the link for that gift still works beside it', confirm_gift_email('hash-c2','code@example.test','claim-link')='matched';
-- A claim expires in the database.
update mission_gifts set claim_expires_at = now() - interval '1 second' where stripe_session_id='cs_c1';
insert into r(label,ok) select 'an expired claim redeems nothing', redeem_mission_gift('claim-c1','c0000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-00000000000a')='invalid';
update mission_gifts set claim_expires_at = now() + interval '1 hour' where stripe_session_id='cs_c1';
insert into r(label,ok) select 'a code''s claim redeems through the same function', redeem_mission_gift('claim-c1','c0000000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-00000000000b')='redeemed';
insert into r(label,ok) select 'once only', redeem_mission_gift('claim-c1','c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-00000000000a')='already_redeemed';
-- Oldest first: the redeemed gift is out of the way, so the next one is up.
update mission_gifts set claim_hash=null, claim_expires_at=null where stripe_session_id='cs_c2';
insert into codes select 'next', gift_id, code from issue_gift_code('code@example.test');
insert into r(label,ok) select 'the next gift to that address is next in line', (select gift='e0000000-0000-4000-8000-000000000012' from codes where label='next');
insert into r(label,ok) select 'a code is bound to its gift: the same characters on another gift don''t match',
  (select code_hash <> private.gift_code_hash('e0000000-0000-4000-8000-000000000011',(select code from codes where label='next')) from mission_gifts where stripe_session_id='cs_c2');
insert into r(label,ok) select 'no code or hash of it is in the admin view', not exists (select 1 from unnest(regexp_split_to_array(pg_get_function_result('admin_gifts(int)'::regprocedure), ',')) x where x ilike '%code%' or x ilike '%claim%');

select (case when ok then 'PASS' else 'FAIL' end) || '  ' || label from r order by n;
select 'PASS: ' || count(*) filter (where ok) || '   FAIL: ' || count(*) filter (where not ok) from r;
rollback;
