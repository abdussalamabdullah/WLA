-- ===========================================================================
-- JOURNAL CMS (D-123 … D-129) — executed, not read.
--
-- Run by scripts/run-journal-regression.sh against a throwaway cluster built
-- by scripts/local-db.sh (real migrations). Every check acts as a real role —
-- anon, a plain parent, writer, reviewer, editor, admin — and calls the
-- functions and tables DIRECTLY, exactly as a crafted PostgREST request
-- would, so nothing here depends on what the interface chooses to show.
--
--   A. Roles and direct-request refusals      S. Automatic scheduled publishing
--   B. Draft privacy                          G. Comments stay internal
--   C. Saving, conflicts, sanitising          H. Unpublish, archive, slugs
--   D. Optional review                        I. Media visibility
--   E. Publishing without approval            J. Import idempotency
--   F. The live version is preserved          K. Deletion
-- ===========================================================================
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

create or replace function chk(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, p_label;
end $$;

/* Run a statement as the CURRENT role; 'ok' or the error text. */
create or replace function try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

/* Act as a signed-in user (null = anon). `reset role` returns to the owner. */
create or replace function act(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, false);
end $$;

-- People. admin = …01 (is_admin), parent = …02 (no Journal role).
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'writer@t.test'),
  ('cccccccc-0000-0000-0000-000000000002', 'writer2@t.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'reviewer@t.test'),
  ('cccccccc-0000-0000-0000-000000000004', 'editor@t.test'),
  ('cccccccc-0000-0000-0000-000000000005', 'editor2@t.test')
on conflict do nothing;
insert into profiles (id, email, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'writer@t.test', 'Wren Writer'),
  ('cccccccc-0000-0000-0000-000000000002', 'writer2@t.test', 'Wyn Writer'),
  ('cccccccc-0000-0000-0000-000000000003', 'reviewer@t.test', 'Rae Reviewer'),
  ('cccccccc-0000-0000-0000-000000000004', 'editor@t.test', 'Eda Editor'),
  ('cccccccc-0000-0000-0000-000000000005', 'editor2@t.test', 'Eli Editor')
on conflict (id) do nothing;

\set ADMIN   '''aaaaaaaa-0000-0000-0000-000000000001'''
\set PARENT  '''aaaaaaaa-0000-0000-0000-000000000002'''
\set W       '''cccccccc-0000-0000-0000-000000000001'''
\set W2      '''cccccccc-0000-0000-0000-000000000002'''
\set R       '''cccccccc-0000-0000-0000-000000000003'''
\set E       '''cccccccc-0000-0000-0000-000000000004'''
\set E2      '''cccccccc-0000-0000-0000-000000000005'''

-- ===========================================================================
\echo ======================== A. Roles and direct-request refusals ==========
-- ===========================================================================
select act(:PARENT);
select chk('A1 a parent cannot create an article',
  try($$select journal_create_article('Hi', 'hi')$$) like '%not_allowed%');
select chk('A2 a parent cannot grant Journal roles',
  try($$select journal_set_role('parent1@t.test', 'editor', true)$$) like '%not_allowed%');
select act(null);
select chk('A3 anon cannot even call a staff function',
  try($$select journal_create_article('Hi', 'hi')$$) like '%permission denied%');

select act(:ADMIN);
select chk('A4 admin grants writer',   journal_set_role('writer@t.test', 'writer', true) = 'granted');
select chk('A5 granting twice is a no-op', journal_set_role('writer@t.test', 'writer', true) = 'unchanged');
select chk('A6 an unknown email is reported, not raised',
  journal_set_role('nobody@t.test', 'writer', true) = 'no_such_account');
select journal_set_role('writer2@t.test', 'writer', true);
select journal_set_role('reviewer@t.test', 'reviewer', true);
select journal_set_role('editor@t.test', 'editor', true);
select journal_set_role('editor2@t.test', 'editor', true);

select act(:W);
select journal_create_article('First light', 'first-light') as a1 \gset
select working_revision_id as r1 from journal_articles where id = :'a1' \gset
select chk('A7 the writer sees their own article and draft',
  (select count(*) from journal_revisions where article_id = :'a1') = 1);

select act(:W2);
select chk('A8 another writer cannot see it',
  (select count(*) from journal_articles where id = :'a1') = 0
  and (select count(*) from journal_revisions where article_id = :'a1') = 0);
select chk('A9 another writer cannot save it (direct RPC)',
  try(format($$select * from journal_save_revision(%L, 1, '{"title":"Hijack"}')$$, :'r1')) like '%not_allowed%');

select act(:W);
select chk('A10 no direct UPDATE on revisions (state)',
  try(format($$update journal_revisions set state = 'approved' where id = %L$$, :'r1')) like '%permission denied%');
select chk('A11 no direct INSERT of an approval',
  try(format($$insert into journal_review_decisions (article_id, revision_id, decision, content_hash) values (%L, %L, 'approve', 'x')$$, :'a1', :'r1')) like '%permission denied%');
select chk('A12 no direct UPDATE of the live pointer',
  try(format($$update journal_articles set live_revision_id = %L where id = %L$$, :'r1', :'a1')) like '%permission denied%');
select chk('A13 a writer cannot assign reviewers',
  try(format($$select journal_assign_reviewer(%L, %L, true)$$, :'a1', :R)) like '%not_allowed%');
select act(:W2);
select chk('A14 a writer cannot publish someone else''s article',
  try(format($$select journal_publish(%L, 'x')$$, :'r1')) like '%not_allowed%');
select act(:W);
select chk('A15 a writer cannot import',
  try($$select * from journal_import_prepare('medium', 'x', 'h', 't')$$) like '%not_allowed%');

-- ===========================================================================
\echo ======================== B. Draft privacy ===============================
-- ===========================================================================
select act(null);
select chk('B1 anon has no SELECT on articles',
  try($$select count(*) from journal_articles$$) like '%permission denied%');
select chk('B2 anon has no SELECT on revisions',
  try($$select count(*) from journal_revisions$$) like '%permission denied%');
-- (Checked by this run's own slug, so it also holds on a real database that
-- has published articles of its own.)
select chk('B3 the public list gains nothing while everything here is draft',
  (select count(*) from journal_public_list(null, null, null, 100, 0) where slug = 'first-light') = 0);
select chk('B4 a draft slug is not served publicly',
  (select count(*) from journal_public_article('first-light')) = 0);
select chk('B5b anon cannot reach the private schema at all',
  try($$select private.journal_slug_ok('x')$$) like '%permission denied%');
select act(:PARENT);
select chk('B5c a signed-in parent cannot call private Journal helpers',
  try($$select private.journal_slug_ok('x')$$) like '%permission denied%');
select chk('B5 a signed-in parent sees no article rows',
  (select count(*) from journal_articles) = 0 and (select count(*) from journal_revisions) = 0);

-- ===========================================================================
\echo ======================== C. Saving, conflicts, sanitising ===============
-- ===========================================================================
select act(:W);
select chk('C1 a save with the current lock version is saved',
  (select outcome from journal_save_revision(:'r1', 1,
     '{"body_html":"<p>The first draft.</p>","excerpt":"A start.","tags":["light","Bad Tag","light"]}')) = 'saved');
select chk('C2 a stale save is a conflict and changes nothing',
  (select outcome from journal_save_revision(:'r1', 1, '{"title":"Stale"}')) = 'conflict'
  and (select title from journal_revisions where id = :'r1') = 'First light');
select chk('C3 tags are normalised and invalid ones dropped',
  (select tags from journal_revisions where id = :'r1') = array['light']);
select chk('C4 every save is attributed with the fields it changed',
  (select changed_fields from journal_revision_changes where revision_id = :'r1' order by id desc limit 1)
    @> array['body', 'excerpt', 'tags']
  and (select actor_id from journal_revision_changes where revision_id = :'r1' order by id desc limit 1) = :W);
select chk('C5 <script> is refused at the database',
  try(format($$select * from journal_save_revision(%L, 2, '{"body_html":"<p>x</p><script>alert(1)</script>"}')$$, :'r1')) like '%body_unsafe%');
select chk('C6 an event-handler attribute is refused',
  try(format($$select * from journal_save_revision(%L, 2, '{"body_html":"<img src=x onerror=alert(1)>"}')$$, :'r1')) like '%body_unsafe%');
select chk('C7 a javascript: URL is refused',
  try(format($$select * from journal_save_revision(%L, 2, '{"body_html":"<a href=\"javascript:alert(1)\">x</a>"}')$$, :'r1')) like '%body_unsafe%');
select chk('C7b prose about code is not mistaken for an attack',
  (select outcome from journal_save_revision(:'r1', 2,
     '{"body_html":"<p>If one = two, the javascript: scheme and data:text/html are just words.</p>"}')) = 'saved');
select journal_save_revision(:'r1', 3, '{"body_html":"<p>The first draft.</p>"}');
select chk('C7c an inline style attribute is refused',
  try(format($$select * from journal_save_revision(%L, 4, '{"body_html":"<p style=\"position:fixed\">x</p>"}')$$, :'r1')) like '%body_unsafe%');
select chk('C8 a reserved slug is refused',
  try(format($$select * from journal_save_revision(%L, 4, '{"slug":"search"}')$$, :'r1')) like '%slug_invalid%');
select journal_create_article('Second', 'second') as a2 \gset
select working_revision_id as r2 from journal_articles where id = :'a2' \gset
select chk('C9 another article''s slug is refused',
  try(format($$select * from journal_save_revision(%L, 1, '{"slug":"first-light"}')$$, :'r2')) like '%slug_taken%');

-- ===========================================================================
\echo ======================== D. Optional review =============================
-- ===========================================================================
select act(:W);
select chk('D1 submitting with a stale lock is refused',
  try(format($$select journal_submit_for_review(%L, 1)$$, :'r1')) like '%conflict%');
select journal_submit_for_review(:'r1', 4);
select chk('D2 submitted → in review', (select state from journal_revisions where id = :'r1') = 'in_review');
select chk('D3 an in-review revision cannot be saved',
  try(format($$select * from journal_save_revision(%L, 4, '{"title":"Sneaky"}')$$, :'r1')) like '%revision_locked%');
reset role;
select chk('D4 even the owner cannot rewrite a locked revision (trigger)',
  try(format($$update journal_revisions set body_html = '<p>tampered</p>' where id = %L$$, :'r1')) like '%revision_locked%');

select act(:R);
select chk('D5 an unassigned reviewer cannot decide',
  try(format($$select journal_decide(%L, 'approve', 'x', null)$$, :'r1')) like '%not_assigned%');
select chk('D6 an unassigned reviewer cannot see the article',
  (select count(*) from journal_articles where id = :'a1') = 0);
select act(:E);
select chk('D7 a parent cannot be assigned as reviewer',
  try(format($$select journal_assign_reviewer(%L, %L, true)$$, :'a1', :PARENT)) like '%not_a_reviewer%');
select chk('D8 a writer-only account cannot be assigned as reviewer',
  try(format($$select journal_assign_reviewer(%L, %L, true)$$, :'a1', :W2)) like '%not_a_reviewer%');
select journal_assign_reviewer(:'a1', :R, true);
select act(:R);
select chk('D9 an assigned reviewer can now see it',
  (select count(*) from journal_revisions where article_id = :'a1') = 1);
select chk('D10 a decision on a hash other than the current one is refused',
  try(format($$select journal_decide(%L, 'approve', 'not-the-hash', null)$$, :'r1')) like '%stale_revision%');
select content_hash as h1 from journal_revisions where id = :'r1' \gset
select chk('D11 requesting changes needs a note',
  try(format($$select journal_decide(%L, 'request_changes', %L, '  ')$$, :'r1', :'h1')) like '%note_required%');
select journal_decide(:'r1', 'request_changes', :'h1', 'Say more about the light.');
select chk('D12 → changes requested', (select state from journal_revisions where id = :'r1') = 'changes_requested');
select act(:W);
select chk('D13 the writer can edit again after changes are requested',
  (select outcome from journal_save_revision(:'r1', 4, '{"body_html":"<p>The first draft, with more light.</p>"}')) = 'saved');
select journal_submit_for_review(:'r1', 5);
select act(:R);
select content_hash as h1 from journal_revisions where id = :'r1' \gset
select journal_decide(:'r1', 'approve', :'h1', null);
select chk('D14 an optional approval is recorded against the exact hash',
  (select state from journal_revisions where id = :'r1') = 'approved'
  and (select content_hash from journal_review_decisions where revision_id = :'r1' and decision = 'approve') = :'h1');
-- In an OPTIONAL review, a reviewer still cannot approve their own edits.
select act(:E);
select chk('D15 editors can edit any article', (select outcome from journal_save_revision(:'r2', 1, '{"body_html":"<p>Two.</p>"}')) = 'saved');
select journal_submit_for_review(:'r2', 2);
select journal_assign_reviewer(:'a2', :E, true);
select content_hash as h2 from journal_revisions where id = :'r2' \gset
select chk('D16 a reviewer cannot approve a revision they edited (optional review only)',
  try(format($$select journal_decide(%L, 'approve', %L, null)$$, :'r2', :'h2')) like '%own_changes%');

-- ===========================================================================
\echo ======================== E. Publishing without approval =================
-- ===========================================================================
select act(:W);
select journal_create_article('Direct to readers', 'direct-to-readers') as a6 \gset
select working_revision_id as r6 from journal_articles where id = :'a6' \gset
select journal_save_revision(:'r6', 1, '{"body_html":"<p>No review needed.</p>"}');
select content_hash as h6 from journal_revisions where id = :'r6' \gset
select chk('E1 nobody reviewed it', not exists (select 1 from journal_review_decisions where revision_id = :'r6')
  and not exists (select 1 from journal_review_assignments where article_id = :'a6'));
select chk('E2 publishing with a stale hash is refused',
  try(format($$select journal_publish(%L, 'nope')$$, :'r6')) like '%stale_revision%');
select journal_publish(:'r6', :'h6');
select chk('E3 the author publishes their own unreviewed draft — and is not blocked for having edited it',
  (select live_revision_id from journal_articles where id = :'a6') = :'r6'::uuid
  and (select state from journal_revisions where id = :'r6') = 'live');
select act(null);
select chk('E4 the public sees it', (select title from journal_public_article('direct-to-readers')) = 'Direct to readers');

select act(:W);
select journal_set_member(:'a6', :W2, 'collaborator');
select journal_start_revision(:'a6') as r6b \gset
select act(:W2);
select chk('E5 a collaborator can edit',
  (select outcome from journal_save_revision(:'r6b', 1, '{"title":"Direct to readers, again"}')) = 'saved');
select content_hash as h6b from journal_revisions where id = :'r6b' \gset
select chk('E6 but a collaborator cannot publish',
  try(format($$select journal_publish(%L, %L)$$, :'r6b', :'h6b')) like '%not_allowed%');
select act(:R);
select chk('E7 a reviewer-only account cannot publish',
  try(format($$select journal_publish(%L, %L)$$, :'r1', :'h1')) like '%not_allowed%');
select act(:PARENT);
select chk('E8 a parent cannot publish',
  try(format($$select journal_publish(%L, %L)$$, :'r6b', :'h6b')) like '%not_allowed%');
select act(:W);
select journal_create_article('Empty', 'empty-piece') as a7 \gset
select working_revision_id as r7 from journal_articles where id = :'a7' \gset
select chk('E9 an empty article cannot be published',
  try(format($$select journal_publish(%L, (select content_hash from journal_revisions where id = %L))$$, :'r7', :'r7')) like '%body_required%');
select journal_create_article('No slug yet', '') as a7b \gset
select working_revision_id as r7b from journal_articles where id = :'a7b' \gset
select journal_save_revision(:'r7b', 1, '{"body_html":"<p>Text.</p>"}');
select chk('E10 an article without a URL slug cannot be published',
  try(format($$select journal_publish(%L, (select content_hash from journal_revisions where id = %L))$$, :'r7b', :'r7b')) like '%slug_required%');
select try(format($$select journal_publish(%L, %L)$$, :'r1', :'h1')) as e11 \gset
select chk('E11 the approved (optionally reviewed) revision also publishes',
  :'e11' = 'ok' and (select live_revision_id from journal_articles where id = :'a1') = :'r1'::uuid);

-- ===========================================================================
\echo ======================== F. The live version is preserved ===============
-- ===========================================================================
select act(:W);
select journal_start_revision(:'a1') as r1b \gset
select chk('F1 editing a live article starts a new draft; the live one stays live',
  :'r1b'::uuid <> :'r1'::uuid and (select state from journal_revisions where id = :'r1') = 'live');
select journal_save_revision(:'r1b', 1, '{"title":"First light, revised","body_html":"<p>Revised body, unfinished.</p>"}');
select act(null);
select chk('F2 the public still sees the published version, never the unfinished draft',
  (select title from journal_public_article('first-light')) = 'First light'
  and (select body_html from journal_public_article('first-light')) not like '%unfinished%');
select act(:W);
select chk('F3 only the working revision can be published (not an older one)',
  try(format($$select journal_publish(%L, %L)$$, :'r1', :'h1')) like '%not_working_revision%');
select content_hash as h1b from journal_revisions where id = :'r1b' \gset
select journal_publish(:'r1b', :'h1b');
select chk('F4 the explicit publish replaces it: the old version is retired',
  (select state from journal_revisions where id = :'r1') = 'retired'
  and (select state from journal_revisions where id = :'r1b') = 'live');
select act(null);
select chk('F5 the public sees the newly published content',
  (select title from journal_public_article('first-light')) = 'First light, revised');
select act(:W);
select journal_start_revision(:'a1') as r1c \gset
select journal_save_revision(:'r1c', 1, '{"title":"After review"}');
select journal_submit_for_review(:'r1c', 2);
select content_hash as h1c from journal_revisions where id = :'r1c' \gset
select chk('F6 a revision still in (optional) review can be published by its author',
  try(format($$select journal_publish(%L, %L)$$, :'r1c', :'h1c')) = 'ok');
select act(:R);
select chk('F7 a decision after publication is refused (not in review any more)',
  try(format($$select journal_decide(%L, 'approve', %L, null)$$, :'r1c', :'h1c')) like '%not_in_review%');
reset role;
select chk('F8 the publish is audited with the exact hash',
  exists (select 1 from journal_audit where revision_id = :'r1c' and action = 'published' and detail->>'content_hash' = :'h1c'));

-- ===========================================================================
\echo ======================== S. Automatic scheduled publishing ==============
-- ===========================================================================
select act(:E);
select journal_create_article('Scheduled piece', 'scheduled-piece') as a3 \gset
select working_revision_id as r3 from journal_articles where id = :'a3' \gset
select journal_save_revision(:'r3', 1, '{"body_html":"<p>Later.</p>"}');
select content_hash as h3 from journal_revisions where id = :'r3' \gset
select chk('S1 a schedule in the past is refused',
  try(format($$select journal_schedule(%L, %L, now() - interval '1 hour')$$, :'r3', :'h3')) like '%schedule_in_past%');
select journal_schedule(:'r3', :'h3', now() + interval '1 hour');
select chk('S2 the scheduled content hash is recorded',
  (select scheduled_hash from journal_articles where id = :'a3') = :'h3');
select chk('S3 a scheduled revision cannot be edited (what was scheduled goes live)',
  try(format($$select * from journal_save_revision(%L, 2, '{"title":"Sneaky"}')$$, :'r3')) like '%scheduled%');
select act(null);
select chk('S4 anon cannot run the scheduler', try($$select * from journal_publish_due()$$) like '%permission denied%');
select act(:E);
select chk('S5 nor can a signed-in editor (only the database job runs it)', try($$select * from journal_publish_due()$$) like '%permission denied%');
reset role;
select chk('S6 a FUTURE article is not published by a run',
  (select count(*) from journal_publish_due()) = 0 and (select live_revision_id from journal_articles where id = :'a3') is null);
select act(null);
select chk('S7 and is not public', (select count(*) from journal_public_article('scheduled-piece')) = 0);
reset role;
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a3';
select outcome as s8 from journal_publish_due() where article_id = :'a3' \gset
select chk('S8 a DUE article is published by the run', :'s8' = 'published');
select act(null);
select chk('S9 and is public afterwards', (select count(*) from journal_public_article('scheduled-piece')) = 1);
reset role;
select chk('S10 a duplicate run does nothing more',
  (select count(*) from journal_publish_due()) = 0
  and (select count(*) from journal_audit where article_id = :'a3' and action = 'scheduled_published') = 1);
select chk('S11 the audit names who scheduled it',
  (select detail->>'scheduled_by' from journal_audit where article_id = :'a3' and action = 'scheduled_published') = :E);

-- S12 overdue: missed runs for three days are caught up by the next run.
select act(:E);
select journal_create_article('Overdue', 'overdue-piece') as a8 \gset
select working_revision_id as r8 from journal_articles where id = :'a8' \gset
select journal_save_revision(:'r8', 1, '{"body_html":"<p>Late.</p>"}');
select journal_schedule(:'r8', (select content_hash from journal_revisions where id = :'r8'), now() + interval '1 hour');
reset role;
update journal_articles set scheduled_for = now() - interval '3 days' where id = :'a8';
select outcome as s12 from journal_publish_due() where article_id = :'a8' \gset
select chk('S12 an OVERDUE article (missed runs) is published by the next run', :'s12' = 'published');

-- S13 the scheduler loses publish permission before the time.
select act(:E2);
select journal_create_article('Revoked', 'revoked-piece') as a9 \gset
select working_revision_id as r9 from journal_articles where id = :'a9' \gset
select journal_save_revision(:'r9', 1, '{"body_html":"<p>R.</p>"}');
select journal_schedule(:'r9', (select content_hash from journal_revisions where id = :'r9'), now() + interval '1 hour');
select act(:ADMIN);
select journal_set_role('editor2@t.test', 'editor', false);
reset role;
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a9';
select outcome as s13 from journal_publish_due() where article_id = :'a9' \gset
select chk('S13 a publisher who lost permission: refused at run time, schedule cleared',
  :'s13' = 'scheduler_not_permitted' and (select scheduled_for from journal_articles where id = :'a9') is null);
select act(null);
select chk('S14 and it is not public', (select count(*) from journal_public_article('revoked-piece')) = 0);
reset role;
select chk('S15 the refusal is audited', exists (select 1 from journal_audit where article_id = :'a9' and action = 'schedule_failed' and detail->>'reason' = 'scheduler_not_permitted'));

-- S16 the content changed after scheduling (forged past the save lock).
select act(:ADMIN);
select journal_set_role('editor2@t.test', 'editor', true);
select act(:E2);
select journal_schedule(:'r9', (select content_hash from journal_revisions where id = :'r9'), now() + interval '1 hour');
reset role;
update journal_revisions set body_html = '<p>Swapped after scheduling.</p>' where id = :'r9';
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a9';
select outcome as s16 from journal_publish_due() where article_id = :'a9' \gset
select chk('S16 content changed since scheduling: refused, not published', :'s16' = 'changed_since_scheduled'
  and (select live_revision_id from journal_articles where id = :'a9') is null);

-- S17 archived before the time.
select act(:E2);
select journal_schedule(:'r9', (select content_hash from journal_revisions where id = :'r9'), now() + interval '1 hour');
select act(:E);
select journal_archive(:'a9', true);
select chk('S17 archiving cancels the schedule', (select scheduled_for from journal_articles where id = :'a9') is null);
select journal_archive(:'a9', false);

-- S18–S21 a temporary failure is retried, never strands the article, never blocks others.
reset role;
create or replace function test_boom() returns trigger language plpgsql as $$
begin
  if new.id::text = current_setting('test.boom_id', true)
     and new.live_revision_id is distinct from old.live_revision_id then
    raise exception 'simulated outage';
  end if;
  return new;
end $$;
create trigger test_boom before update on journal_articles for each row execute function test_boom();
select act(:E);
select journal_create_article('Flaky', 'flaky-piece') as a10 \gset
select working_revision_id as r10 from journal_articles where id = :'a10' \gset
select journal_save_revision(:'r10', 1, '{"body_html":"<p>F.</p>"}');
select journal_schedule(:'r10', (select content_hash from journal_revisions where id = :'r10'), now() + interval '1 hour');
select journal_create_article('Steady', 'steady-piece') as a11 \gset
select working_revision_id as r11 from journal_articles where id = :'a11' \gset
select journal_save_revision(:'r11', 1, '{"body_html":"<p>S.</p>"}');
select journal_schedule(:'r11', (select content_hash from journal_revisions where id = :'r11'), now() + interval '1 hour');
reset role;
update journal_articles set scheduled_for = now() - interval '1 second' where id in (:'a10', :'a11');
select set_config('test.boom_id', :'a10', false);
create temp table run1 as select * from journal_publish_due();
select chk('S18 a failing article is kept scheduled for the next run (retry)',
  (select outcome from run1 where article_id = :'a10') = 'retry'
  and (select scheduled_for from journal_articles where id = :'a10') is not null
  and (select schedule_attempts from journal_articles where id = :'a10') = 1);
select chk('S19 and does not stop another due article from publishing',
  (select outcome from run1 where article_id = :'a11') = 'published');
select set_config('test.boom_id', '', false);
select outcome as s20 from journal_publish_due() where article_id = :'a10' \gset
select chk('S20 when the fault clears, the next run publishes it', :'s20' = 'published'
  and (select schedule_attempts from journal_articles where id = :'a10') = 0);
-- Five consecutive errors: give up visibly.
select act(:E);
select journal_create_article('Broken', 'broken-piece') as a12 \gset
select working_revision_id as r12 from journal_articles where id = :'a12' \gset
select journal_save_revision(:'r12', 1, '{"body_html":"<p>B.</p>"}');
select journal_schedule(:'r12', (select content_hash from journal_revisions where id = :'r12'), now() + interval '1 hour');
reset role;
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a12';
select set_config('test.boom_id', :'a12', false);
select journal_publish_due(); select journal_publish_due(); select journal_publish_due(); select journal_publish_due();
select outcome as s21 from journal_publish_due() where article_id = :'a12' \gset
select chk('S21 after 5 consecutive errors the schedule is cancelled and audited as failed',
  :'s21' = 'failed_after_retries' and (select scheduled_for from journal_articles where id = :'a12') is null
  and (select count(*) from journal_audit where article_id = :'a12' and action = 'schedule_retry') = 4
  and exists (select 1 from journal_audit where article_id = :'a12' and action = 'schedule_failed' and detail->>'reason' = 'error'));
select set_config('test.boom_id', '', false);
drop trigger test_boom on journal_articles;

-- S22 time zones: due-ness is an absolute instant, whatever the session zone.
select act(:E);
select journal_create_article('Zoned', 'zoned-piece') as a13 \gset
select working_revision_id as r13 from journal_articles where id = :'a13' \gset
select journal_save_revision(:'r13', 1, '{"body_html":"<p>Z.</p>"}');
select journal_schedule(:'r13', (select content_hash from journal_revisions where id = :'r13'), now() + interval '1 hour');
reset role;
update journal_articles set scheduled_for = now() + interval '90 seconds' where id = :'a13';
set timezone = 'Pacific/Kiritimati';
select chk('S22 not due 90s early in UTC+14', not exists (select 1 from journal_publish_due() where article_id = :'a13'));
set timezone = 'Pacific/Pago_Pago';
select chk('S23 nor in UTC-11', not exists (select 1 from journal_publish_due() where article_id = :'a13'));
update journal_articles set scheduled_for = now() - interval '1 second' where id = :'a13';
set timezone = 'Europe/London';
select chk('S24 and due one second after the instant, in any zone',
  (select outcome from journal_publish_due() where article_id = :'a13') = 'published');
set timezone = 'UTC';
-- S25 is environment-specific and the RUNNER must say which environment it is:
-- `-v cron=absent` (the isolated cluster, no pg_cron) or `-v cron=present`
-- (the real local stack). Undeclared or misspelt is a FAILURE, never a default,
-- so a misconfigured scheduler cannot pass as "expected here".
\if :{?cron}
\else
\set cron undeclared
\endif
select chk(format('S25 the runner declared the scheduler environment (cron=%s)', :'cron'),
  :'cron' in ('present', 'absent'));
select :'cron' = 'present' as cron_present \gset
select act(:E);
\if :cron_present
select chk('S25a pg_cron here: the studio reports the job configured, active, last run succeeded within 3 min',
  (select configured and active and last_status = 'succeeded' and last_run_at > now() - interval '3 minutes'
   from journal_scheduler_status()));
reset role;
select chk('S25b pg_cron here: exactly one job, every minute, calling journal_publish_due in this database',
  (select count(*) = 1 and bool_and(schedule = '* * * * *' and active and database = current_database()
          and command = 'select public.journal_publish_due()')
   from cron.job where command like '%journal_publish_due%'));
\else
select chk('S25a no pg_cron here: the studio reports automatic publishing as NOT configured',
  (select not configured and not active from journal_scheduler_status()));
reset role;
select chk('S25b no pg_cron here: the cron schema really is absent', to_regclass('cron.job') is null);
\endif
select act(:PARENT);
select chk('S26 a parent cannot read the scheduler status',
  try($$select * from journal_scheduler_status()$$) like '%not_allowed%');

-- ===========================================================================
\echo ======================== G. Comments stay internal ======================
-- ===========================================================================
select act(:R);
select journal_add_comment(:'a1', :'r1c', 'Lovely opening.', null, 'First light') as c1 \gset
select chk('G1 an assigned reviewer can comment', :'c1' is not null);
select act(:W2);
select chk('G2 a non-member writer cannot comment',
  try(format($$select journal_add_comment(%L, null, 'x', null, null)$$, :'a1')) like '%not_allowed%');
select act(:PARENT);
select chk('G3 a parent cannot comment',
  try(format($$select journal_add_comment(%L, null, 'x', null, null)$$, :'a1')) like '%not_allowed%');
select chk('G4 a parent reads no comments', (select count(*) from journal_comments) = 0);
select act(null);
select chk('G5 anon cannot read comments',
  try($$select count(*) from journal_comments$$) like '%permission denied%');
select chk('G6 the public article carries no comment text',
  (select row_to_json(p)::text from journal_public_article('first-light') p) not like '%Lovely opening%');
select act(:W);
select journal_resolve_comment(:'c1', true);
select chk('G7 a member can resolve it', (select resolved_at from journal_comments where id = :'c1') is not null);

-- ===========================================================================
\echo ======================== H. Unpublish, archive, slugs ===================
-- ===========================================================================
select act(:W);
select journal_unpublish(:'a1');
select act(null);
select chk('H1 unpublished by its author: gone from the public list and page',
  (select count(*) from journal_public_article('first-light')) = 0
  and not exists (select 1 from journal_public_list() where slug = 'first-light'));
select act(:W);
select chk('H2 the unpublished working version is a draft again', (select state from journal_revisions where id = :'r1c') = 'draft');
select journal_publish(:'r1c', :'h1c');
select chk('H3 and can be published again', (select live_revision_id from journal_articles where id = :'a1') = :'r1c'::uuid);
select journal_start_revision(:'a1') as r1d \gset
select journal_save_revision(:'r1d', 1, '{"slug":"first-light-renamed"}');
select journal_publish(:'r1d', (select content_hash from journal_revisions where id = :'r1d'));
select act(null);
select chk('H4 the new slug serves the article',
  (select title from journal_public_article('first-light-renamed')) = 'After review');
select chk('H5 the old slug returns only a redirect',
  (select redirect_to from journal_public_article('first-light')) = 'first-light-renamed'
  and (select title from journal_public_article('first-light')) is null);
select act(:W2);
select chk('H6 an old slug cannot be taken by another article',
  try($$select journal_create_article('Thief', 'first-light')$$) like '%slug_taken%');
select act(:W);
select journal_start_revision(:'a1') as r1e \gset
select journal_unpublish(:'a1');
select chk('H7 unpublishing while a newer draft exists retires the live version and keeps the draft',
  (select state from journal_revisions where id = :'r1d') = 'retired'
  and (select state from journal_revisions where id = :'r1e') = 'draft');
select chk('H8 a writer cannot archive',
  try(format($$select journal_archive(%L, true)$$, :'a1')) like '%not_allowed%');
select act(:E);
select journal_archive(:'a1', true);
select act(:W);
select chk('H9 archived: cannot be edited',
  try(format($$select journal_start_revision(%L)$$, :'a1')) like '%archived%');
select chk('H10 archived: cannot be published',
  try(format($$select journal_publish(%L, (select content_hash from journal_revisions where id = %L))$$, :'r1e', :'r1e')) like '%archived%');
select act(:E);
select journal_archive(:'a1', false);
select chk('H11 unarchived: back to unpublished, not live',
  (select live_revision_id from journal_articles where id = :'a1') is null);

-- ===========================================================================
\echo ======================== I. Media visibility ============================
-- ===========================================================================
reset role;
insert into storage.objects (bucket_id, name) values
  ('journal-media', :'a3' || '/hero.png'),
  ('journal-media', :'a3' || '/unused.png');
select act(:W2);
select chk('I1 a non-member cannot register media',
  try(format($$select journal_register_media(%L, %L, 'image/png', 10, 'Hero', null)$$, :'a3', :'a3' || '/hero.png')) like '%not_allowed%');
select act(:E);
select chk('I2 a path outside the article is refused',
  try(format($$select journal_register_media(%L, %L, 'image/png', 10, 'x', null)$$, :'a3', :'a1' || '/hero.png')) like '%path_outside_article%');
select chk('I3 an object that was never uploaded is refused',
  try(format($$select journal_register_media(%L, %L, 'image/png', 10, 'x', null)$$, :'a3', :'a3' || '/ghost.png')) like '%object_missing%');
select chk('I4 SVG is not an accepted type',
  try(format($$select journal_register_media(%L, %L, 'image/svg+xml', 10, 'x', null)$$, :'a3', :'a3' || '/unused.png')) like '%check constraint%');
select journal_register_media(:'a3', :'a3' || '/hero.png', 'image/png', 10, 'Hero', null) as m1 \gset
select journal_register_media(:'a3', :'a3' || '/unused.png', 'image/png', 10, 'Unused', null) as m2 \gset
select journal_start_revision(:'a3') as r3b \gset
select journal_save_revision(:'r3b', 1, format('{"featured_media_id":"%s","featured_alt":"Hero","body_html":"<p>Now.</p>"}', :'m1')::jsonb);
select act(null);
select chk('I5 anon cannot read media used only by a draft revision',
  (select count(*) from storage.objects where bucket_id = 'journal-media' and name = :'a3' || '/hero.png') = 0
  and journal_media_path(:'m1') is null);
select act(:E);
select journal_publish(:'r3b', (select content_hash from journal_revisions where id = :'r3b'));
select act(null);
select chk('I6 the live revision''s image becomes public',
  (select count(*) from storage.objects where bucket_id = 'journal-media' and name = :'a3' || '/hero.png') = 1);
select chk('I6b the public can resolve the live image''s path',
  journal_media_path(:'m1') = :'a3' || '/hero.png');
select chk('I6c but not the path of an unused image',
  journal_media_path(:'m2') is null);
select chk('I7 an image the live revision does not use stays private',
  (select count(*) from storage.objects where bucket_id = 'journal-media' and name = :'a3' || '/unused.png') = 0);
select act(:E);
select journal_unpublish(:'a3');
select act(null);
select chk('I8 unpublishing makes it private again',
  (select count(*) from storage.objects where bucket_id = 'journal-media' and name = :'a3' || '/hero.png') = 0);
select chk('I8b and its path is no longer resolvable by the public',
  journal_media_path(:'m1') is null);
select act(:E);
select chk('I9 staff can still read it to preview',
  (select count(*) from storage.objects where bucket_id = 'journal-media' and name = :'a3' || '/hero.png') = 1);
select act(:W);
select journal_create_article('Borrower', 'borrower') as a5 \gset
select chk('I10 a featured image from another article is refused',
  try(format($$select * from journal_save_revision((select working_revision_id from journal_articles where id = %L), 1, '{"featured_media_id":"%s"}')$$, :'a5', :'m1')) like '%media_not_in_article%');

-- ===========================================================================
\echo ======================== J. Import idempotency ==========================
-- ===========================================================================
select act(:E);
select chk('J1 first import of a post creates a draft',
  (select outcome from journal_import_prepare('medium', 'abc123', 'hash-1', 'Imported one')) = 'new');
select article_id as ia from journal_import_sources where source_id = 'abc123' \gset
select chk('J2 a retry after an interrupted import reuses the same article',
  (select outcome || ':' || article_id from journal_import_prepare('medium', 'abc123', 'hash-1', 'Imported one')) = 'new:' || :'ia');
select chk('J3 apply writes the content with its slug',
  (select final_slug from journal_import_apply(:'ia', 'medium', 'abc123', 'hash-1', 'https://medium.com/p/abc123',
     '{"title":"Imported one","slug":"imported-one","body_html":"<p>From Medium.</p>","original_published_at":"2019-04-02T10:15:00Z"}')) = 'imported-one');
select chk('J4 importing the same content again changes nothing',
  (select outcome from journal_import_prepare('medium', 'abc123', 'hash-1', 'Imported one')) = 'unchanged'
  and (select count(*) from journal_import_sources where source_id = 'abc123') = 1
  and (select count(*) from journal_articles where id = :'ia') = 1);
select chk('J5 changed upstream, untouched here: updatable',
  (select outcome from journal_import_prepare('medium', 'abc123', 'hash-2', 'Imported one')) = 'update');
select journal_import_apply(:'ia', 'medium', 'abc123', 'hash-2', 'https://medium.com/p/abc123',
  '{"title":"Imported one (v2)","slug":"imported-one","body_html":"<p>From Medium, updated.</p>"}');
select chk('J6 the update kept the same article and slug',
  (select title || '|' || slug from journal_revisions where article_id = :'ia') = 'Imported one (v2)|imported-one');
select chk('J7 imported articles are never public',
  (select live_revision_id from journal_articles where id = :'ia') is null
  and (select state from journal_revisions where article_id = :'ia') = 'draft');
select journal_save_revision((select working_revision_id from journal_articles where id = :'ia'),
  (select lock_version from journal_revisions where article_id = :'ia'), '{"excerpt":"Edited in WLA."}');
select chk('J8 once edited in WLA, a changed source is left alone',
  (select outcome from journal_import_prepare('medium', 'abc123', 'hash-3', 'Imported one')) = 'edited'
  and try(format($$select * from journal_import_apply(%L, 'medium', 'abc123', 'hash-3', null, '{"title":"Clobber"}')$$, :'ia')) like '%edited%');
select (select article_id from journal_import_prepare('medium', 'def456', 'hash-x', 'Same slug')) as ib \gset
select chk('J9 a slug conflict is resolved and reported',
  (select final_slug || ':' || slug_changed from journal_import_apply(:'ib', 'medium', 'def456', 'hash-x', null,
     '{"title":"Same slug","slug":"imported-one","body_html":"<p>Two.</p>"}')) = 'imported-one-2:true');
select chk('J10 unsafe imported HTML is refused at the database',
  try(format($$select * from journal_import_apply(%L, 'medium', 'def456', 'hash-y', null, '{"body_html":"<iframe src=x>"}')$$, :'ib')) like '%body_unsafe%');

-- ===========================================================================
\echo ======================== K. Deletion ====================================
-- ===========================================================================
select act(:E);
select chk('K1 an article that was ever published cannot be deleted',
  try(format($$select journal_delete_article(%L)$$, :'a1')) like '%was_published%');
select act(:W);
select chk('K2 a writer cannot delete',
  try(format($$select journal_delete_article(%L)$$, :'a2')) like '%not_allowed%');
select act(:E);
select journal_delete_article(:'a2');
reset role;
select chk('K3 a never-published draft can be deleted, and the audit survives',
  not exists (select 1 from journal_articles where id = :'a2')
  and exists (select 1 from journal_audit where article_id = :'a2' and action = 'deleted'));

-- ===========================================================================
\echo ======================== P. Private preview links (D-134) ================
-- ===========================================================================
select act(:W);
select journal_create_article('Preview piece', 'preview-piece') as ap \gset
select working_revision_id as rp from journal_articles where id = :'ap' \gset
reset role;
insert into storage.objects (bucket_id, name) values
  ('journal-media', :'ap' || '/in-body.png'), ('journal-media', :'ap' || '/not-used.png');
select act(:W);
select journal_register_media(:'ap', :'ap' || '/in-body.png', 'image/png', 10, 'In body', null) as pm1 \gset
select journal_register_media(:'ap', :'ap' || '/not-used.png', 'image/png', 10, null, null) as pm2 \gset
select journal_save_revision(:'rp', 1, format('{"body_html":"<p>First draft.</p><figure><img src=\"/api/journal/media/%s\" alt=\"In body\"></figure>"}', :'pm1')::jsonb);
select act(:PARENT);
select chk('P1 a parent cannot make a preview link',
  try(format($$select * from journal_create_preview_link(%L)$$, :'ap')) like '%not_allowed%');
select act(:W2);
select chk('P2 a writer who is not on the article cannot make one',
  try(format($$select * from journal_create_preview_link(%L)$$, :'ap')) like '%not_allowed%');
select act(null);
select chk('P2b nor can anyone signed out',
  try(format($$select * from journal_create_preview_link(%L)$$, :'ap')) like '%permission denied%');
select act(:W);
select token as ptok, link_id as plink from journal_create_preview_link(:'ap') \gset
reset role;
select chk('P3 the author gets a 43-character token; only its SHA-256 is stored',
  length(:'ptok') = 43
  and (select token_hash from journal_preview_links where id = :'plink') = encode(extensions.digest(convert_to(:'ptok', 'UTF8'), 'sha256'), 'hex')
  and not exists (select 1 from journal_preview_links where token_hash = :'ptok')
  and not exists (select 1 from journal_audit where detail::text like '%' || :'ptok' || '%'));
select act(null);
select chk('P4 signed out, the link shows the latest saved draft',
  (select title from journal_preview_article(:'ptok')) = 'Preview piece'
  and (select body_html from journal_preview_article(:'ptok')) like '%First draft.%'
  and (select is_live from journal_preview_article(:'ptok')) is not true);
select chk('P5 the public API still does not know the draft',
  (select count(*) from journal_public_article('preview-piece')) = 0
  and (select count(*) from journal_public_list(null, null, 'Preview', 50, 0)) = 0);
select chk('P6 signed out, the links table itself is closed',
  try($$select count(*) from journal_preview_links$$) like '%permission denied%');
select chk('P7 a wrong, short or empty token shows nothing',
  (select count(*) from journal_preview_article(repeat('x', 43))) = 0
  and (select count(*) from journal_preview_article('short')) = 0
  and (select count(*) from journal_preview_article(null)) = 0);
select chk('P8 the image the draft uses is reachable through the link; an unused one is not',
  journal_preview_media_path(:'ptok', :'pm1') = :'ap' || '/in-body.png'
  and journal_preview_media_path(:'ptok', :'pm2') is null
  and journal_preview_media_path(repeat('x', 43), :'pm1') is null);
select chk('P9 an image of another article is never reachable through this link',
  journal_preview_media_path(:'ptok', :'m1') is null);
select chk('P10 holding a link grants no editing at all',
  try(format($$select * from journal_save_revision(%L, 2, '{"title":"Hijacked"}')$$, :'rp')) like '%permission denied%'
  and try(format($$select journal_publish(%L, 'x')$$, :'rp')) like '%permission denied%');
select act(:W);
select journal_save_revision(:'rp', 2, '{"body_html":"<p>Second draft.</p>"}');
select act(null);
select chk('P11 the link follows the latest SAVED version',
  (select body_html from journal_preview_article(:'ptok')) like '%Second draft.%'
  and journal_preview_media_path(:'ptok', :'pm1') is null);
select act(:W2);
select chk('P12 someone who cannot edit the article cannot revoke its link',
  try(format($$select journal_revoke_preview_link(%L)$$, :'plink')) like '%not_allowed%');
select act(:W);
select chk('P13 staff on the article can list its links (no token column exists)',
  (select count(*) from journal_preview_links where article_id = :'ap') = 1
  and not exists (select 1 from information_schema.columns where table_name = 'journal_preview_links' and column_name = 'token'));
select journal_revoke_preview_link(:'plink');
select act(null);
select chk('P14 a revoked link shows nothing',
  (select count(*) from journal_preview_article(:'ptok')) = 0);
select act(:W);
select token as ptok2, link_id as plink2 from journal_create_preview_link(:'ap') \gset
reset role;
update journal_preview_links set expires_at = now() - interval '1 second' where id = :'plink2';
select act(null);
select chk('P15 an expired link shows nothing',
  (select count(*) from journal_preview_article(:'ptok2')) = 0);
select act(:W);
select token as ptok3 from journal_create_preview_link(:'ap') \gset
select act(:E);
select journal_archive(:'ap', true);
select act(null);
select chk('P16 an archived article''s link shows nothing',
  (select count(*) from journal_preview_article(:'ptok3')) = 0);
select act(:E);
select journal_archive(:'ap', false);
reset role;
select chk('P17 making and revoking links is audited',
  (select count(*) from journal_audit where article_id = :'ap' and action = 'preview_link_created') = 3
  and (select count(*) from journal_audit where article_id = :'ap' and action = 'preview_link_revoked') = 1);

-- ===========================================================================
\echo ======================== U. Unused uploads are removed safely (D-135) ====
-- ===========================================================================
select act(:W);
select journal_create_article('Cleanup piece', 'cleanup-piece') as au \gset
select working_revision_id as ru from journal_articles where id = :'au' \gset
reset role;
insert into storage.objects (bucket_id, name, owner_id, created_at) values
  ('journal-media', :'au' || '/kept.png', :W, now()),
  ('journal-media', :'au' || '/dropped.png', :W, now()),
  ('journal-media', :'au' || '/orphan-old.png', :E, now() - interval '2 hours'),
  ('journal-media', :'au' || '/orphan-mine.png', :W, now()),
  ('journal-media', :'au' || '/orphan-theirs.png', :E, now());
select act(:W);
select journal_register_media(:'au', :'au' || '/kept.png', 'image/png', 10, 'Kept', null) as um1 \gset
select journal_register_media(:'au', :'au' || '/dropped.png', 'image/png', 10, 'Dropped', null) as um2 \gset
select journal_save_revision(:'ru', 1, format('{"body_html":"<p>x</p><figure><img src=\"/api/journal/media/%s\" alt=\"Kept\"></figure>"}', :'um1')::jsonb);
select chk('U1 an image uploaded in the last 24 hours is never forgotten (an editor may still be using it)',
  try(format($$select journal_forget_media(%L)$$, :'um2')) like '%media_recent%');
reset role;
update journal_media set created_at = now() - interval '2 days' where id in (:'um1', :'um2');
select act(:W);
select chk('U2 listing unused uploads: the unreferenced image and the old unregistered file only',
  (select array_agg(storage_path order by storage_path) from journal_unused_media(:'au'))
    = array[:'au' || '/dropped.png', :'au' || '/orphan-old.png']);
select chk('U3 an image a version uses can never be forgotten',
  try(format($$select journal_forget_media(%L)$$, :'um1')) like '%media_in_use%');
select chk('U4 the storage delete rule refuses a registered image (forget it first)',
  not journal_media_removable(:'au' || '/kept.png') and not journal_media_removable(:'au' || '/dropped.png'));
-- Two statements: a check in the same statement would read the snapshot from before the delete.
select journal_forget_media(:'um2') as forgot \gset
select chk('U5 forgetting the unused image returns its path and removes its row',
  :'forgot' = :'au' || '/dropped.png'
  and not exists (select 1 from journal_media where id = :'um2'));
select chk('U6 then its file may be removed, as may old unregistered files and the caller''s own',
  journal_media_removable(:'au' || '/dropped.png')
  and journal_media_removable(:'au' || '/orphan-old.png')
  and journal_media_removable(:'au' || '/orphan-mine.png'));
select chk('U7 but not someone else''s upload from the last hour',
  not journal_media_removable(:'au' || '/orphan-theirs.png'));
select act(:W2);
select chk('U8 someone who cannot edit the article can remove nothing of it',
  not journal_media_removable(:'au' || '/orphan-old.png')
  and try(format($$select * from journal_unused_media(%L)$$, :'au')) like '%not_allowed%'
  and try(format($$select journal_forget_media(%L)$$, :'um1')) like '%not_allowed%');
select act(null);
select chk('U9 signed out: none of these can be called',
  try(format($$select * from journal_unused_media(%L)$$, :'au')) like '%permission denied%'
  and try(format($$select journal_forget_media(%L)$$, :'um1')) like '%permission denied%'
  and try(format($$select journal_media_removable(%L)$$, :'au' || '/orphan-old.png')) like '%permission denied%');
select act(:E);
select journal_publish(:'ru', (select content_hash from journal_revisions where id = :'ru'));
reset role;
update journal_media set is_public = true where id = :'um1';
select act(:W);
select chk('U10 a public image is never forgotten',
  try(format($$select journal_forget_media(%L)$$, :'um1')) like '%media_in_use%');
reset role;
select chk('U11 removing an image is audited',
  exists (select 1 from journal_audit where article_id = :'au' and action = 'media_removed' and detail->>'media_id' = :'um2'));
select chk('U12 the bucket itself enforces 10 MB and the raster allowlist',
  (select file_size_limit = 10485760 and allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
   from storage.buckets where id = 'journal-media'));

-- ===========================================================================
\echo ======================== T. An article can start untitled (D-136) =======
-- ===========================================================================
select act(:W);
select journal_create_article('', '') as at1 \gset
select working_revision_id as rt1 from journal_articles where id = :'at1' \gset
select chk('T1 a writer can start an untitled article',
  (select title from journal_revisions where id = :'rt1') = '');
select chk('T2 which cannot be published without a title',
  try(format($$select journal_publish(%L, %L)$$, :'rt1', (select content_hash from journal_revisions where id = :'rt1'))) like '%title_required%');
select chk('T3 an over-long title is still refused at the start',
  try(format($$select journal_create_article(%L, '')$$, repeat('x', 201))) like '%title_too_long%');
select act(:PARENT);
select chk('T4 a parent still cannot start one',
  try($$select journal_create_article('', '')$$) like '%not_allowed%');

-- ===========================================================================
\echo ======================== L. Existing Academy data untouched =============
-- ===========================================================================
reset role;
select chk('L1 missions are unchanged by the Journal migration',
  (select count(*) from missions where slug = 'six-names') = 1);
select chk('L2 profiles carry no new columns',
  (select count(*) from information_schema.columns where table_name = 'profiles') = 6);
