#!/bin/zsh
# REAL pg_cron check for Journal scheduled publishing (D-132).
#
# Starts a THROWAWAY container from the same Supabase Postgres image the local
# stack uses (no volume — it disappears when stopped), applies every migration,
# then waits for pg_cron's own minute tick to publish a due article. Never
# touches the WLA Supabase stack, its volume, or any other container.
#
#   scripts/run-journal-cron-check.sh
#
# Migrations are applied as MIGRATE_AS (default postgres — the role
# `supabase migration up` uses against the local stack, which is NOT a
# superuser), so pg_cron's creation and cron.schedule() are checked with the
# same privileges the real apply will have.
set -e
MIGRATE_AS=${MIGRATE_AS:-postgres}
R=$(cd "$(dirname "$0")/.." && pwd)
IMAGE=${IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.166}
NAME=wla-journal-cron-check
PORT=${PORT:-55481}
P=/opt/homebrew/bin/psql
export PGPASSWORD=postgres

docker rm -f $NAME >/dev/null 2>&1 || true
docker run --rm -d --name $NAME -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:$PORT:5432 "$IMAGE" >/dev/null
trap 'docker rm -f $NAME >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 90); do
  $P -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
q() { $P -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -X -A -t -q -c "$1"; }

# The image ships its own auth/storage schemas; the shim fills only what is missing.
$P -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -q -f "$R/scripts/local-shim.sql" >/dev/null 2>&1 || true
# In the real stack the storage service grants postgres its storage tables
# (checked read-only on the local WLA database: postgres=a*r*w*d*D*x*t*m*);
# the bare image has not run the storage service, so mirror that one grant.
q0() { $P -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -X -A -t -q -c "$1"; }
q0 "grant all on all tables in schema storage to postgres with grant option" >/dev/null
for f in $R/supabase/migrations/*.sql; do
  OUT=$($P -h 127.0.0.1 -p $PORT -U $MIGRATE_AS -d postgres -q -v ON_ERROR_STOP=1 -f "$f" 2>&1) \
    || { echo "MIGRATION FAILED: $(basename $f)"; echo "$OUT" | grep -i error | head -3; exit 1; }
done

R_=""
JOB=$(q "select schedule || ' ' || active::text from cron.job where jobname = 'journal-publish-due'")
[ "$JOB" = "* * * * * true" ] && R_+="PASS  N1 the migration registered the every-minute job"$'\n' || R_+="FAIL  N1 job registered (got '$JOB')"$'\n'

# An editor schedules an article; it is then made due (one second ago).
q "insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000004', 'editor@t.test') on conflict do nothing;
   insert into profiles (id, email, name) values ('cccccccc-0000-0000-0000-000000000004', 'editor@t.test', 'Eda') on conflict do nothing;
   insert into journal_staff (profile_id, role) values ('cccccccc-0000-0000-0000-000000000004', 'editor') on conflict do nothing;" >/dev/null
A=$($P -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -X -A -t -q <<'SQL' 2>&1 | grep -E '^[0-9a-f-]{36}$'
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000004', false) as ignore \gset
set role authenticated;
select journal_create_article('By the clock', 'by-the-clock') as a \gset
select working_revision_id as r from journal_articles where id = :'a' \gset
select outcome as ignore from journal_save_revision(:'r', 1, '{"body_html":"<p>On time.</p>"}') \gset
select journal_schedule(:'r', (select content_hash from journal_revisions where id = :'r'), now() + interval '1 hour') as ignore \gset
reset role;
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a';
select :'a';
SQL
)
BEFORE=$(q "set role anon; select count(*) from journal_public_article('by-the-clock')")
[ "$BEFORE" = "0" ] && R_+="PASS  N2 not public before the job runs"$'\n' || R_+="FAIL  N2 not public before the job runs ($BEFORE)"$'\n'

# Nobody calls anything now: wait for pg_cron's own tick (at most ~70 s).
for i in $(seq 1 75); do
  LIVE=$(q "select live_revision_id is not null from journal_articles where id = '$A'")
  [ "$LIVE" = "t" ] && break
  sleep 1
done
[ "$LIVE" = "t" ] && R_+="PASS  N3 pg_cron published the due article by itself (${i}s)"$'\n' || R_+="FAIL  N3 pg_cron published the due article within 75s"$'\n'
AFTER=$(q "set role anon; select title from journal_public_article('by-the-clock')")
[ "$AFTER" = "By the clock" ] && R_+="PASS  N4 and the public function now returns it"$'\n' || R_+="FAIL  N4 public after the run ($AFTER)"$'\n'
RUN=$(q "select d.status from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'journal-publish-due' order by d.start_time desc limit 1")
[ "$RUN" = "succeeded" ] && R_+="PASS  N5 the job run is recorded as succeeded"$'\n' || R_+="FAIL  N5 job run status ($RUN)"$'\n'
AUD=$(q "select count(*) from journal_audit where article_id = '$A' and action = 'scheduled_published'")
[ "$AUD" = "1" ] && R_+="PASS  N6 published exactly once across runs"$'\n' || R_+="FAIL  N6 audit rows ($AUD)"$'\n'
STATUS=$(q "select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000004', false) is not null; set role authenticated; select configured::text || ' ' || active::text || ' ' || coalesce(last_status,'') from journal_scheduler_status()" | tail -1)
[ "$STATUS" = "true true succeeded" ] && R_+="PASS  N7 the studio status reports the job as configured, active, last run succeeded" || R_+="FAIL  N7 scheduler status ($STATUS)"

# Re-running the registration (as a retried apply would) must not add a job.
REG=$(sed -n '/^do \$cron\$/,/^\$cron\$;/p' "$R/supabase/migrations/20261014120000_journal_cms.sql")
$P -h 127.0.0.1 -p $PORT -U $MIGRATE_AS -d postgres -X -q -v ON_ERROR_STOP=1 -c "$REG" >/dev/null 2>&1
$P -h 127.0.0.1 -p $PORT -U $MIGRATE_AS -d postgres -X -q -v ON_ERROR_STOP=1 -c "$REG" >/dev/null 2>&1
JOBS=$(q "select count(*) || ' ' || string_agg(username, ',') from cron.job where command like '%journal_publish_due%'")
[ "$JOBS" = "1 $MIGRATE_AS" ] && R_+=$'\n'"PASS  N8 re-running the registration keeps exactly one job (owned by $MIGRATE_AS)" || R_+=$'\n'"FAIL  N8 jobs after re-registration ($JOBS)"

echo "======================== N. Real pg_cron (throwaway container)"
echo "$R_"
PASS=$(echo "$R_" | grep -c "^PASS" || true)
FAIL=$(echo "$R_" | grep -c "^FAIL" || true)
echo ""
echo "PASS: $PASS   FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
