-- ============================================================================
-- 0036 — Mission Board (Enhancement Plan §9, Architecture §16 as amended, D-73)
-- ============================================================================
--
-- A contribution is a COPY of one eligible Mission Trail entry's text, made
-- anonymous, that a parent has permitted and WLA has moderated. The model:
--
--   eligible     digital Trail evidence with text, owned by the child. Physical
--                evidence is never stored, so it can never be shared; there
--                are no images, so no faces or people (Architecture §16).
--   permission   a child-session offer waits (`pending_permission`) until the
--                parent permits it; a parent's own offer IS the permission.
--   anonymised   the copy is scrubbed of the family's names, emails, links,
--                phone numbers and postcodes when it is made; WLA reviews and
--                may edit the anonymised copy before publishing.
--   moderated    nothing is visible until WLA publishes it.
--   curated      WLA may mark contrasting approaches and label them.
--   removed      withdrawal DELETES the row at once; deleting the child or the
--                Trail entry cascades. Longer retention is OPEN-14 — nothing
--                here keeps anything the family has withdrawn.
--
-- No client role can read or write the table. Families and children reach it
-- only through the functions below (child derived from the token, or the
-- parent's ownership checked inside the query); admins see no child identity
-- at all. Browsing shows only missions the viewing child has completed, so
-- the Board never gives a mission's reveals away (D-96).
--
-- No likes, counts, comments, rankings or profiles: there are no columns for
-- them and nothing returns an author.
-- ============================================================================

create table if not exists board_contributions (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references child_profiles (id) on delete cascade,
  mission_id    uuid not null references missions (id) on delete cascade,
  evidence_id   uuid not null unique references mission_evidence (id) on delete cascade,
  text          text not null check (char_length(text) between 1 and 2000),
  status        text not null default 'pending_permission'
                check (status in ('pending_permission', 'pending_moderation', 'published', 'rejected')),
  permitted_at  timestamptz,
  moderated_at  timestamptz,
  curated       boolean not null default false,
  approach      text check (approach is null or char_length(approach) <= 80),
  created_at    timestamptz not null default now()
);
create index if not exists board_published_idx on board_contributions (mission_id, status);
alter table board_contributions enable row level security;
revoke all on board_contributions from public, anon, authenticated;
grant select, insert, update, delete on board_contributions to service_role;

-- ---------------------------------------------------------- anonymisation --
-- Applied when the copy is made. Removes the names of everyone in the family
-- (every child profile and the parent's name, word by word), and anything that
-- looks like contact or location detail. WLA moderation is the second pass.
create or replace function private.board_scrub(p_text text, p_child uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := p_text;
  v_name text;
begin
  for v_name in
    select distinct w from (
      select regexp_split_to_table(c.display_name, '\s+') w
      from child_profiles c
      where c.parent_id = (select parent_id from child_profiles where id = p_child)
      union
      select regexp_split_to_table(coalesce(pr.name, ''), '\s+')
      from profiles pr
      where pr.id = (select parent_id from child_profiles where id = p_child)
    ) names
    where char_length(w) >= 2
  loop
    v := regexp_replace(v, '\m' || regexp_replace(v_name, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M', '[name]', 'gi');
  end loop;
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[removed]', 'g');
  v := regexp_replace(v, '(https?://|www\.)\S+', '[removed]', 'gi');
  v := regexp_replace(v, '@[A-Za-z0-9_]{2,}', '[removed]', 'g');
  v := regexp_replace(v, '\+?\d[\d\s-]{7,}\d', '[removed]', 'g');
  v := regexp_replace(v, '\m[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}\M', '[removed]', 'gi');
  return v;
end;
$$;
revoke all on function private.board_scrub(text, uuid) from public;

-- An eligible Trail entry of this child: digital, with text.
create or replace function private.board_eligible(p_child uuid, p_evidence uuid)
returns mission_evidence
language sql
stable
security definer
set search_path = public
as $$
  select * from mission_evidence
  where id = p_evidence and child_id = p_child
    and type = 'digital' and coalesce(trim(description), '') <> '';
$$;
revoke all on function private.board_eligible(uuid, uuid) from public;

-- ------------------------------------------------------------- offering --
create or replace function board_offer(p_child_id uuid, p_evidence_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_ev mission_evidence; v_id uuid;
begin
  if not exists (select 1 from child_profiles where id = p_child_id and parent_id = auth.uid()) then
    raise exception 'not_your_child' using errcode = '42501';
  end if;
  v_ev := private.board_eligible(p_child_id, p_evidence_id);
  if v_ev.id is null then raise exception 'not_eligible' using errcode = '22023'; end if;
  -- A parent offering is the permission (D-73).
  insert into board_contributions (child_id, mission_id, evidence_id, text, status, permitted_at)
  values (p_child_id, v_ev.mission_id, v_ev.id, left(private.board_scrub(v_ev.description, p_child_id), 2000), 'pending_moderation', now())
  on conflict (evidence_id) do update
    set status = case when board_contributions.status = 'pending_permission' then 'pending_moderation' else board_contributions.status end,
        permitted_at = coalesce(board_contributions.permitted_at, now())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function board_offer(uuid, uuid) from public, anon;
grant execute on function board_offer(uuid, uuid) to authenticated;

create or replace function child_session_board_offer(p_token text, p_evidence_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_child uuid; v_ev mission_evidence; v_id uuid;
begin
  v_child := assume_child_actor(p_token);
  v_ev := private.board_eligible(v_child, p_evidence_id);
  if v_ev.id is null then raise exception 'not_eligible' using errcode = '22023'; end if;
  insert into board_contributions (child_id, mission_id, evidence_id, text, status)
  values (v_child, v_ev.mission_id, v_ev.id, left(private.board_scrub(v_ev.description, v_child), 2000), 'pending_permission')
  on conflict (evidence_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function child_session_board_offer(text, uuid) from public;
grant execute on function child_session_board_offer(text, uuid) to anon, authenticated;

-- ------------------------------------------------- the family's own view --
create or replace function board_family_contributions()
returns table (id uuid, child_id uuid, child_name text, mission_title text, text text, status text, created_at timestamptz, evidence_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.child_id, c.display_name, m.title, b.text, b.status, b.created_at, b.evidence_id
  from board_contributions b
  join child_profiles c on c.id = b.child_id
  join missions m on m.id = b.mission_id
  where c.parent_id = auth.uid()
  order by b.created_at desc;
$$;
revoke all on function board_family_contributions() from public, anon;
grant execute on function board_family_contributions() to authenticated;

-- The child's own offers, so the Trail can say what is waiting.
create or replace function child_session_board_offers(p_token text)
returns table (evidence_id uuid, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);
  return query select b.evidence_id, b.status from board_contributions b where b.child_id = v_child;
end;
$$;
revoke all on function child_session_board_offers(text) from public;
grant execute on function child_session_board_offers(text) to anon, authenticated;

create or replace function board_permit(p_id uuid, p_allow boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from board_contributions b join child_profiles c on c.id = b.child_id
    where b.id = p_id and c.parent_id = auth.uid()
  ) then
    raise exception 'not_your_contribution' using errcode = '42501';
  end if;
  if p_allow then
    update board_contributions set status = 'pending_moderation', permitted_at = now()
    where id = p_id and status = 'pending_permission';
  else
    delete from board_contributions where id = p_id;
  end if;
end;
$$;
revoke all on function board_permit(uuid, boolean) from public, anon;
grant execute on function board_permit(uuid, boolean) to authenticated;

-- Withdrawal removes it at once, whatever its state (Architecture §16).
create or replace function board_withdraw(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from board_contributions b
  using child_profiles c
  where b.id = p_id and c.id = b.child_id and c.parent_id = auth.uid();
  if not found then raise exception 'not_your_contribution' using errcode = '42501'; end if;
end;
$$;
revoke all on function board_withdraw(uuid) from public, anon;
grant execute on function board_withdraw(uuid) to authenticated;

-- -------------------------------------------------------------- browsing --
-- Published, anonymised approaches to missions THIS child has completed.
-- Nothing identifies a contributor; curated approaches first, then newest.
create or replace function private.board_for_child(p_child uuid)
returns table (mission_slug text, mission_title text, lab wla_lab, text text, approach text, curated boolean, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.slug, m.title, m.lab, b.text, b.approach, b.curated, b.moderated_at
  from board_contributions b
  join missions m on m.id = b.mission_id
  where b.status = 'published'
    and exists (select 1 from mission_progress p
                where p.child_id = p_child and p.mission_id = b.mission_id and p.status = 'complete')
  order by b.curated desc, b.moderated_at desc;
$$;
revoke all on function private.board_for_child(uuid) from public;

create or replace function board_published(p_child_id uuid)
returns table (mission_slug text, mission_title text, lab wla_lab, text text, approach text, curated boolean, published_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from child_profiles where id = p_child_id and parent_id = auth.uid()) then
    raise exception 'not_your_child' using errcode = '42501';
  end if;
  return query select * from private.board_for_child(p_child_id);
end;
$$;
revoke all on function board_published(uuid) from public, anon;
grant execute on function board_published(uuid) to authenticated;

create or replace function child_session_board(p_token text)
returns table (mission_slug text, mission_title text, lab wla_lab, text text, approach text, curated boolean, published_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query select * from private.board_for_child(assume_child_actor(p_token));
end;
$$;
revoke all on function child_session_board(text) from public;
grant execute on function child_session_board(text) to anon, authenticated;

-- ------------------------------------------------------------ moderation --
-- Admins see the anonymised copy, the mission and the dates — never the child.
create or replace function admin_board_queue()
returns table (id uuid, mission_title text, lab wla_lab, text text, status text, curated boolean, approach text, created_at timestamptz, moderated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
  select b.id, m.title, m.lab, b.text, b.status, b.curated, b.approach, b.created_at, b.moderated_at
  from board_contributions b join missions m on m.id = b.mission_id
  where b.status in ('pending_moderation', 'published')
  order by (b.status = 'pending_moderation') desc, b.created_at;
end;
$$;
revoke all on function admin_board_queue() from public, anon;
grant execute on function admin_board_queue() to authenticated;

create or replace function admin_board_moderate(p_id uuid, p_action text, p_text text, p_curated boolean, p_approach text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_action not in ('publish', 'reject', 'unpublish', 'save') then raise exception 'bad_action' using errcode = '22023'; end if;
  -- Only what a parent has permitted can be moderated at all.
  if not exists (select 1 from board_contributions where id = p_id and status in ('pending_moderation', 'published')) then
    raise exception 'not_moderatable' using errcode = '22023';
  end if;
  update board_contributions set
    text = coalesce(nullif(trim(p_text), ''), text),
    curated = coalesce(p_curated, curated),
    approach = nullif(trim(coalesce(p_approach, approach, '')), ''),
    status = case p_action when 'publish' then 'published' when 'reject' then 'rejected'
                           when 'unpublish' then 'pending_moderation' else status end,
    moderated_at = case when p_action in ('publish', 'reject') then now() else moderated_at end
  where id = p_id;
end;
$$;
revoke all on function admin_board_moderate(uuid, text, text, boolean, text) from public, anon;
grant execute on function admin_board_moderate(uuid, text, text, boolean, text) to authenticated;
