-- ===========================================================================
-- SUPABASE SHIM for a plain local PostgreSQL cluster.
--
-- Supplies the primitives the migrations expect from a hosted Supabase
-- project, so the REAL migrations and seeds can be executed locally and RLS
-- behaves exactly as it does hosted.
--
-- FIDELITY MATTERS MORE THAN CONVENIENCE HERE. pgcrypto is installed into
-- `extensions`, not `public`, because that is where hosted Supabase puts it.
-- A shim that put it in `public` made `gen_random_bytes` resolve locally and
-- fail on staging — the migration passed every local run and broke on push.
-- ===========================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- --------------------------------------------------------------------- auth
/*
 * Mirrors the columns this schema's own trigger reads. `handle_new_user`
 * copies `raw_user_meta_data->>'name'` into profiles, so the shim must carry
 * it or the trigger fails on the very first insert.
 */
create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
grant select on auth.users to anon, authenticated, service_role;

/*
 * auth.uid() reads the request's JWT subject claim, exactly as GoTrue sets it.
 * Tests act as a real non-owner role with:
 *     set role authenticated;
 *     set request.jwt.claim.sub = '<uuid>';
 */
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text);
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '');
$$;

grant execute on function auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- ------------------------------------------------------------------ storage
create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id       uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name     text,
  owner    uuid,
  created_at timestamptz default now(),
  metadata jsonb
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

/* Splits an object name into path segments, as Supabase's helper does. */
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(name, '/');
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
