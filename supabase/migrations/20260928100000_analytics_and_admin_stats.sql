-- ============================================================================
-- ANALYTICS-01 — mission starts, completions and drop-off are measurable.
--
-- PRD §32 lists basic mission analytics in Academy core scope. Tech Spec §42
-- adds the constraint that matters more than the metric: "avoid collecting
-- unnecessary child information in analytics", and Brief §53 warns against
-- turning children into an engagement-optimisation dataset.
--
-- WHAT IS DELIBERATELY NOT STORED
--
-- No child id. No progress id. No parent id. No screen key. No response
-- content. An event row records only THAT a mission was started or completed,
-- for which mission and which version, and when. It cannot be joined back to a
-- child, which is the point: the counts are answerable and the individual is
-- not.
--
-- The application's `recordEvent()` is given a progressId by its callers and
-- deliberately drops it before it reaches the database.
--
-- DROP-OFF IS DERIVED, NOT TRACKED (conflict C7)
--
-- There is no `mission_drop_off` event, because drop-off is not something a
-- child does — it is the absence of something. It is computed from
-- mission_progress by `admin_mission_stats()` below: started, not completed,
-- and quiet for longer than the given window.
--
-- ANALYTICS IS NOT A SECURITY BOUNDARY, AND MUST NOT BECOME ONE
--
-- Nothing reads these rows to make an access decision. The write path is a
-- security-definer function that re-establishes parent → child → mission the
-- same way every other Academy write does, so the counts cannot be inflated by
-- an anonymous caller; but if this table were dropped tomorrow, no access
-- decision anywhere would change.
-- ============================================================================

create table if not exists analytics_events (
  id             bigserial primary key,
  name           text not null check (name in ('mission_started', 'mission_completed')),
  mission_id     uuid not null references missions(id) on delete cascade,
  -- D-17: which version of the mission the run was pinned to, so a change in
  -- completion rate can be attributed to a content revision.
  mission_version int not null,
  occurred_at    timestamptz not null default now()
);

create index if not exists analytics_events_mission_idx
  on analytics_events (mission_id, name, occurred_at desc);

alter table analytics_events enable row level security;

-- No client policy for select, insert, update or delete. Writes go through the
-- definer function below; reads are for admins through admin_mission_stats().
-- A table with RLS enabled and no policy is readable by nobody.

-- --------------------------------------------------------------- write ----
/*
 * Record one mission event.
 *
 * Definer, because analytics_events has no client write policy — but it
 * re-establishes the full chain first, so a caller can only record an event
 * for a mission their own child is actually entitled to and has actually
 * started. That keeps the counts honest without making them load-bearing.
 *
 * Returns void and swallows nothing: if authorisation fails it raises, and the
 * application treats a failed analytics write as a non-event (see recordEvent).
 */
create or replace function record_mission_event(
  p_child_id   uuid,
  p_mission_id uuid,
  p_name       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
begin
  if p_name not in ('mission_started', 'mission_completed') then
    raise exception 'unknown_event';
  end if;

  -- 1. the child must belong to the caller
  if not exists (
    select 1 from child_profiles c
    where c.id = p_child_id and c.parent_id = auth.uid()
  ) then
    raise exception 'not_your_child';
  end if;

  -- 2. the child must be entitled
  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id
      and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled';
  end if;

  -- 3. the run must exist, and supplies the pinned version
  select mp.mission_version into v_version
  from mission_progress mp
  where mp.child_id = p_child_id and mp.mission_id = p_mission_id;

  if v_version is null then
    raise exception 'not_started';
  end if;

  -- The child id got us this far and is then discarded: it is an
  -- authorisation input, never a stored dimension.
  insert into analytics_events (name, mission_id, mission_version)
  values (p_name, p_mission_id, v_version);
end;
$$;

revoke all on function record_mission_event(uuid, uuid, text) from public;
grant execute on function record_mission_event(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- read ----
/*
 * Per-mission counts for the internal admin (CMS-01's sibling requirement).
 *
 * Definer so an admin sees totals across every family, which RLS on
 * mission_progress would otherwise prevent — but it refuses outright unless
 * `is_admin()`, so being definer grants nothing to an ordinary parent.
 *
 * Drop-off is derived here rather than tracked: started, never completed, and
 * no activity for `p_stale_days`.
 */
create or replace function admin_mission_stats(p_stale_days int default 14)
returns table (
  mission_id    uuid,
  slug          text,
  title         text,
  version       int,
  published     boolean,
  price_minor   int,
  currency      text,
  is_free       boolean,
  entitlements  bigint,
  starts        bigint,
  completions   bigint,
  in_progress   bigint,
  dropped_off   bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    m.id, m.slug, m.title, m.version, m.published,
    m.price_minor, m.currency, m.is_free,
    (select count(*) from mission_entitlements e
       where e.mission_id = m.id and e.status = 'active'),
    (select count(*) from analytics_events a
       where a.mission_id = m.id and a.name = 'mission_started'),
    (select count(*) from analytics_events a
       where a.mission_id = m.id and a.name = 'mission_completed'),
    (select count(*) from mission_progress p
       where p.mission_id = m.id and p.status = 'in_progress'),
    (select count(*) from mission_progress p
       where p.mission_id = m.id
         and p.status = 'in_progress'
         and p.last_activity_at < now() - make_interval(days => p_stale_days))
  from missions m
  order by m.title;
end;
$$;

revoke all on function admin_mission_stats(int) from public;
grant execute on function admin_mission_stats(int) to authenticated;

-- ------------------------------------------------- version usage (D-17) ----
/*
 * How many runs are pinned to each version of a mission.
 *
 * Surfaced in the mission editor so D-17 is visible where it matters: an
 * editor can see that runs exist on an older version BEFORE changing content,
 * rather than discovering the consequence afterwards. Those runs keep the
 * version they started on; this function is what makes that concrete rather
 * than a paragraph in a document.
 */
create or replace function admin_mission_version_usage(p_mission_id uuid)
returns table (version int, runs bigint, complete bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select p.mission_version,
         count(*),
         count(*) filter (where p.status = 'complete')
  from mission_progress p
  where p.mission_id = p_mission_id
  group by p.mission_version
  order by p.mission_version;
end;
$$;

revoke all on function admin_mission_version_usage(uuid) from public;
grant execute on function admin_mission_version_usage(uuid) to authenticated;
