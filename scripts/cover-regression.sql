-- Mission cover storage (D-146), against the real local Supabase schema. One
-- transaction, rolled back: nothing it creates survives. Run by run-cover-regression.sh.
\set ON_ERROR_STOP on
begin;
create temp table r (n serial, label text, ok boolean);
grant all on r to public; grant all on sequence r_n_seq to public;
-- Supabase blocks direct deletes outside the Storage API; its API sets this, and
-- the policy under test is the same either way.
select set_config('storage.allow_delete_query','true',true);

insert into auth.users (id, email, aud, role, instance_id, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('a2000000-0000-4000-8000-00000000000a','cover-admin@wla-local.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','',now(),now(),'{}','{}'),
       ('a2000000-0000-4000-8000-00000000000b','cover-parent@wla-local.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','',now(),now(),'{}','{}');
update profiles set is_admin=true where id='a2000000-0000-4000-8000-00000000000a';
insert into missions (id, slug, title, lab, min_age, max_age, is_free, price_minor, currency, published, cover_image) values
 ('d2000000-0000-4000-8000-000000000001','cover-one','Cover one','decision',11,15,false,1200,'GBP',false,'mission-covers/d2000000-0000-4000-8000-000000000001/shared.png'),
 ('d2000000-0000-4000-8000-000000000002','cover-two','Cover two','decision',11,15,false,1200,'GBP',false,'mission-covers/d2000000-0000-4000-8000-000000000001/shared.png');

insert into r(label,ok) select 'the covers bucket is public, limited to 10 MB and raster types',
  (select public and file_size_limit = 10485760 and allowed_mime_types @> array['image/png','image/jpeg','image/webp'] and cardinality(allowed_mime_types)=3 and not ('image/svg+xml' = any(allowed_mime_types)) from storage.buckets where id='mission-covers');
insert into r(label,ok) select 'every other bucket is still private',
  not exists (select 1 from storage.buckets where id <> 'mission-covers' and public);

-- Anonymous: nothing.
set local role anon;
do $$ begin
  begin insert into storage.objects (bucket_id,name) values ('mission-covers','d2000000-0000-4000-8000-000000000001/anon.png');
        insert into r(label,ok) values ('anon cannot upload',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('anon cannot upload',true); end;
  insert into r(label,ok) select 'anon cannot list the bucket', not exists (select 1 from storage.objects where bucket_id='mission-covers');
  delete from storage.objects where bucket_id='mission-covers';
end $$;
reset role;

-- A signed-in parent: nothing.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-00000000000b","role":"authenticated"}',true);
do $$ begin
  begin insert into storage.objects (bucket_id,name,owner_id) values ('mission-covers','d2000000-0000-4000-8000-000000000001/parent.png','a2000000-0000-4000-8000-00000000000b');
        insert into r(label,ok) values ('a parent cannot upload',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a parent cannot upload',true); end;
  begin insert into storage.objects (bucket_id,name,owner_id) values ('mission-media','d2000000-0000-4000-8000-000000000001/parent.png','a2000000-0000-4000-8000-00000000000b');
        insert into r(label,ok) values ('a parent cannot write to the private media bucket',false);
  exception when insufficient_privilege then insert into r(label,ok) values ('a parent cannot write to the private media bucket',true); end;
end $$;
reset role;

-- An administrator uploads, and can't delete what a mission references.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
insert into storage.objects (bucket_id,name,owner_id) values
  ('mission-covers','d2000000-0000-4000-8000-000000000001/shared.png','a2000000-0000-4000-8000-00000000000a'),
  ('mission-covers','d2000000-0000-4000-8000-000000000001/unused.png','a2000000-0000-4000-8000-00000000000a');
insert into r(label,ok) select 'an admin can upload and read', (select count(*)=2 from storage.objects where bucket_id='mission-covers' and name like 'd2000000-0000-4000-8000-000000000001/%');
delete from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/shared.png';
insert into r(label,ok) select 'a file two missions use can''t be deleted', exists (select 1 from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/shared.png');
reset role;
-- A parent can't delete it either, even an unused one.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-00000000000b","role":"authenticated"}',true);
delete from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/unused.png';
reset role;
insert into r(label,ok) select 'a parent can''t delete a cover', exists (select 1 from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/unused.png');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
delete from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/unused.png';
insert into r(label,ok) select 'an admin can delete an unused file', not exists (select 1 from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/unused.png');
reset role;
-- Replacing on one mission still protects the other's.
update missions set cover_image=null where id='d2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
delete from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/shared.png';
insert into r(label,ok) select 'one mission letting go leaves the other''s file', exists (select 1 from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/shared.png');
reset role;
update missions set cover_image=null where id='d2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-00000000000a","role":"authenticated"}',true);
delete from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/shared.png';
insert into r(label,ok) select 'the last one letting go allows deletion', not exists (select 1 from storage.objects where bucket_id='mission-covers' and name='d2000000-0000-4000-8000-000000000001/shared.png');
reset role;

-- The private buckets kept their policies.
insert into r(label,ok) select 'mission-media has no anonymous read policy',
  not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and qual like '%mission-media%' and roles @> array['anon']::name[]);
insert into r(label,ok) select 'no cover policy allows update',
  not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='UPDATE' and coalesce(qual,'')||coalesce(with_check,'') like '%mission-covers%');

select (case when ok then 'PASS' else 'FAIL' end) || '  ' || label from r order by n;
select 'PASS: ' || count(*) filter (where ok) || '   FAIL: ' || count(*) filter (where not ok) from r;
rollback;
