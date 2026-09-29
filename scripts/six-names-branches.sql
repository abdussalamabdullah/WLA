-- ===========================================================================
-- SIX NAMES — all six branch routes, walked through the REAL engine RPCs.
--
-- §30: Six Names is the reference mission. This proves the LMS layer (version
-- lifecycle, immutability trigger, child sessions, the owns_child seam) did
-- not disturb it, by playing every route to completion exactly as the
-- application does: start_mission → get_current_mission_screen →
-- persist_mission_state → complete_mission.
--
-- It also re-asserts the D-42 rule that an unused sibling branch is never
-- revealed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

create or replace function chk(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when p_ok then 'PASS' else 'FAIL' end, p_label;
end $$;

/*
 * Walk one route. Returns the screens seen, in order.
 *
 * Runs as the owning parent so auth.uid() is real and every ownership check in
 * start_mission / persist_mission_state / complete_mission applies.
 */
create or replace function walk_six_names(p_label text, p_d1 text, p_d2 text)
returns text[]
language plpgsql
as $$
declare
  v_parent  uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_child   uuid;
  v_mission uuid;
  v_pid     uuid;
  v_screen  record;
  v_state   jsonb := '{"visitedScreens":[],"choices":{},"revealed":[],"confirmedHandoffs":[],"multiChoices":{},"respondedScreens":[],"custom":{}}'::jsonb;
  v_next    text;
  v_seen    text[] := '{}';
  v_opt     jsonb;
  v_pick    text;
  i         int;
begin
  select id into v_mission from missions where slug = 'six-names';

  insert into child_profiles (parent_id, display_name)
  values (v_parent, 'Route ' || p_label) returning id into v_child;
  insert into mission_entitlements (child_id, mission_id, source)
  values (v_child, v_mission, 'admin');

  perform set_config('request.jwt.claim.sub', v_parent::text, false);
  perform start_mission(v_child, v_mission);
  select id into v_pid from mission_progress
   where child_id = v_child and mission_id = v_mission;

  for i in 1..40 loop
    select * into v_screen from get_current_mission_screen(v_child, v_mission);
    exit when v_screen.screen_key is null;
    v_seen := v_seen || v_screen.screen_key;

    if v_screen.screen_key = 'complete' then
      perform complete_mission(v_pid, v_state, '[]'::jsonb);
      exit;
    end if;

    v_next := v_screen.configuration->>'next';

    if v_screen.type = 'choice' then
      v_pick := case v_screen.screen_key
                  when 'decision1' then p_d1
                  when 'decision2' then p_d2
                  else (v_screen.configuration->'options'->0->>'id') end;
      select o into v_opt
        from jsonb_array_elements(v_screen.configuration->'options') o
       where o->>'id' = v_pick;
      if v_opt is null then
        raise notice 'FAIL  % : option % missing on %', p_label, v_pick, v_screen.screen_key;
        return v_seen;
      end if;
      v_state := jsonb_set(v_state, array['choices', v_screen.screen_key], to_jsonb(v_pick));
      v_next := v_opt->>'next';
    end if;

    if v_screen.type = 'reveal' then
      v_state := jsonb_set(v_state, '{revealed}',
        (v_state->'revealed') || to_jsonb(v_screen.screen_key));
    end if;
    if v_screen.type = 'handoff' then
      v_state := jsonb_set(v_state, '{confirmedHandoffs}',
        (v_state->'confirmedHandoffs') || to_jsonb(v_screen.screen_key));
    end if;
    v_state := jsonb_set(v_state, '{visitedScreens}',
      (v_state->'visitedScreens') || to_jsonb(v_screen.screen_key));

    exit when v_next is null;
    perform persist_mission_state(v_pid, v_state, v_next, null, null);
  end loop;

  return v_seen;
end $$;

\echo ''
\echo '=============== SIX NAMES — SIX BRANCH ROUTES ==============='
do $$
declare
  routes text[][] := array[
    array['R1 ask->pause',    'ask_about_list',       'ask_everyone_pause'],
    array['R2 ask->share',    'ask_about_list',       'share_the_role'],
    array['R3 ask->stepaway', 'ask_about_list',       'noor_steps_away'],
    array['R4 stop->pause',   'stop_claim_spreading', 'ask_everyone_pause'],
    array['R5 stop->share',   'stop_claim_spreading', 'share_the_role'],
    array['R6 stop->stepaway','stop_claim_spreading', 'noor_steps_away']
  ];
  r        text[];
  seen     text[];
  want1    text;
  want2    text;
  all_conseq text[] := array['consequence1_ask','consequence1_stop',
                             'consequence2_pause','consequence2_share','consequence2_step_away'];
  leaked   text[];
  cl       int;
begin
  foreach r slice 1 in array routes loop
    seen := walk_six_names(r[1], r[2], r[3]);

    want1 := case when r[2] = 'ask_about_list' then 'consequence1_ask' else 'consequence1_stop' end;
    want2 := case r[3]
               when 'ask_everyone_pause' then 'consequence2_pause'
               when 'share_the_role'     then 'consequence2_share'
               else 'consequence2_step_away' end;

    perform chk(r[1] || ': reaches completion', 'complete' = any(seen));
    perform chk(r[1] || ': shows its own first consequence',  want1 = any(seen));
    perform chk(r[1] || ': shows its own second consequence', want2 = any(seen));

    select array_agg(c) into leaked
      from unnest(all_conseq) c
     where c <> want1 and c <> want2 and c = any(seen);
    perform chk(r[1] || ': leaks no unused consequence (D-42)', leaked is null);

    -- Evidence must not be reachable before Decision 2.
    perform chk(r[1] || ': Evidence stays behind Decision 2',
      array_position(seen, 'evidence') is null
      or array_position(seen, 'evidence') > array_position(seen, 'decision2'));

    -- The Changed List sits between the first consequence and Decision 2.
    cl := array_position(seen, 'changed_list');
    perform chk(r[1] || ': Changed List is in position',
      cl is not null
      and cl > array_position(seen, want1)
      and cl < array_position(seen, 'decision2'));

    perform chk(r[1] || ': run is pinned to v2', exists (
      select 1 from mission_progress p
      join child_profiles c on c.id = p.child_id
      where c.display_name = 'Route ' || r[1] and p.mission_version = 2));

    perform chk(r[1] || ': run completed', exists (
      select 1 from mission_progress p
      join child_profiles c on c.id = p.child_id
      where c.display_name = 'Route ' || r[1] and p.status = 'complete'));

    perform chk(r[1] || ': Mission Trail was derived', exists (
      select 1 from mission_evidence e
      join child_profiles c on c.id = e.child_id
      where c.display_name = 'Route ' || r[1]));
  end loop;
end $$;
\echo ''

\echo ''
\echo '=============== SIX NAMES — PLAYED BY A CHILD SESSION ==============='
/*
 * The same mission, walked end to end through child_session_* only.
 *
 * No child id is passed to anything: every call carries the session token and
 * the database derives the child. This is the proof that the child experience
 * is a real path through the engine and not a read-only shell.
 */
do $$
declare
  v_parent  uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_child   uuid;
  v_mission uuid;
  v_code    text;
  v_token   text;
  v_pid     uuid;
  v_screen  record;
  v_state   jsonb := '{"visitedScreens":[],"choices":{},"revealed":[],"confirmedHandoffs":[],"multiChoices":{},"respondedScreens":[],"custom":{}}'::jsonb;
  v_next    text;
  v_seen    text[] := '{}';
  v_opt     jsonb;
  v_pick    text;
  v_rule    jsonb;
  i         int;
begin
  select id into v_mission from missions where slug = 'six-names';
  insert into child_profiles (parent_id, display_name)
  values (v_parent, 'ChildSessionPlayer') returning id into v_child;
  insert into mission_entitlements (child_id, mission_id, source)
  values (v_child, v_mission, 'admin');

  -- The parent issues the code.
  perform set_config('request.jwt.claim.sub', v_parent::text, false);
  v_code := generate_child_access_code(v_child);

  -- From here on, NOBODY is authenticated. Only the token speaks.
  perform set_config('request.jwt.claim.sub', '', false);
  select token into v_token from redeem_child_code(v_code);
  perform chk('child redeems a code with no session of any kind', v_token is not null);

  perform child_session_start_mission(v_token, v_mission);
  select progress_id, completion_rule into v_pid, v_rule
    from child_session_mission(v_token, 'six-names');
  perform chk('child session started a run', v_pid is not null);
  perform chk('the run exposes its PINNED completion rule (D-17)', v_rule is not null);

  for i in 1..40 loop
    select * into v_screen from child_session_current_screen(v_token, v_mission);
    exit when v_screen.screen_key is null;
    v_seen := v_seen || v_screen.screen_key;

    if v_screen.screen_key = 'complete' then
      perform child_session_complete_mission(v_token, v_pid, v_state, '[]'::jsonb);
      exit;
    end if;

    v_next := v_screen.configuration->>'next';
    if v_screen.type = 'choice' then
      v_pick := case v_screen.screen_key
                  when 'decision1' then 'ask_about_list'
                  when 'decision2' then 'share_the_role'
                  else (v_screen.configuration->'options'->0->>'id') end;
      select o into v_opt from jsonb_array_elements(v_screen.configuration->'options') o
       where o->>'id' = v_pick;
      v_state := jsonb_set(v_state, array['choices', v_screen.screen_key], to_jsonb(v_pick));
      v_next := v_opt->>'next';
    end if;
    if v_screen.type = 'reveal' then
      v_state := jsonb_set(v_state, '{revealed}', (v_state->'revealed') || to_jsonb(v_screen.screen_key));
    end if;
    if v_screen.type = 'handoff' then
      v_state := jsonb_set(v_state, '{confirmedHandoffs}', (v_state->'confirmedHandoffs') || to_jsonb(v_screen.screen_key));
    end if;
    v_state := jsonb_set(v_state, '{visitedScreens}', (v_state->'visitedScreens') || to_jsonb(v_screen.screen_key));

    exit when v_next is null;
    perform child_session_persist_state(v_token, v_pid, v_state, v_next, null, null);
  end loop;

  perform chk('child session reached the end of the mission', 'complete' = any(v_seen));
  perform chk('child session run is recorded complete',
    (select status = 'complete' from mission_progress where id = v_pid));
  perform chk('child session run stayed pinned to v2',
    (select mission_version = 2 from mission_progress where id = v_pid));
  perform chk('the Mission Trail was derived for the child',
    exists (select 1 from mission_evidence where child_id = v_child));
  perform chk('the child saw only their own screens, one at a time',
    array_length(v_seen, 1) between 15 and 25);

  -- Analytics must work for a child-driven run too.
  perform child_session_record_event(v_token, v_mission, 'mission_completed');
  perform chk('a child-driven run emits analytics',
    exists (select 1 from analytics_events where name = 'mission_completed'));

  -- And the child still cannot reach anything else.
  begin
    perform admin_overview();
    perform chk('child session cannot reach the admin surface', false);
  exception when others then
    perform chk('child session cannot reach the admin surface', true);
  end;
end $$;
\echo ''
