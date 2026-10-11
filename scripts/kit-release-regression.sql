-- ===========================================================================
-- Kit rows and parent notes follow the version lifecycle (D-114) — executed.
--
-- One mission with every lifecycle state at once:
--   v1 archived · v2 published (current) · v3 in_review · v4 draft
-- each with its own Kit row ("Kit vN") and parent note ("Note vN").
--
-- Built the way the D-111 backfill builds a lifecycle: content first, while
-- the mission has no version rows (so the immutability triggers allow it),
-- then the version rows by INSERT. No trigger is disabled and no policy is
-- bypassed; every read below runs as a real non-owner role with real claims.
--
-- Run with: scripts/run-kit-release.sh
-- ===========================================================================
\set ON_ERROR_STOP off
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function chk(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when p_ok then 'PASS' else 'FAIL' end, p_label;
end $$;

create or replace function chk_raises(p_label text, p_sql text, p_expect text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform chk(p_label || ' (expected refusal, got success)', false);
exception when others then
  perform chk(p_label, position(p_expect in sqlerrm) > 0
                    or position(p_expect in sqlstate) > 0);
end $$;

-- Titles of the Kit rows / note contents the CURRENT role can see, in order.
create or replace function kit_seen() returns text language sql as $$
  select coalesce(string_agg(title, ',' order by version), '')
  from mission_resources
  where mission_id = 'dddddddd-0000-0000-0000-000000000001';
$$;
create or replace function notes_seen() returns text language sql as $$
  select coalesce(string_agg(content, ',' order by version), '')
  from mission_parent_notes
  where mission_id = 'dddddddd-0000-0000-0000-000000000001';
$$;
grant execute on function chk(text, boolean), chk_raises(text, text, text),
  kit_seen(), notes_seen() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001','kr-admin@t.test'),
  ('cccccccc-0000-0000-0000-000000000002','kr-parent1@t.test'),
  ('cccccccc-0000-0000-0000-000000000003','kr-parent2@t.test'),
  ('cccccccc-0000-0000-0000-000000000004','kr-parent3@t.test');
insert into profiles (id, email, is_admin) values
  ('cccccccc-0000-0000-0000-000000000001','kr-admin@t.test',   true),
  ('cccccccc-0000-0000-0000-000000000002','kr-parent1@t.test', false),
  ('cccccccc-0000-0000-0000-000000000003','kr-parent2@t.test', false),
  ('cccccccc-0000-0000-0000-000000000004','kr-parent3@t.test', false)
on conflict (id) do update set is_admin = excluded.is_admin;
insert into child_profiles (id, parent_id, display_name) values
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002','KrChildA'),
  ('eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000002','KrSiblingB'),
  ('eeeeeeee-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000003','KrOtherFamily'),
  ('eeeeeeee-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000004','KrRevoked');

insert into missions (id, slug, title, lab, min_age, max_age, version, completion_rule)
values ('dddddddd-0000-0000-0000-000000000001', 'kit-release', 'Kit release', 'curiosity', 8, 12, 2,
        jsonb_build_object('type', 'conditions', 'conditions', jsonb_build_array()));

-- Content first: no version rows exist yet, so the triggers permit it.
insert into mission_resources (id, mission_id, version, title, type, storage_path, sort_order)
select ('ffffffff-0000-0000-0000-00000000000' || v)::uuid,
       'dddddddd-0000-0000-0000-000000000001', v, 'Kit v' || v, 'pdf',
       'dddddddd-0000-0000-0000-000000000001/kit-v' || v || '.pdf', 0
from generate_series(1, 4) v;
insert into mission_parent_notes (mission_id, version, content)
select 'dddddddd-0000-0000-0000-000000000001', v, 'Note v' || v
from generate_series(1, 4) v;

insert into mission_versions (mission_id, version, status, completion_rule, created_at, published_at, archived_at)
values
  ('dddddddd-0000-0000-0000-000000000001', 1, 'archived',  null, now(), null, now()),
  ('dddddddd-0000-0000-0000-000000000001', 2, 'published',
     jsonb_build_object('type', 'conditions', 'conditions', jsonb_build_array()), now(), now(), null),
  ('dddddddd-0000-0000-0000-000000000001', 3, 'in_review', null, now(), null, null),
  ('dddddddd-0000-0000-0000-000000000001', 4, 'draft',     null, now(), null, null);

insert into mission_entitlements (child_id, mission_id, source, status) values
  ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','admin','active'),
  ('eeeeeeee-0000-0000-0000-000000000004','dddddddd-0000-0000-0000-000000000001','admin','revoked');

select chk('fixture: four versions, one Kit row and one note each',
  (select count(*) from mission_versions where mission_id = 'dddddddd-0000-0000-0000-000000000001') = 4
  and (select count(*) from mission_resources where mission_id = 'dddddddd-0000-0000-0000-000000000001') = 4
  and (select count(*) from mission_parent_notes where mission_id = 'dddddddd-0000-0000-0000-000000000001') = 4);

\echo ''
\echo '=============== ENTITLED PARENT (PostgREST, as authenticated) ==============='
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000002';

select chk('entitled parent sees Kit rows of RELEASED versions only (archived v1, published v2)',
  kit_seen() = 'Kit v1,Kit v2');
select chk('entitled parent sees parent notes of released versions only',
  notes_seen() = 'Note v1,Note v2');
select chk('entitled parent reads the published version''s Kit (the app''s own query)',
  (select count(*) from mission_resources
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 2) = 1);
select chk('entitled parent reads the published version''s note text',
  (select content from mission_parent_notes
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 2) = 'Note v2');
select chk('IN-REVIEW Kit row is invisible to the entitled parent',
  (select count(*) from mission_resources
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 3) = 0);
select chk('IN-REVIEW parent note is invisible to the entitled parent',
  (select count(*) from mission_parent_notes
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 3) = 0);
select chk('DRAFT Kit row is invisible to the entitled parent',
  (select count(*) from mission_resources
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 4) = 0);
select chk('DRAFT parent note is invisible to the entitled parent',
  (select count(*) from mission_parent_notes
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 4) = 0);
select chk('looking a draft Kit row up by its id finds nothing',
  (select count(*) from mission_resources where id = 'ffffffff-0000-0000-0000-000000000004') = 0);
select chk('mission_kit_for_child (the Kit page) returns the published version''s Kit',
  (select string_agg(title, ',') from mission_kit_for_child(
     'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')) = 'Kit v2');
-- Like private.mission_file_released (D-68), the helper is executable by
-- authenticated because its policies run as the caller; PostgREST does not
-- expose `private` (config.toml [api].schemas). What a direct call could learn
-- is one boolean: whether a version is released.
select chk('the release helper answers only released / not released',
  private.mission_version_released('dddddddd-0000-0000-0000-000000000001', 2)
  and private.mission_version_released('dddddddd-0000-0000-0000-000000000001', 1)
  and not private.mission_version_released('dddddddd-0000-0000-0000-000000000001', 3)
  and not private.mission_version_released('dddddddd-0000-0000-0000-000000000001', 4));

\echo ''
\echo '=============== NO ENTITLEMENT / OTHER FAMILY / REVOKED ==============='
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select chk('a parent with no entitlement sees no Kit row of any version', kit_seen() = '');
select chk('a parent with no entitlement sees no parent note of any version', notes_seen() = '');
select chk_raises('another family cannot use mission_kit_for_child on ChildA',
  $$select * from mission_kit_for_child('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'not_your_child');

set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000004';
select chk('a REVOKED entitlement sees no Kit row', kit_seen() = '');
select chk('a REVOKED entitlement sees no parent note', notes_seen() = '');

reset role;
set role anon;
reset request.jwt.claim.sub;
select chk('anon sees no Kit row and no error', kit_seen() = '');
select chk('anon sees no parent note and no error', notes_seen() = '');

\echo ''
\echo '=============== CHILD SESSION RPCs (token, as anon) ==============='
reset role;
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000002';
select generate_child_access_code('eeeeeeee-0000-0000-0000-000000000001') as code_a \gset
select generate_child_access_code('eeeeeeee-0000-0000-0000-000000000002') as code_b \gset
reset role;
set role anon;
reset request.jwt.claim.sub;
select token as tok_a from redeem_child_code(:'code_a') \gset
select token as tok_b from redeem_child_code(:'code_b') \gset

select chk('child_session_resources returns ONLY the effective (published) version''s Kit',
  (select string_agg(title, ',') from child_session_resources(:'tok_a', 'kit-release')) = 'Kit v2');
select chk('child_session_kit (the app''s child path) agrees',
  (select string_agg(title, ',') from child_session_kit(:'tok_a', 'kit-release')) = 'Kit v2');
select chk('a child cannot resolve a DRAFT Kit file path',
  child_session_resource_path(:'tok_a', 'ffffffff-0000-0000-0000-000000000004') is null);
select chk('a child cannot resolve an IN-REVIEW Kit file path',
  child_session_resource_path(:'tok_a', 'ffffffff-0000-0000-0000-000000000003') is null);
select chk('the unentitled SIBLING''s session sees no Kit at all',
  (select count(*) from child_session_resources(:'tok_b', 'kit-release')) = 0);
select chk('the sibling''s session cannot resolve the published Kit file',
  child_session_resource_path(:'tok_b', 'ffffffff-0000-0000-0000-000000000002') is null);

\echo ''
\echo '=============== A RUN PINNED TO THE ARCHIVED VERSION (D-17) ==============='
reset role;
insert into mission_progress (child_id, mission_id, status, current_screen_key, mission_version)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'in_progress', 'intro', 1);
set role anon;
select chk('a child pinned to archived v1 gets v1''s Kit, not v2''s',
  (select string_agg(title, ',') from child_session_resources(:'tok_a', 'kit-release')) = 'Kit v1');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000002';
select chk('...and the parent''s Kit page follows the pin',
  (select string_agg(title, ',') from mission_kit_for_child(
     'eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')) = 'Kit v1');
select chk('...and the archived note stays readable to the parent',
  (select content from mission_parent_notes
    where mission_id = 'dddddddd-0000-0000-0000-000000000001' and version = 1) = 'Note v1');

\echo ''
\echo '=============== ADMINISTRATOR AND SERVICE ROLE (unchanged) ==============='
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000001';
select chk('an administrator still reads every version''s Kit row', kit_seen() = 'Kit v1,Kit v2,Kit v3,Kit v4');
select chk('an administrator still reads every version''s note', notes_seen() = 'Note v1,Note v2,Note v3,Note v4');
select chk('admin_draft_resources still serves the in-review version',
  (select string_agg(title, ',') from admin_draft_resources('dddddddd-0000-0000-0000-000000000001', 3)) = 'Kit v3');
select chk('admin_draft_parent_note still serves the draft version',
  (select count(*) from admin_draft_parent_note('dddddddd-0000-0000-0000-000000000001', 4)) = 1);
select chk_raises('admin_draft_resources still refuses the published version (D-61)',
  $$select * from admin_draft_resources('dddddddd-0000-0000-0000-000000000001', 2)$$, 'version_not_editable');

reset role;
set role service_role;
reset request.jwt.claim.sub;
select chk('the service role still reads every version (engine store, printables)',
  kit_seen() = 'Kit v1,Kit v2,Kit v3,Kit v4' and notes_seen() = 'Note v1,Note v2,Note v3,Note v4');

\echo ''
\echo '=============== PERMISSIONS ON THE NEW HELPER ==============='
reset role;
select chk('mission_version_released is SECURITY DEFINER with a fixed search_path',
  (select p.prosecdef and p.proconfig @> array['search_path=public']
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'mission_version_released'));
select chk('mission_version_released: authenticated may execute (its policies need it)',
  has_function_privilege('authenticated', 'private.mission_version_released(uuid,integer)', 'EXECUTE'));
select chk('mission_version_released: anon and service_role may not',
  not has_function_privilege('anon', 'private.mission_version_released(uuid,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.mission_version_released(uuid,integer)', 'EXECUTE'));
select chk('mission_version_released: PUBLIC holds no EXECUTE',
  not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'private.mission_version_released(uuid,integer)'::regprocedure and a.grantee = 0));
select chk('child_session_resources stays VOLATILE (D-97)',
  (select provolatile = 'v' from pg_proc where oid = 'public.child_session_resources(text,text)'::regprocedure));
