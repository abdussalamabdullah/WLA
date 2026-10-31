-- ============================================================================
-- A PARENT CAN SEE THEIR CHILD'S ACTIVE CODE AGAIN (D-143, amends D-58).
--
-- Sign-in is untouched: `code_hash` (bcrypt) and `code_lookup` (HMAC) remain the
-- only things `redeem_child_code` reads. This adds a second, separate copy used
-- only for showing the code to its parent.
--
-- The copy is AES-256-GCM ciphertext made by the application server, whose key
-- lives in the server's environment and never in this database. So a stolen copy
-- of the table still yields nothing without that key. It is bound to the child
-- and the credential, so it can't be moved to another row and decrypted.
--
-- No client role can read it. The column is outside the existing column-level
-- grant, and the two functions that touch it are service-role only, called after
-- requireOwnedChild; they re-assert the parent themselves. Administrators have
-- no path to it (they may revoke a code, never see or make one).
--
-- A credential made before this migration has no copy and keeps working. Nothing
-- here replaces a code or signs anyone out.
--
-- Also fixes generation: gen_child_code used random(), which is not a
-- cryptographic generator. It now uses gen_random_bytes with rejection sampling.
-- ============================================================================

set search_path = public, extensions;

alter table child_access_credentials
  add column code_ciphertext text,
  add column code_last_viewed_at timestamptz,
  -- What a parent's own client may know: whether "Show access code" can work.
  add column has_viewable_copy boolean generated always as (code_ciphertext is not null) stored;

-- Deliberately not code_ciphertext.
grant select (has_viewable_copy, code_last_viewed_at) on child_access_credentials to authenticated;

/* A revoked code's copy has no further use, so it doesn't outlive the code. */
create or replace function private.child_code_copy_dies_with_code()
returns trigger
language plpgsql
as $$
begin
  if new.revoked_at is not null then new.code_ciphertext := null; end if;
  return new;
end;
$$;

drop trigger if exists child_code_copy_dies_with_code on child_access_credentials;
create trigger child_code_copy_dies_with_code
  before insert or update on child_access_credentials
  for each row execute function private.child_code_copy_dies_with_code();

-- ======================================================== code generation ==
create or replace function gen_child_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  -- No I, L, O, U, 0 or 1: unambiguous when read aloud or written down by a
  -- child, and no accidental words.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  v_out text := '';
  v_bytes bytea;
  v_byte int;
  i int;
begin
  while length(v_out) < 8 loop
    v_bytes := gen_random_bytes(16);
    for i in 0..15 loop
      v_byte := get_byte(v_bytes, i);
      -- 240 is the largest multiple of 30 under 256: anything above it would
      -- make the first characters of the alphabet slightly likelier.
      if v_byte < 240 and length(v_out) < 8 then
        v_out := v_out || substr(alphabet, 1 + (v_byte % 30), 1);
      end if;
    end loop;
  end loop;
  return substr(v_out, 1, 4) || '-' || substr(v_out, 5, 4);
end;
$$;
revoke all on function gen_child_code() from public, anon, authenticated;

/*
 * Generate (or replace) a child's code and say which credential it is, so the
 * server can bind the encrypted copy to exactly this one. Asking for "the active
 * credential" afterwards would race with a concurrent replacement.
 */
create or replace function issue_child_access_code(p_child_id uuid)
returns table (credential_id uuid, code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_owner uuid;
  v_id uuid;
begin
  select parent_id into v_owner from child_profiles where id = p_child_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_your_child' using errcode = '42501';
  end if;

  -- Replacing invalidates the previous code and every session it opened.
  update child_access_credentials
     set revoked_at = now()
   where child_id = p_child_id and revoked_at is null;
  update child_sessions
     set revoked_at = now()
   where child_id = p_child_id and revoked_at is null;

  loop
    v_code := gen_child_code();
    exit when not exists (
      select 1 from child_access_credentials c
      where c.code_lookup = child_code_lookup(v_code) and c.revoked_at is null
    );
  end loop;

  insert into child_access_credentials (child_id, code_hash, code_lookup)
  values (p_child_id,
          crypt(normalize_child_code(v_code), gen_salt('bf', 10)),
          child_code_lookup(v_code))
  returning id into v_id;

  return query select v_id, v_code;
end;
$$;
revoke all on function issue_child_access_code(uuid) from public, anon;
grant execute on function issue_child_access_code(uuid) to authenticated;

-- The original name stays: same guard, same effect, code only.
create or replace function generate_child_access_code(p_child_id uuid)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select i.code from issue_child_access_code(p_child_id) i;
$$;
revoke all on function generate_child_access_code(uuid) from public, anon;
grant execute on function generate_child_access_code(uuid) to authenticated;

-- ==================================================== the encrypted copy ===
/*
 * Record a copy, once, for a credential that is still active and belongs to this
 * parent's child. A replacement that won a race has revoked this credential, so
 * the late copy is refused rather than overwriting anything. Service role only.
 */
create or replace function store_child_code_copy(
  p_credential_id uuid,
  p_child_id uuid,
  p_parent_id uuid,
  p_ciphertext text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update child_access_credentials c
     set code_ciphertext = p_ciphertext
   where c.id = p_credential_id
     and c.child_id = p_child_id
     and c.revoked_at is null
     and c.code_ciphertext is null
     and exists (select 1 from child_profiles p where p.id = p_child_id and p.parent_id = p_parent_id);
  return found;
end;
$$;
revoke all on function store_child_code_copy(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function store_child_code_copy(uuid, uuid, uuid, text) to service_role;

/*
 * The active credential's copy, for that child's parent, and a record that it was
 * viewed. No row: no active code, no copy, or not this parent's child, which the
 * caller can't tell apart and doesn't need to. Service role only.
 */
create or replace function read_child_code_copy(p_child_id uuid, p_parent_id uuid)
returns table (credential_id uuid, ciphertext text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update child_access_credentials c
     set code_last_viewed_at = now()
   where c.child_id = p_child_id
     and c.revoked_at is null
     and c.code_ciphertext is not null
     and (c.expires_at is null or c.expires_at > now())
     and exists (select 1 from child_profiles p where p.id = p_child_id and p.parent_id = p_parent_id)
  returning c.id, c.code_ciphertext;
end;
$$;
revoke all on function read_child_code_copy(uuid, uuid) from public, anon, authenticated;
grant execute on function read_child_code_copy(uuid, uuid) to service_role;
