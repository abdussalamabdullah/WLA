#!/usr/bin/env bash
# Gift regression against the local stack. One transaction, rolled back; then a
# real two-session race on a single gift, whose fixtures are removed afterwards.
set -euo pipefail
PSQL=(docker exec -i supabase_db_WLA psql -U postgres -d postgres -X -A -t -q)
before=$("${PSQL[@]}" -c "select (select count(*) from mission_gifts)||'/'||(select count(*) from mission_entitlements)||'/'||(select count(*) from missions)")
out=$("${PSQL[@]}" < "$(dirname "$0")/gift-regression.sql" | grep -E '^(PASS|FAIL)  ')
echo "$out"

# Concurrency: two sessions redeem the same gift for different children.
"${PSQL[@]}" <<'SQL'
insert into auth.users (id,email,aud,role,instance_id,encrypted_password,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values ('a1000000-0000-4000-8000-00000000000a','gift-race@wla-local.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','',now(),now(),'{}','{}');
insert into child_profiles (id,parent_id,display_name) values ('c1000000-0000-4000-8000-0000000000a1','a1000000-0000-4000-8000-00000000000a','R1'),('c1000000-0000-4000-8000-0000000000a2','a1000000-0000-4000-8000-00000000000a','R2');
insert into missions (id,slug,title,lab,min_age,max_age,is_free,price_minor,currency,published) values ('d1000000-0000-4000-8000-000000000001','gift-race','Gift race','decision',11,15,false,1200,'GBP',false);
insert into mission_gifts (mission_id,recipient_email,stripe_session_id,amount_minor,currency,status,redeem_token_hash,claim_hash,paid_at) values ('d1000000-0000-4000-8000-000000000001','r@example.test','cs_race',1200,'GBP','paid','hash-race','claim-race',now());
SQL
cleanup() { "${PSQL[@]}" <<'SQL'
delete from mission_gifts where stripe_session_id='cs_race';
delete from mission_entitlements where mission_id='d1000000-0000-4000-8000-000000000001';
delete from missions where id='d1000000-0000-4000-8000-000000000001';
delete from child_profiles where parent_id='a1000000-0000-4000-8000-00000000000a';
delete from profiles where id='a1000000-0000-4000-8000-00000000000a';
delete from auth.users where id='a1000000-0000-4000-8000-00000000000a';
SQL
}
trap cleanup EXIT
r1=$(mktemp); r2=$(mktemp)
"${PSQL[@]}" -c "begin; select redeem_mission_gift('claim-race','c1000000-0000-4000-8000-0000000000a1','a1000000-0000-4000-8000-00000000000a'); select pg_sleep(1); commit;" > "$r1" &
sleep 0.3
"${PSQL[@]}" -c "select redeem_mission_gift('claim-race','c1000000-0000-4000-8000-0000000000a2','a1000000-0000-4000-8000-00000000000a');" > "$r2" &
wait
n=$("${PSQL[@]}" -c "select count(*) from mission_entitlements where mission_id='d1000000-0000-4000-8000-000000000001'")
results=$(cat "$r1" "$r2" | grep -E 'redeemed' | sort | tr '\n' ' ')
rm -f "$r1" "$r2"
if [ "$n" = "1" ] && [ "$results" = "already_redeemed redeemed " ]; then echo "PASS  two concurrent redemptions: one wins, one is refused, one entitlement"; c=1; else echo "FAIL  concurrency: entitlements=$n results=$results"; c=0; fi
cleanup; trap - EXIT
after=$("${PSQL[@]}" -c "select (select count(*) from mission_gifts)||'/'||(select count(*) from mission_entitlements)||'/'||(select count(*) from missions)")
[ "$before" = "$after" ] && { echo "PASS  local data unchanged ($after)"; d=1; } || { echo "FAIL  local data changed: $before -> $after"; d=0; }
p=$(echo "$out" | grep -c '^PASS' || true); f=$(echo "$out" | grep -c '^FAIL' || true)
echo; echo "PASS: $((p + c + d))   FAIL: $((f + 2 - c - d))"
[ $((f + 2 - c - d)) -eq 0 ]
