-- ============================================================================
-- 0029 — Analytics reporting (Enhancement Plan §13, D-76)
-- ============================================================================
--
-- One admin-only function answering the plan's questions from analytics_events
-- and the commerce tables. It returns AGGREGATES ONLY: counts per screen, per
-- option, per variant, per event, per device, per version. The run key is used
-- inside the function to sequence a run's events and never leaves it.
-- ============================================================================

create or replace function admin_mission_insights(p_mission_id uuid, p_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  with ev as (
    select * from analytics_events
    where mission_id = p_mission_id
      and (p_version is null or mission_version = p_version)
  ),
  runs as (
    select run_key,
           bool_or(name = 'mission_completed') as completed,
           bool_or(name = 'session_resumed')   as returned,
           max(occurred_at) as last_at
    from ev where run_key is not null group by run_key
  ),
  last_screen as (
    -- where an unfinished run last arrived
    select distinct on (e.run_key) e.run_key, e.screen_key
    from ev e join runs r on r.run_key = e.run_key and not r.completed
    where e.name = 'screen_entered'
    order by e.run_key, e.occurred_at desc
  ),
  help as (
    select screen_key, run_key, count(*) n
    from ev where name = 'mission_control_opened' and screen_key is not null
    group by screen_key, run_key
  )
  select jsonb_build_object(
    'starts',        (select count(*) from ev where name = 'mission_started'),
    'completions',   (select count(*) from ev where name = 'mission_completed'),
    'by_version',    coalesce((select jsonb_agg(x order by x.version) from (
                        select mission_version as version,
                               count(*) filter (where name = 'mission_started') as starts,
                               count(*) filter (where name = 'mission_completed') as completions
                        from ev group by mission_version) x), '[]'::jsonb),
    'stops',         coalesce((select jsonb_agg(x order by x.runs desc) from (
                        select screen_key, count(*) as runs from last_screen group by screen_key) x), '[]'::jsonb),
    'help',          coalesce((select jsonb_agg(x order by x.opens desc) from (
                        select screen_key, sum(n)::int as opens,
                               count(*) filter (where n >= 2)::int as repeated_runs
                        from help group by screen_key) x), '[]'::jsonb),
    'help_levels',   coalesce((select jsonb_object_agg(lvl, n) from (
                        select coalesce(detail->>'level', '1') lvl, count(*) n
                        from ev where name = 'mission_control_opened' group by 1) x), '{}'::jsonb),
    'branches',      coalesce((select jsonb_agg(x order by x.screen_key, x.option) from (
                        select screen_key, detail->>'option' as option, count(*) as chosen
                        from ev where name = 'branch_chosen' group by 1, 2) x), '[]'::jsonb),
    'variants',      coalesce((select jsonb_object_agg(k, n) from (
                        select detail->>'variant' k, count(*) n from ev where name = 'variant_assigned' group by 1) x), '{}'::jsonb),
    'events',        coalesce((select jsonb_object_agg(k, n) from (
                        select detail->>'event' k, count(*) n from ev where name = 'event_fired' group by 1) x), '{}'::jsonb),
    'friction',      coalesce((select jsonb_agg(x order by x.failures desc) from (
                        select screen_key,
                               count(*) filter (where name = 'validation_failed') as failures,
                               count(*) filter (where name = 'interaction_retry') as retries,
                               count(*) filter (where name = 'code_attempted') as code_attempts
                        from ev where name in ('validation_failed', 'interaction_retry', 'code_attempted')
                        group by screen_key) x), '[]'::jsonb),
    'handoffs',      coalesce((select jsonb_object_agg(screen_key, n) from (
                        select screen_key, count(*) n from ev where name = 'handoff_confirmed' group by 1) x), '{}'::jsonb),
    'qr_scans',      (select count(*) from ev where name = 'qr_scanned'),
    'kit_opens',     (select count(*) from ev where name = 'kit_opened'),
    'trail_saves',   (select count(*) from ev where name = 'trail_saved'),
    'fallbacks',     (select count(*) from ev where name = 'device_fallback_used'),
    'devices',       coalesce((select jsonb_object_agg(k, n) from (
                        select detail->>'device' k, count(*) n from ev
                        where name in ('mission_started', 'session_resumed') and detail ? 'device' group by 1) x), '{}'::jsonb),
    'runs',          (select count(*) from runs),
    'returned_runs', (select count(*) from runs where returned),
    'completed_after_return', (select count(*) from runs where returned and completed),
    'conversion',    jsonb_build_object(
                        -- families who had a free mission and later bought one
                        'free_then_paid', (
                          select count(distinct c.parent_id)
                          from mission_entitlements f
                          join child_profiles c on c.id = f.child_id
                          where f.source = 'free'
                            and exists (
                              select 1 from mission_entitlements p
                              join child_profiles c2 on c2.id = p.child_id
                              where c2.parent_id = c.parent_id and p.source = 'purchase'
                                and p.created_at > f.created_at)),
                        'repeat_purchasers', (
                          select count(*) from (
                            select c.parent_id from mission_entitlements p
                            join child_profiles c on c.id = p.child_id
                            where p.source = 'purchase'
                            group by c.parent_id having count(*) >= 2) x)
                      )
  ) into v;
  return v;
end;
$$;
revoke all on function admin_mission_insights(uuid, int) from public, anon;
grant execute on function admin_mission_insights(uuid, int) to authenticated;
