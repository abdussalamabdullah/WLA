-- ============================================================================
-- PRIVILEGE ESCALATION — a parent could make themselves an administrator.
--
-- FOUND BY LIVE EXECUTION, 2026-09-28, while testing the internal admin.
--
--     set role authenticated;
--     set request.jwt.claim.sub = '<any parent>';
--     update profiles set is_admin = true where id = '<their own id>';
--     -- succeeded
--
-- How it happened: 0001 created
--
--     create policy "parent updates own profile" on profiles
--       for update using (id = auth.uid());
--
-- which is correct for `name` and `email`, the only columns that existed then.
-- 0002 later added `is_admin` to the same table to gate the internal admin,
-- with the comment "there is deliberately no self-service route to becoming an
-- admin" — but the existing policy already WAS one. No `with check`, no column
-- restriction, and Supabase grants UPDATE on the whole table to
-- `authenticated`.
--
-- The consequence was real rather than theoretical: an admin can edit the
-- mission catalogue and change what is published and what is charged.
--
-- TWO INDEPENDENT LOCKS, because one of them can be undone by accident.
--
--   1. Column-level privilege. Postgres checks this BEFORE row-level
--      security, so the update is refused whatever the policy says.
--   2. A trigger. A later `grant all on table profiles to authenticated` —
--      which is exactly what Supabase's own default-privilege setup does —
--      would silently restore the column privilege. The trigger does not care
--      about grants.
--
-- The flag stays settable from the dashboard and by the service role, which is
-- the only intended route.
-- ============================================================================

-- LOCK 1 — column privileges.
--
-- A column-level REVOKE is a no-op while a table-level GRANT UPDATE exists:
-- the table grant already implies every column. So the table privilege is
-- withdrawn first and then re-granted for exactly the two columns a parent may
-- change. Postgres checks this before row-level security, so an attempt is
-- refused whatever the policy says.
revoke update on profiles from authenticated, anon;
grant update (name, email) on profiles to authenticated;

-- LOCK 2 — a trigger, for when the grant above is restored by accident.
--
-- Supabase's default privileges hand `grant all` to `authenticated` for new
-- tables, and any future `grant all on table profiles` would silently undo
-- lock 1. The trigger does not care about grants.
--
-- NOT `security definer`. Inside a definer function `current_user` is the
-- function OWNER, so the check would compare postgres against postgres and
-- never fire — which is exactly how the first version of this migration
-- failed. An invoker trigger sees the role that actually ran the statement.
create or replace function reject_is_admin_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_user in ('authenticated', 'anon')
  then
    raise exception 'is_admin is not self-service';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reject_is_admin_change on profiles;
create trigger profiles_reject_is_admin_change
  before update on profiles
  for each row
  execute function reject_is_admin_change();

-- Tighten the original policy too, so a parent's own update is scoped to their
-- own row on the way IN as well as on the way out. Replacing a named policy is
-- a drop and create, not an edit to 0001.
drop policy if exists "parent updates own profile" on profiles;
create policy "parent updates own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
