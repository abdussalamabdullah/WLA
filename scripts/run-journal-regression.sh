#!/bin/zsh
# Execute the Journal CMS regression (D-123 … D-129) against a throwaway local
# cluster built by scripts/local-db.sh — real migrations, real roles, direct
# function and table calls. Never touches the Supabase stack.
set -e
PORT=${PORT:-55472}
R=$(cd "$(dirname "$0")/.." && pwd)
P=/opt/homebrew/bin/psql

"$R/scripts/local-db.sh" "$PORT" --with-fixtures >/dev/null

# This cluster has no pg_cron: S25 asserts "not configured" (D-132).
OUT=$($P -h 127.0.0.1 -p $PORT -U postgres -v cron=absent -f "$R/scripts/journal-regression.sql" 2>&1)
echo "$OUT" | grep -E "(PASS|FAIL|========|ERROR:)" | sed -E "s/^.*NOTICE: +//"

# M. CONCURRENCY — separate sessions, as overlapping pg_cron runs would be.
q() { $P -h 127.0.0.1 -p $PORT -U postgres -X -A -t -q -c "$1"; }
due_article() {  # an editor's article, scheduled, then made due; prints its id
  $P -h 127.0.0.1 -p $PORT -U postgres -X -A -t -q -v name="$1" <<'SQL' 2>&1 | grep -E '^[0-9a-f-]{36}$'
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000004', false) as ignore \gset
set role authenticated;
select journal_create_article(:'name', :'name') as a \gset
select working_revision_id as r from journal_articles where id = :'a' \gset
select outcome as ignore from journal_save_revision(:'r', 1, '{"body_html":"<p>C.</p>"}') \gset
select journal_schedule(:'r', (select content_hash from journal_revisions where id = :'r'), now() + interval '1 hour') as ignore \gset
reset role;
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a';
select :'a';
SQL
}
M=""
A1=$(due_article race-one)
# Two runners at once: exactly one publication, one audit row.
q "select outcome from journal_publish_due() where article_id = '$A1'" > /tmp/wla-journal-m1 &
q "select outcome from journal_publish_due() where article_id = '$A1'" > /tmp/wla-journal-m2 &
wait
PUBS=$(cat /tmp/wla-journal-m1 /tmp/wla-journal-m2 | grep -c published || true)
AUD=$(q "select count(*) from journal_audit where article_id = '$A1' and action = 'scheduled_published'")
[ -n "$A1" ] && [ "$PUBS" = "1" ] && [ "$AUD" = "1" ] && M+="PASS  M1 two simultaneous runs publish once, audited once"$'\n' || M+="FAIL  M1 two simultaneous runs publish once (id=$A1 pubs=$PUBS audit=$AUD)"$'\n'
# A run while another transaction holds the article: skipped, not blocked; published next run.
A2=$(due_article race-two)
( q "begin; select 1 from journal_articles where id = '$A2' for update; select pg_sleep(4); commit;" >/dev/null ) &
sleep 1
T0=$(date +%s)
SKIP=$(q "select count(*) from journal_publish_due() where article_id = '$A2'")
T1=$(date +%s)
wait
AFTER=$(q "select outcome from journal_publish_due() where article_id = '$A2'")
[ -n "$A2" ] && [ "$SKIP" = "0" ] && [ $((T1-T0)) -lt 3 ] && M+="PASS  M2 a locked article is skipped without waiting"$'\n' || M+="FAIL  M2 a locked article is skipped without waiting (skip=$SKIP secs=$((T1-T0)))"$'\n'
[ "$AFTER" = "published" ] && M+="PASS  M3 and published by the next run" || M+="FAIL  M3 and published by the next run (got '$AFTER')"
echo "======================== M. Concurrent runs (separate sessions)"
echo "$M"
rm -f /tmp/wla-journal-m1 /tmp/wla-journal-m2

PASS=$(( $(echo "$OUT" | grep -c "NOTICE: *PASS" || true) + $(echo "$M" | grep -c "^PASS" || true) ))
FAIL=$(( $(echo "$OUT" | grep -c "NOTICE: *FAIL" || true) + $(echo "$M" | grep -c "^FAIL" || true) ))
# An erroring statement silently drops the check it fed: count it as a failure.
FAIL=$((FAIL + $(echo "$OUT" | grep -c "ERROR:" || true)))
echo ""
echo "PASS: $PASS   FAIL: $FAIL"
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "${WLA_PGDIR:-/tmp/wla-lms/pg}/$PORT" stop >/dev/null 2>&1 || true
[ "$FAIL" -eq 0 ]
