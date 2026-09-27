-- ============================================================================
-- Stop disclosing the key of a branch the child did not take.
--
-- FOUND BY LIVE EXECUTION, 2026-09-27. A child sitting on the Decision 1
-- consequence for "Ask about the list" received:
--
--     screen_key       = consequence1_ask
--     next_sequence_key = consequence1_stop
--
-- `next_sequence_key` is the next screen BY SEQUENCE, and the two Decision 1
-- consequences are adjacent. No content leaked — mission_screens still has no
-- client read policy, and the sibling's body was never retrievable — but the
-- browser was told the name of a branch that child will never reach, which is
-- exactly the kind of disclosure the Six Names Build Brief's branch rules
-- exist to prevent.
--
-- THE FIX: send the key only when navigation could actually need it.
--
-- `next_sequence_key` is the LAST fallback in resolveNextScreen, used only
-- when a screen declares no destination of its own. Every Six Names v2 screen
-- declares one — a top-level `next`, or a `next` on every choice option — so
-- for those screens the value was sent and never read. It is now withheld in
-- precisely that case, which strictly reduces what the client is told and
-- changes no navigation.
--
-- Screens that genuinely rely on sequence order are unaffected and still
-- receive it.
--
-- `create or replace` keeps the signature, so the 0008 lesson about duplicate
-- overloads does not apply: the argument list is byte-for-byte the original.
-- ============================================================================

create or replace function get_current_mission_screen(
  p_child_id uuid,
  p_mission_id uuid
)
returns table (
  screen_key text,
  type screen_type,
  title text,
  body text,
  sequence integer,
  configuration jsonb,
  next_sequence_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress mission_progress%rowtype;
begin
  -- 1. the child must belong to the caller
  if not exists (
    select 1 from child_profiles c
    where c.id = p_child_id and c.parent_id = auth.uid()
  ) then
    raise exception 'not_your_child';
  end if;

  -- 2. the child must be entitled to the mission
  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id
      and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled';
  end if;

  -- 3. the child must have started it
  select * into v_progress
  from mission_progress
  where child_id = p_child_id and mission_id = p_mission_id;

  if v_progress.id is null or v_progress.current_screen_key is null then
    return;
  end if;

  -- 4. fall back to the first screen if the saved position no longer exists
  --    in this run's pinned version (Tech Spec §53).
  if not exists (
    select 1 from mission_screens s
    where s.mission_id = p_mission_id
      and s.version = v_progress.mission_version
      and s.screen_key = v_progress.current_screen_key
  ) then
    select s.screen_key into v_progress.current_screen_key
    from mission_screens s
    where s.mission_id = p_mission_id
      and s.version = v_progress.mission_version
    order by s.sequence asc
    limit 1;

    if v_progress.current_screen_key is null then
      return;
    end if;
  end if;

  return query
  select
    s.screen_key,
    s.type,
    s.title,
    s.body,
    s.sequence,
    s.configuration,
    case
      /*
       * The screen names its own destination, so sequence order is never
       * consulted. Withhold it.
       */
      when s.configuration ? 'next' then null

      /*
       * A choice whose every option names its own destination is likewise
       * self-contained. `jsonb_array_length` guards the case of an options
       * array that is present but empty.
       */
      when s.type = 'choice'
       and s.configuration ? 'options'
       and jsonb_array_length(s.configuration -> 'options') > 0
       and not exists (
         select 1
         from jsonb_array_elements(s.configuration -> 'options') o
         where not (o ? 'next')
       )
      then null

      else (
        select n.screen_key
        from mission_screens n
        where n.mission_id = p_mission_id
          and n.version = v_progress.mission_version
          and n.sequence > s.sequence
        order by n.sequence asc
        limit 1
      )
    end as next_sequence_key
  from mission_screens s
  where s.mission_id = p_mission_id
    and s.version = v_progress.mission_version
    and s.screen_key = v_progress.current_screen_key;
end;
$$;

revoke all on function get_current_mission_screen(uuid, uuid) from public;
grant execute on function get_current_mission_screen(uuid, uuid) to authenticated;
