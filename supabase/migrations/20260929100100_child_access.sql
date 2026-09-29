-- ===========================================================================
-- CHILD ACCESS CODES AND CHILD SESSIONS (D-58, D-59)
--
-- Supersedes part of C2. There is still no child ACCOUNT: no email, no
-- password, no purchases, no family management, no second parent-equivalent
-- identity. A code grants a session scoped to exactly one child profile, and
-- nothing else in the product is reachable through it.
--
-- WHY NOT A SUPABASE AUTH USER PER CHILD
--   It would have reused RLS directly, which is attractive. It was rejected
--   because it creates the child account Architecture §3 forbids, and because
--   auth.uid() would then mean "a parent OR a child", so every existing policy
--   would have to be re-read in that light. A bug there fails open across the
--   whole schema. A separate, narrow mechanism fails closed.
--
-- THE PEPPER
--   A `XXXX-XXXX` code has ~6.5e11 combinations. That is ample against online
--   guessing once rate-limited, but not against an offline attack on a stolen
--   table. So the lookup column is an HMAC keyed with a secret that does NOT
--   live in the credential table, and the verifier is bcrypt on top of that.
--   Dumping child_access_credentials alone therefore yields nothing usable.
-- ===========================================================================

/*
 * WHERE pgcrypto LIVES
 *
 * Hosted Supabase installs pgcrypto into the `extensions` schema; a plain
 * local cluster puts it in `public`. `create extension if not exists pgcrypto`
 * in the init migration is therefore a no-op on hosted, and every unqualified
 * `gen_random_bytes` / `crypt` / `gen_salt` / `hmac` below fails there with
 * "function does not exist".
 *
 * Naming BOTH schemas keeps one migration correct in both places, rather than
 * qualifying every call and breaking local. This was found by pushing to
 * staging: the migration had run clean against a local cluster many times.
 */
set search_path = public, extensions;

-- A pepper, readable only from inside the security-definer functions below.
create table if not exists app_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
-- No policy, and no grants: unreachable from anon, authenticated and
-- service_role alike. Only a definer function running as owner can read it.
revoke all on table app_secrets from public, anon, authenticated, service_role;

insert into app_secrets (name, value)
values ('child_code_pepper', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- --------------------------------------------------------------------------
create table if not exists child_access_credentials (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references child_profiles(id) on delete cascade,
  -- bcrypt, the authoritative verifier.
  code_hash    text not null,
  -- HMAC(code, pepper) — an equality-searchable handle so verification is one
  -- indexed lookup rather than a bcrypt comparison against every row.
  code_lookup  text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);

-- At most one live code per child. Regenerating revokes the previous one,
-- which is what makes "regenerating invalidates the previous code" true in the
-- database rather than only in the action that calls it.
create unique index if not exists child_access_credentials_active_idx
  on child_access_credentials (child_id) where revoked_at is null;
create index if not exists child_access_credentials_lookup_idx
  on child_access_credentials (code_lookup) where revoked_at is null;

create table if not exists child_sessions (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references child_profiles(id) on delete cascade,
  -- 256-bit random token: a keyed digest is sufficient, no bcrypt needed.
  token_lookup text not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists child_sessions_child_idx on child_sessions (child_id);

-- Failed-attempt ledger. Keyed on the attempted code's HMAC, so an attempt
-- against a code that does not exist is still counted.
create table if not exists child_auth_attempts (
  id          bigserial primary key,
  lookup_key  text not null,
  succeeded   boolean not null,
  occurred_at timestamptz not null default now()
);
create index if not exists child_auth_attempts_key_time_idx
  on child_auth_attempts (lookup_key, occurred_at desc);
create index if not exists child_auth_attempts_time_idx
  on child_auth_attempts (occurred_at desc);

alter table child_access_credentials enable row level security;
alter table child_sessions           enable row level security;
alter table child_auth_attempts      enable row level security;

/*
 * A parent may see that a code EXISTS and when it was last used. They may
 * never read code_hash or code_lookup, so the policy is paired with a
 * column-level grant rather than left as `select *`.
 */
create policy "parents read own children credentials" on child_access_credentials
  for select using (
    exists (select 1 from child_profiles c
             where c.id = child_access_credentials.child_id
               and c.parent_id = auth.uid())
  );

revoke all on table child_access_credentials from anon, authenticated;
grant select (id, child_id, created_at, last_used_at, expires_at, revoked_at)
  on child_access_credentials to authenticated;

create policy "parents read own children sessions" on child_sessions
  for select using (
    exists (select 1 from child_profiles c
             where c.id = child_sessions.child_id
               and c.parent_id = auth.uid())
  );
revoke all on table child_sessions from anon, authenticated;
grant select (id, child_id, created_at, last_seen_at, expires_at, revoked_at)
  on child_sessions to authenticated;

revoke all on table child_auth_attempts from anon, authenticated;

-- ======================================================== code generation ==
create or replace function gen_child_code()
returns text
language plpgsql
as $$
declare
  -- No I, L, O, U, 0 or 1: unambiguous when read aloud or written down by a
  -- child, and no accidental words.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  v_out text := '';
  i int;
begin
  for i in 1..8 loop
    v_out := v_out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(v_out, 1, 4) || '-' || substr(v_out, 5, 4);
end;
$$;

create or replace function normalize_child_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function child_code_lookup(p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_pepper text;
begin
  select value into v_pepper from app_secrets where name = 'child_code_pepper';
  return encode(hmac(normalize_child_code(p_code), v_pepper, 'sha256'), 'hex');
end;
$$;
revoke all on function child_code_lookup(text) from public, anon, authenticated;

/*
 * Generate (or regenerate) a child's access code.
 *
 * Returns the plaintext ONCE. It is never stored and cannot be retrieved
 * again — "reveal" in the interface means "reveal what was just generated",
 * not "read it back later". A parent who loses it regenerates.
 */
create or replace function generate_child_access_code(p_child_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_owner uuid;
begin
  select parent_id into v_owner from child_profiles where id = p_child_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_your_child' using errcode = '42501';
  end if;

  -- Regenerating invalidates the previous code and every session it opened.
  update child_access_credentials
     set revoked_at = now()
   where child_id = p_child_id and revoked_at is null;
  update child_sessions
     set revoked_at = now()
   where child_id = p_child_id and revoked_at is null;

  loop
    v_code := gen_child_code();
    exit when not exists (
      select 1 from child_access_credentials
      where code_lookup = child_code_lookup(v_code) and revoked_at is null
    );
  end loop;

  insert into child_access_credentials (child_id, code_hash, code_lookup)
  values (p_child_id,
          crypt(normalize_child_code(v_code), gen_salt('bf', 10)),
          child_code_lookup(v_code));

  return v_code;
end;
$$;
revoke all on function generate_child_access_code(uuid) from public, anon;
grant execute on function generate_child_access_code(uuid) to authenticated;

create or replace function revoke_child_access_code(p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select parent_id into v_owner from child_profiles where id = p_child_id;
  -- An admin may revoke as well (brief §20), but never generate: only a parent
  -- hands a code to their own child.
  if (v_owner is null or v_owner <> auth.uid()) and not is_admin() then
    raise exception 'not_your_child' using errcode = '42501';
  end if;

  update child_access_credentials set revoked_at = now()
   where child_id = p_child_id and revoked_at is null;
  update child_sessions set revoked_at = now()
   where child_id = p_child_id and revoked_at is null;
end;
$$;
revoke all on function revoke_child_access_code(uuid) from public, anon;
grant execute on function revoke_child_access_code(uuid) to authenticated;

-- ============================================================ redemption ===
/*
 * Exchange a code for a session token. Callable by anon — this is the child
 * login endpoint — so every guard that matters lives in here.
 *
 * Rate limiting is deliberately inside the database rather than only in the
 * route handler: the route is not the only thing that can reach this function,
 * and a per-process limiter does not survive a restart or more than one node.
 *
 * Returns the raw token ONCE. Only its keyed digest is stored.
 */
create or replace function redeem_child_code(p_code text)
returns table (
  outcome text, token text, child_id uuid, display_name text, expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
/*
 * RETURNS AN OUTCOME INSTEAD OF RAISING, and that is load-bearing.
 *
 * The first version raised on failure after writing to child_auth_attempts.
 * The raise rolled the INSERT back with it, so the ledger stayed empty and the
 * rate limiter never engaged — seven consecutive wrong codes were all accepted
 * for another try. Found by executing it, not by reading it.
 *
 * Recording a failed attempt IS the security control here, so it has to commit
 * on the failure path. A function that returns a status lets it.
 */
declare
  v_lookup   text;
  v_cred     child_access_credentials;
  v_recent   int;
  v_global   int;
  v_token    text;
  v_pepper   text;
  v_child    child_profiles;
  v_expires  timestamptz;
begin
  if coalesce(trim(p_code), '') = '' then
    return query select 'invalid_code'::text, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  v_lookup := child_code_lookup(p_code);

  -- Per-code limiter: 5 failures in 15 minutes locks this code out.
  select count(*) into v_recent from child_auth_attempts
   where lookup_key = v_lookup and not succeeded
     and occurred_at > now() - interval '15 minutes';

  -- Circuit breaker across all codes, so guessing many codes once each is
  -- caught as well as guessing one code many times.
  select count(*) into v_global from child_auth_attempts
   where not succeeded and occurred_at > now() - interval '5 minutes';

  if v_recent >= 5 or v_global >= 100 then
    insert into child_auth_attempts (lookup_key, succeeded) values (v_lookup, false);
    return query select 'rate_limited'::text, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select * into v_cred from child_access_credentials
   where code_lookup = v_lookup and revoked_at is null
   limit 1;

  -- One combined failure path: a wrong code, a revoked code and an expired
  -- code are indistinguishable to the caller, so this cannot be used to
  -- discover which codes exist.
  if v_cred.id is null
     or v_cred.code_hash <> crypt(normalize_child_code(p_code), v_cred.code_hash)
     or (v_cred.expires_at is not null and v_cred.expires_at < now())
  then
    insert into child_auth_attempts (lookup_key, succeeded) values (v_lookup, false);
    return query select 'invalid_code'::text, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select * into v_child from child_profiles where id = v_cred.child_id;
  if v_child.id is null then
    insert into child_auth_attempts (lookup_key, succeeded) values (v_lookup, false);
    return query select 'invalid_code'::text, null::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  insert into child_auth_attempts (lookup_key, succeeded) values (v_lookup, true);
  update child_access_credentials set last_used_at = now() where id = v_cred.id;

  select value into v_pepper from app_secrets where name = 'child_code_pepper';
  v_token   := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '30 days';

  insert into child_sessions (child_id, token_lookup, expires_at)
  values (v_cred.child_id,
          encode(hmac(v_token, v_pepper, 'sha256'), 'hex'),
          v_expires);

  return query select 'ok'::text, v_token, v_child.id, v_child.display_name, v_expires;
end;
$$;
revoke all on function redeem_child_code(text) from public;
grant execute on function redeem_child_code(text) to anon, authenticated;

/*
 * The child equivalent of requireParent. Given the cookie's raw token, return
 * the child it belongs to — or nothing.
 *
 * Expiry and revocation are checked here, in the database, so a cookie that
 * outlives its session is worthless no matter which code path presents it.
 */
create or replace function verify_child_session(p_token text)
returns table (child_id uuid, display_name text, birth_year int, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
/*
 * RETURNS TABLE turns each output column into a plpgsql variable too, so a
 * bare reference to a same-named table column is ambiguous and Postgres
 * refuses the statement at RUN time, not at CREATE time. Resolve in favour of
 * the column. Found by execution: verify_child_session compiled cleanly and
 * failed on first use.
 */
#variable_conflict use_column
declare
  v_pepper text;
  v_lookup text;
  v_sess   child_sessions;
begin
  if coalesce(trim(p_token), '') = '' then return; end if;

  select value into v_pepper from app_secrets where name = 'child_code_pepper';
  v_lookup := encode(hmac(p_token, v_pepper, 'sha256'), 'hex');

  select * into v_sess from child_sessions
   where token_lookup = v_lookup and revoked_at is null and expires_at > now()
   limit 1;

  if v_sess.id is null then return; end if;

  update child_sessions set last_seen_at = now() where id = v_sess.id;

  return query
  select c.id, c.display_name, c.birth_year, v_sess.expires_at
  from child_profiles c where c.id = v_sess.child_id;
end;
$$;
revoke all on function verify_child_session(text) from public;
grant execute on function verify_child_session(text) to anon, authenticated;

create or replace function revoke_child_session(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_pepper text;
begin
  select value into v_pepper from app_secrets where name = 'child_code_pepper';
  update child_sessions set revoked_at = now()
   where token_lookup = encode(hmac(p_token, v_pepper, 'sha256'), 'hex')
     and revoked_at is null;
end;
$$;
revoke all on function revoke_child_session(text) from public;
grant execute on function revoke_child_session(text) to anon, authenticated;

-- ===================================== child-scoped reads, session-derived ==
/*
 * Everything below takes the SESSION TOKEN, never a child id.
 *
 * This is the whole point of the design: a child id from the browser is not an
 * input to any of these, so there is no "forged child id" case to defend
 * against — the child is derived from the session inside the database. The
 * same discipline the parent chain follows (re-assert the boundary inside the
 * query) applies, one level lower.
 */
create or replace function child_session_missions(p_token text)
returns table (
  mission_id uuid, slug text, title text, description text, lab wla_lab,
  min_age int, max_age int, duration text, delivery_type mission_delivery,
  cover_image text, status mission_status, current_screen_key text,
  last_activity_at timestamptz, mission_version int
)
language plpgsql
security definer
set search_path = public
as $$
/*
 * RETURNS TABLE turns each output column into a plpgsql variable too, so a
 * bare reference to a same-named table column is ambiguous and Postgres
 * refuses the statement at RUN time, not at CREATE time. Resolve in favour of
 * the column. Found by execution: verify_child_session compiled cleanly and
 * failed on first use.
 */
#variable_conflict use_column
declare v_child uuid;
begin
  select v.child_id into v_child from verify_child_session(p_token) v;
  if v_child is null then raise exception 'no_child_session' using errcode = '42501'; end if;

  return query
  select m.id, m.slug, m.title, m.description, m.lab, m.min_age, m.max_age,
         m.duration, m.delivery_type, m.cover_image,
         coalesce(p.status, 'not_started'::mission_status),
         p.current_screen_key, p.last_activity_at, p.mission_version
  from mission_entitlements e
  join missions m on m.id = e.mission_id
  left join mission_progress p
         on p.mission_id = m.id and p.child_id = v_child
  where e.child_id = v_child and e.status = 'active'
  order by coalesce(p.last_activity_at, e.granted_at) desc;
end;
$$;
revoke all on function child_session_missions(text) from public;
grant execute on function child_session_missions(text) to anon, authenticated;
