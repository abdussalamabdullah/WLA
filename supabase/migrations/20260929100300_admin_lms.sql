-- ===========================================================================
-- ADMIN LMS QUERIES — brief §18–§23.
--
-- NO NEW ACTIVITY TABLE.
--
-- Brief §28 says not to create duplicate concepts where an existing table can
-- carry the feature, and §22 says to avoid storing unnecessary sensitive
-- learner data. Every event the activity feed shows is already a timestamped
-- fact somewhere: a run started, a run completed, a parent registered, a child
-- profile was added, a version was published, a checkout was created.
-- Recording them a second time would duplicate child data for the sake of
-- convenience and create a second thing to keep correct.
--
-- So the feed is DERIVED. It is a query, not a log.
--
-- Every function here refuses unless is_admin(). None of them returns a
-- child's mission responses, reflections or Trail content — an administrator
-- can see that a child is progressing, never what they wrote (D-52's
-- principle, applied to the new surfaces).
-- ===========================================================================

create or replace function admin_overview()
returns table (
  parents bigint, children bigint, active_learners bigint,
  starts bigint, completions bigint, published_missions bigint,
  draft_missions bigint, orders bigint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select
    (select count(*) from profiles),
    (select count(*) from child_profiles),
    -- "Active" is deliberately behavioural, not a flag: a learner who has
    -- touched a mission in the last 30 days.
    (select count(distinct p.child_id) from mission_progress p
      where p.last_activity_at > now() - interval '30 days'),
    (select count(*) from mission_progress where started_at is not null),
    (select count(*) from mission_progress where status = 'complete'),
    (select count(*) from mission_versions where status = 'published'),
    (select count(*) from mission_versions where status in ('draft','in_review')),
    (select count(*) from checkout_intents);
end;
$$;
revoke all on function admin_overview() from public;
grant execute on function admin_overview() to authenticated;

create or replace function admin_activity(p_limit int default 25)
returns table (kind text, happened_at timestamptz, subject text, detail text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select * from (
    select 'mission_started'::text, p.started_at, c.display_name, m.title
      from mission_progress p
      join child_profiles c on c.id = p.child_id
      join missions m on m.id = p.mission_id
     where p.started_at is not null
    union all
    select 'mission_completed', p.completed_at, c.display_name, m.title
      from mission_progress p
      join child_profiles c on c.id = p.child_id
      join missions m on m.id = p.mission_id
     where p.completed_at is not null
    union all
    select 'parent_registered', pr.created_at, coalesce(pr.name, pr.email), null
      from profiles pr
    union all
    select 'child_added', c.created_at, c.display_name, null
      from child_profiles c
    union all
    select 'mission_published', mv.published_at, m.title, 'v' || mv.version
      from mission_versions mv join missions m on m.id = mv.mission_id
     where mv.published_at is not null
  ) e(kind, happened_at, subject, detail)
  where e.happened_at is not null
  order by e.happened_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 200));
end;
$$;
revoke all on function admin_activity(int) from public;
grant execute on function admin_activity(int) to authenticated;

/*
 * Parents. Brief §19: "Do not expose sensitive authentication data."
 * No password hash exists to expose (GoTrue holds it), and nothing here
 * touches auth.users beyond what profiles already mirrors.
 */
create or replace function admin_parents(p_search text default null, p_limit int default 50)
returns table (
  id uuid, email text, name text, is_admin boolean, joined_at timestamptz,
  children bigint, entitlements bigint, orders bigint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select pr.id, pr.email, pr.name, pr.is_admin, pr.created_at,
         (select count(*) from child_profiles c where c.parent_id = pr.id),
         (select count(*) from mission_entitlements e
           join child_profiles c on c.id = e.child_id
          where c.parent_id = pr.id and e.status = 'active'),
         (select count(*) from checkout_intents ci where ci.parent_id = pr.id)
  from profiles pr
  where p_search is null or p_search = ''
     or pr.email ilike '%' || p_search || '%'
     or coalesce(pr.name,'') ilike '%' || p_search || '%'
  order by pr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke all on function admin_parents(text, int) from public;
grant execute on function admin_parents(text, int) to authenticated;

/*
 * Children. Brief §20 wants access-code STATUS, and explicitly not plaintext
 * historical codes. There are none to show: only a bcrypt hash is stored, so
 * "status" here is genuinely all that exists.
 */
create or replace function admin_children(p_search text default null, p_limit int default 50)
returns table (
  id uuid, display_name text, birth_year int, parent_email text,
  missions bigint, in_progress bigint, complete bigint,
  last_activity_at timestamptz, access_code_status text, code_last_used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select c.id, c.display_name, c.birth_year, pr.email,
         (select count(*) from mission_entitlements e
           where e.child_id = c.id and e.status = 'active'),
         (select count(*) from mission_progress p
           where p.child_id = c.id and p.status = 'in_progress'),
         (select count(*) from mission_progress p
           where p.child_id = c.id and p.status = 'complete'),
         (select max(p.last_activity_at) from mission_progress p where p.child_id = c.id),
         case
           when exists (select 1 from child_access_credentials cc
                         where cc.child_id = c.id and cc.revoked_at is null)
             then 'active' else 'none'
         end,
         (select max(cc.last_used_at) from child_access_credentials cc
           where cc.child_id = c.id)
  from child_profiles c
  join profiles pr on pr.id = c.parent_id
  where p_search is null or p_search = ''
     or c.display_name ilike '%' || p_search || '%'
     or pr.email ilike '%' || p_search || '%'
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke all on function admin_children(text, int) from public;
grant execute on function admin_children(text, int) to authenticated;

/*
 * Orders. Brief §21: an admin must NOT be able to fabricate a payment record,
 * so this is read-only and there is no companion write function. Entitlement
 * stays server-controlled — granted by the Stripe webhook against a verified
 * signature, never from this surface.
 *
 * `paid` is derived by asking whether the entitlement the webhook would have
 * written actually exists, rather than trusting a status column an admin could
 * edit.
 */
create or replace function admin_orders(p_limit int default 50)
returns table (
  id uuid, created_at timestamptz, parent_email text, child_name text,
  mission_title text, amount_minor int, currency text, state text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select ci.id, ci.created_at, pr.email, c.display_name, m.title,
         ci.amount_minor, ci.currency,
         case when exists (
           select 1 from mission_entitlements e
            where e.child_id = ci.child_id and e.mission_id = ci.mission_id
              and e.status = 'active'
         ) then 'paid' else 'pending' end
  from checkout_intents ci
  join profiles pr on pr.id = ci.parent_id
  join child_profiles c on c.id = ci.child_id
  join missions m on m.id = ci.mission_id
  order by ci.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke all on function admin_orders(int) from public;
grant execute on function admin_orders(int) to authenticated;

/*
 * Mission-level analytics. Brief §23 — and its own warning that analytics must
 * never be an authorisation mechanism. Nothing here is consulted by any access
 * check; it is reporting only.
 */
create or replace function admin_analytics()
returns table (
  mission_id uuid, slug text, title text, published_version int,
  entitlements bigint, starts bigint, completions bigint,
  in_progress bigint, quiet_14d bigint, completion_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  return query
  select m.id, m.slug, m.title,
         (select mv.version from mission_versions mv
           where mv.mission_id = m.id and mv.status = 'published' limit 1),
         (select count(*) from mission_entitlements e
           where e.mission_id = m.id and e.status = 'active'),
         (select count(*) from mission_progress p
           where p.mission_id = m.id and p.started_at is not null),
         (select count(*) from mission_progress p
           where p.mission_id = m.id and p.status = 'complete'),
         (select count(*) from mission_progress p
           where p.mission_id = m.id and p.status = 'in_progress'),
         -- Drop-off, derived rather than tracked (C7).
         (select count(*) from mission_progress p
           where p.mission_id = m.id and p.status = 'in_progress'
             and p.last_activity_at < now() - interval '14 days'),
         case
           when (select count(*) from mission_progress p
                  where p.mission_id = m.id and p.started_at is not null) = 0
             then 0::numeric
           else round(
             100.0 * (select count(*) from mission_progress p
                       where p.mission_id = m.id and p.status = 'complete')
                   / (select count(*) from mission_progress p
                       where p.mission_id = m.id and p.started_at is not null), 1)
         end
  from missions m
  order by m.title asc;
end;
$$;
revoke all on function admin_analytics() from public;
grant execute on function admin_analytics() to authenticated;

/*
 * Create a brand-new mission with its first draft version — brief §11/§12.
 * The slug is settable only here, at creation, which is what "slug and
 * structural identity must be protected according to versioning rules" (§12)
 * means in practice: there is no code path that renames one afterwards.
 */
create or replace function create_mission(
  p_slug text, p_title text, p_lab wla_lab, p_min_age int, p_max_age int
)
returns missions
language plpgsql
security definer
set search_path = public
as $$
declare v_mission missions;
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;
  if exists (select 1 from missions where slug = p_slug) then
    raise exception 'slug_taken' using errcode = '23505';
  end if;
  if p_min_age > p_max_age then
    raise exception 'invalid_age_range' using errcode = '22023';
  end if;

  insert into missions (slug, title, lab, min_age, max_age, version, published)
  values (p_slug, p_title, p_lab, p_min_age, p_max_age, 1, false)
  returning * into v_mission;

  -- A mission always has a version to author into. Created as a draft, so the
  -- immutability trigger permits screens to be added to it.
  insert into mission_versions (mission_id, version, status, created_by)
  values (v_mission.id, 1, 'draft', auth.uid());

  return v_mission;
end;
$$;
revoke all on function create_mission(text, text, wla_lab, int, int) from public;
grant execute on function create_mission(text, text, wla_lab, int, int) to authenticated;

/*
 * Delete a mission — brief §17, "allow deletion if safe".
 * Safe means: no learner record of any kind. Entitlements, runs and evidence
 * each independently block it, because each is a record a family would lose.
 */
create or replace function delete_mission_if_unused(p_mission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_refs int;
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;

  select
    (select count(*) from mission_entitlements where mission_id = p_mission_id)
  + (select count(*) from mission_progress    where mission_id = p_mission_id)
  + (select count(*) from mission_evidence    where mission_id = p_mission_id)
  + (select count(*) from checkout_intents    where mission_id = p_mission_id)
  into v_refs;

  if v_refs > 0 then
    raise exception 'mission_has_learner_records' using errcode = '23503';
  end if;

  -- Screens are protected by the immutability trigger, so every version has to
  -- be returned to draft before the rows can go.
  update mission_versions set status = 'draft' where mission_id = p_mission_id;
  delete from mission_screens where mission_id = p_mission_id;
  delete from mission_versions where mission_id = p_mission_id;
  delete from missions where id = p_mission_id;
  return true;
end;
$$;
revoke all on function delete_mission_if_unused(uuid) from public;
grant execute on function delete_mission_if_unused(uuid) to authenticated;
