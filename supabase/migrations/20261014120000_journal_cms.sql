-- ===========================================================================
-- JOURNAL CMS — editorial workflow, optional review (D-123 … D-133)
--
-- ADDITIVE. Extends the never-used journal tables from 0002
-- (20260925220100_editable_content.sql) instead of duplicating them:
--
--   journal_articles     identity + LIVE POINTER + schedule + archive state
--   journal_revisions    every version of an article's content and metadata
--   journal_categories   unchanged table; write policy moves admin → editor
--
-- THE RULES THIS FILE EXISTS TO ENFORCE (all inside the database, so a direct
-- PostgREST request from a writer's browser cannot get round them):
--
--   1. Nothing is public unless it is the article's live revision. Anon and
--      parents have NO select on articles or revisions; the public API reads
--      through journal_public_* functions that return only live fields.
--   2. Only people with the publish permission (editors; a writer on an
--      article they author) can publish, schedule or unpublish, and only the
--      working revision, identified by its content hash. Review is OPTIONAL
--      (D-130): it never gates publication.
--   3. In-review, approved and live revisions are immutable (trigger), and a
--      scheduled revision cannot be saved: what was scheduled is what goes live.
--   4. The live revision keeps serving while a newer one is drafted (D-126).
--      Only an explicit publish (or its schedule) moves the pointer.
--   5. Scheduled publication runs in the database every minute (pg_cron,
--      D-132) and re-validates everything at run time.
--   6. Comments, revisions, decisions and the audit trail are staff-only.
--
-- No client role may INSERT/UPDATE/DELETE any journal table; every write is a
-- security-definer function that re-derives the caller from auth.uid().
-- ===========================================================================

create schema if not exists private;

-- ------------------------------------------------------------------ types --
create type journal_role as enum ('writer', 'reviewer', 'editor');

create type journal_revision_state as enum (
  'draft',              -- editable
  'in_review',          -- submitted; locked; awaiting a decision
  'changes_requested',  -- a reviewer asked for changes; editable again
  'approved',           -- approved in an OPTIONAL review (D-130); locked; publishable
  'live',               -- the article's current public revision; locked
  'retired',            -- was live, replaced by a newer revision; locked
  'superseded'          -- abandoned for a newer revision before going live
);

create type journal_decision as enum ('approve', 'request_changes');

-- ------------------------------------------------------------------ staff --
create table journal_staff (
  profile_id uuid not null references profiles(id) on delete cascade,
  role       journal_role not null,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

-- ------------------------------------------------- articles (extended) --
-- 0002 columns title/standfirst/body/category_id/cover_image/published are
-- superseded by journal_revisions. They are relaxed (not dropped) so nothing
-- that exists breaks; `published` is kept in step with the live pointer.
alter table journal_articles alter column slug  drop not null;
alter table journal_articles alter column title drop not null;
alter table journal_articles alter column body  drop not null;

alter table journal_articles
  add column if not exists live_revision_id      uuid,
  add column if not exists working_revision_id   uuid,
  add column if not exists first_published_at    timestamptz,
  add column if not exists archived_at           timestamptz,
  add column if not exists scheduled_revision_id uuid,
  add column if not exists scheduled_for         timestamptz,
  add column if not exists scheduled_by          uuid references profiles(id) on delete set null,
  add column if not exists previous_slugs        text[] not null default '{}',
  -- The content hash a schedule was made for (D-132), and consecutive
  -- scheduler errors for it.
  add column if not exists scheduled_hash        text,
  add column if not exists schedule_attempts     int not null default 0,
  add column if not exists created_by            uuid references profiles(id) on delete set null;

-- ------------------------------------------------------------------ media --
create table journal_media (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references journal_articles(id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  bytes        int  not null check (bytes > 0 and bytes <= 10 * 1024 * 1024),
  alt_text     text check (alt_text is null or char_length(alt_text) <= 500),
  source_url   text,
  -- True only while the live revision references it. Never set by a client.
  is_public    boolean not null default false,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index journal_media_article_idx on journal_media (article_id);

-- -------------------------------------------------------------- revisions --
create table journal_revisions (
  id                    uuid primary key default gen_random_uuid(),
  article_id            uuid not null references journal_articles(id) on delete cascade,
  number                int  not null,
  state                 journal_revision_state not null default 'draft',
  based_on              uuid references journal_revisions(id) on delete set null,

  -- Material fields: every one of them feeds content_hash (D-125).
  title                 text not null default '' check (char_length(title) <= 200),
  slug                  text not null default '' check (char_length(slug) <= 120),
  excerpt               text check (excerpt is null or char_length(excerpt) <= 600),
  body_html             text not null default '' check (char_length(body_html) <= 400000),
  author_name           text check (author_name is null or char_length(author_name) <= 120),
  author_profile_id     uuid references profiles(id) on delete set null,
  category_id           uuid references journal_categories(id) on delete restrict,
  tags                  text[] not null default '{}',
  featured_media_id     uuid references journal_media(id) on delete set null,
  featured_alt          text check (featured_alt is null or char_length(featured_alt) <= 500),
  seo_title             text check (seo_title is null or char_length(seo_title) <= 200),
  seo_description       text check (seo_description is null or char_length(seo_description) <= 320),
  canonical_url         text check (canonical_url is null or canonical_url ~ '^https://'),
  original_published_at timestamptz,
  source_url            text,

  content_hash          text not null default '',
  lock_version          int  not null default 1,
  created_by            uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_by            uuid references profiles(id) on delete set null,
  updated_at            timestamptz not null default now(),
  submitted_by          uuid references profiles(id) on delete set null,
  submitted_at          timestamptz,
  decided_at            timestamptz,
  unique (article_id, number)
);
create index journal_revisions_article_idx on journal_revisions (article_id, number desc);

alter table journal_articles
  add constraint journal_articles_live_fk      foreign key (live_revision_id)      references journal_revisions(id) on delete set null,
  add constraint journal_articles_working_fk   foreign key (working_revision_id)   references journal_revisions(id) on delete set null,
  add constraint journal_articles_scheduled_fk foreign key (scheduled_revision_id) references journal_revisions(id) on delete set null;

-- ------------------------------------------------- people on an article --
create table journal_article_members (
  article_id uuid not null references journal_articles(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       text not null check (role in ('author', 'collaborator')),
  added_by   uuid references profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (article_id, profile_id)
);

create table journal_review_assignments (
  article_id  uuid not null references journal_articles(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (article_id, reviewer_id)
);

create table journal_review_decisions (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references journal_articles(id) on delete cascade,
  revision_id  uuid not null references journal_revisions(id) on delete cascade,
  reviewer_id  uuid references profiles(id) on delete set null,
  decision     journal_decision not null,
  content_hash text not null,
  note         text check (note is null or char_length(note) <= 5000),
  decided_at   timestamptz not null default now()
);
create index journal_decisions_revision_idx on journal_review_decisions (revision_id, decided_at desc);

-- Staff-only editorial notes (D-123). Never readable by anon or parents.
create table journal_comments (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references journal_articles(id) on delete cascade,
  revision_id uuid references journal_revisions(id) on delete set null,
  parent_id   uuid references journal_comments(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 5000),
  anchor      text check (anchor is null or char_length(anchor) <= 500),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index journal_comments_article_idx on journal_comments (article_id, created_at);

-- Change attribution (D-128): who saved which fields of which revision.
create table journal_revision_changes (
  id             bigint generated always as identity primary key,
  revision_id    uuid not null references journal_revisions(id) on delete cascade,
  actor_id       uuid references profiles(id) on delete set null,
  changed_fields text[] not null,
  lock_version   int not null,
  content_hash   text not null,
  at             timestamptz not null default now()
);
create index journal_changes_revision_idx on journal_revision_changes (revision_id, at);

-- Workflow audit. Deliberately NO foreign key to the article: the record of
-- what happened outlives a deleted draft.
create table journal_audit (
  id          bigint generated always as identity primary key,
  article_id  uuid,
  revision_id uuid,
  actor_id    uuid,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);
create index journal_audit_article_idx on journal_audit (article_id, at desc);

-- ---------------------------------------------------------------- import --
create table journal_import_sources (
  source_kind       text not null check (source_kind in ('medium')),
  source_id         text not null check (char_length(source_id) between 1 and 200),
  article_id        uuid references journal_articles(id) on delete set null,
  source_hash       text,           -- null while the first import is incomplete
  source_url        text,
  first_imported_at timestamptz not null default now(),
  last_imported_at  timestamptz,
  primary key (source_kind, source_id)
);

create table journal_import_runs (
  id          uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_name text,
  started_by  uuid references profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  totals      jsonb not null default '{}'::jsonb
);

create table journal_import_items (
  id         bigint generated always as identity primary key,
  run_id     uuid not null references journal_import_runs(id) on delete cascade,
  source_id  text,
  source_url text,
  title      text,
  outcome    text not null,
  article_id uuid references journal_articles(id) on delete set null,
  final_slug text,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index journal_import_items_run_idx on journal_import_items (run_id, id);

-- ========================================================== role helpers ==
create or replace function journal_has_role(p_role journal_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (
      select 1 from journal_staff s
      where s.profile_id = auth.uid()
        and (s.role = p_role or s.role = 'editor')
    )
  );
$$;

create or replace function journal_is_editor()
returns boolean
language sql stable security definer
set search_path = public
as $$ select journal_has_role('editor'); $$;

create or replace function journal_is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    is_admin() or exists (select 1 from journal_staff s where s.profile_id = auth.uid())
  );
$$;

create or replace function private.journal_profile_has_role(p_profile uuid, p_role journal_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = p_profile and p.is_admin)
      or exists (
        select 1 from journal_staff s
        where s.profile_id = p_profile and (s.role = p_role or s.role = 'editor')
      );
$$;

/* View: editors see everything; others only articles they belong to or review. */
create or replace function journal_can_view(p_article uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select journal_is_editor()
      or (journal_is_staff() and (
            exists (select 1 from journal_article_members m
                    where m.article_id = p_article and m.profile_id = auth.uid())
         or exists (select 1 from journal_review_assignments a
                    where a.article_id = p_article and a.reviewer_id = auth.uid())));
$$;

/* Edit: editors, or writers who are a member of the article. */
create or replace function journal_can_edit(p_article uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select journal_is_editor()
      or (journal_has_role('writer') and exists (
            select 1 from journal_article_members m
            where m.article_id = p_article and m.profile_id = auth.uid()));
$$;

-- ======================================================= content hashing ==
create or replace function private.journal_hash(r journal_revisions)
returns text
language sql immutable
set search_path = public
as $$
  select encode(extensions.digest(jsonb_build_array(
    r.title, r.slug, r.excerpt, r.body_html, r.author_name, r.author_profile_id,
    r.category_id, r.tags, r.featured_media_id, r.featured_alt, r.seo_title,
    r.seo_description, r.canonical_url,
    -- Epoch, not the timestamptz itself: its JSON text follows the session's
    -- TimeZone, which would give the same content two different hashes.
    extract(epoch from r.original_published_at), r.source_url
  )::text, 'sha256'), 'hex');
$$;

/*
 * The immutability rule (D-125), independent of every function below: a
 * revision's material fields can change only while it is draft or
 * changes_requested. The hash is always recomputed here — never trusted from
 * the caller.
 */
create or replace function private.journal_revision_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hash text := private.journal_hash(new);
begin
  if tg_op = 'UPDATE' then
    if new.article_id <> old.article_id or new.number <> old.number then
      raise exception 'revision_identity_immutable';
    end if;
    if v_hash is distinct from old.content_hash
       and old.state not in ('draft', 'changes_requested') then
      raise exception 'revision_locked';
    end if;
  end if;
  new.content_hash := v_hash;
  return new;
end;
$$;

create trigger journal_revision_guard
  before insert or update on journal_revisions
  for each row execute function private.journal_revision_guard();

-- ============================================================== helpers ==
create or replace function private.journal_audit(
  p_article uuid, p_revision uuid, p_action text, p_detail jsonb default '{}'::jsonb
) returns void
language sql security definer
set search_path = public
as $$
  insert into journal_audit (article_id, revision_id, actor_id, action, detail)
  values (p_article, p_revision, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function private.journal_slug_ok(p_slug text)
returns boolean
language sql immutable
as $$
  select p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     and char_length(p_slug) <= 120
     and p_slug not in ('category', 'tag', 'search', 'media', 'feed', 'sitemap', 'sitemap.xml');
$$;

create or replace function private.journal_body_unsafe(p_html text)
returns boolean
language sql immutable
as $$
  select coalesce(p_html, '') ~* '<\s*/?\s*(script|iframe|object|embed|style|form|input|button|textarea|svg|math|link|meta|base|frame|frameset)\M'
      or coalesce(p_html, '') ~* '<[^>]*\son[a-z]+\s*='
      or coalesce(p_html, '') ~* '<[^>]*(java|vb)script\s*:'
      or coalesce(p_html, '') ~* '<[^>]*data\s*:\s*text/html'
      or coalesce(p_html, '') ~* '<[^>]*\sstyle\s*=';
$$;

/* Free = no OTHER article uses it as its public slug, an old slug, or in any revision. */
create or replace function private.journal_slug_free(p_slug text, p_article uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select not exists (
      select 1 from journal_articles a
      where a.id <> p_article and (a.slug = p_slug or p_slug = any (a.previous_slugs)))
     and not exists (
      select 1 from journal_revisions r
      where r.article_id <> p_article and r.slug = p_slug
        and r.state not in ('superseded', 'retired'));
$$;

/* Recompute which media the public may read: only what the live revision uses. */
create or replace function private.journal_sync_media(p_article uuid)
returns void
language sql security definer
set search_path = public
as $$
  update journal_media m
  set is_public = coalesce((
      select a.archived_at is null
         and (r.featured_media_id = m.id or position(m.id::text in r.body_html) > 0)
      from journal_articles a
      join journal_revisions r on r.id = a.live_revision_id
      where a.id = m.article_id), false)
  where m.article_id = p_article;
$$;

/* Go live. Internal: every caller has already validated permission and the revision. */
create or replace function private.journal_go_live(p_article uuid, p_revision uuid, p_action text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a journal_articles;
  r journal_revisions;
begin
  select * into a from journal_articles where id = p_article for update;
  select * into r from journal_revisions where id = p_revision;

  if a.live_revision_id is not null and a.live_revision_id <> p_revision then
    update journal_revisions set state = 'retired' where id = a.live_revision_id;
  end if;
  update journal_revisions set state = 'live' where id = p_revision;

  update journal_articles set
    live_revision_id      = p_revision,
    previous_slugs        = case
                              when a.slug is not null and a.slug <> r.slug and a.first_published_at is not null
                                then array_append(array_remove(previous_slugs, r.slug), a.slug)
                              else array_remove(previous_slugs, r.slug)
                            end,
    slug                  = r.slug,
    published             = true,
    published_at          = now(),
    first_published_at    = coalesce(first_published_at, now()),
    scheduled_revision_id = null,
    scheduled_for         = null,
    scheduled_by          = null,
    scheduled_hash        = null,
    schedule_attempts     = 0,
    updated_at            = now()
  where id = p_article;

  perform private.journal_sync_media(p_article);
  perform private.journal_audit(p_article, p_revision, p_action,
    jsonb_build_object('content_hash', r.content_hash, 'slug', r.slug)
      || case when p_action = 'scheduled_published'
              then jsonb_build_object('scheduled_by', a.scheduled_by, 'scheduled_for', a.scheduled_for)
              else '{}'::jsonb end);
end;
$$;

create or replace function private.journal_try_uuid(p text)
returns uuid
language plpgsql immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

/* Untouched by people since import: only import saves, revision 1, still draft, never live. */
create or replace function private.journal_import_untouched(p_article uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
      select 1 from journal_articles a
      join journal_revisions r on r.id = a.working_revision_id
      where a.id = p_article and r.number = 1 and r.state = 'draft'
        and a.live_revision_id is null and a.first_published_at is null and a.archived_at is null)
     and not exists (
      select 1 from journal_revisions r
      join journal_revision_changes c on c.revision_id = r.id
      where r.article_id = p_article and c.changed_fields <> array['import']);
$$;

-- ======================================================== staff & people ==
/* Staff directory for choosing reviewers and collaborators. Staff only. */
create or replace function journal_staff_directory()
returns table (profile_id uuid, name text, email text, roles journal_role[], is_admin boolean)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not journal_is_staff() then
    raise exception 'not_allowed';
  end if;
  return query
    select p.id, p.name, p.email,
           coalesce(array_agg(s.role order by s.role) filter (where s.role is not null), '{}'),
           p.is_admin
    from profiles p
    left join journal_staff s on s.profile_id = p.id
    where p.is_admin or s.profile_id is not null
    group by p.id, p.name, p.email, p.is_admin
    order by coalesce(p.name, p.email);
end;
$$;

/* Grant or revoke a Journal role by email. Admin only. Returns an outcome, never raises on "not found". */
create or replace function journal_set_role(p_email text, p_role journal_role, p_grant boolean)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_count int;
begin
  if not is_admin() then
    raise exception 'not_allowed';
  end if;
  select id into v_profile from profiles where lower(email) = lower(btrim(p_email));
  if v_profile is null then
    return 'no_such_account';
  end if;
  if p_grant then
    insert into journal_staff (profile_id, role, granted_by)
    values (v_profile, p_role, auth.uid())
    on conflict do nothing;
  else
    delete from journal_staff where profile_id = v_profile and role = p_role;
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 'unchanged';
  end if;
  perform private.journal_audit(null, null, case when p_grant then 'role_granted' else 'role_revoked' end,
    jsonb_build_object('profile_id', v_profile, 'role', p_role));
  return case when p_grant then 'granted' else 'revoked' end;
end;
$$;

-- ============================================================= articles ==
create or replace function journal_create_article(p_title text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_article uuid;
  v_rev uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_slug text := coalesce(p_slug, '');
begin
  if not journal_has_role('writer') then
    raise exception 'not_allowed';
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;
  if v_slug <> '' and not private.journal_slug_ok(v_slug) then
    raise exception 'slug_invalid';
  end if;

  insert into journal_articles (created_by) values (auth.uid()) returning id into v_article;

  if v_slug <> '' and not private.journal_slug_free(v_slug, v_article) then
    raise exception 'slug_taken';
  end if;

  insert into journal_revisions (article_id, number, title, slug, created_by, updated_by)
  values (v_article, 1, v_title, v_slug, auth.uid(), auth.uid())
  returning id into v_rev;

  update journal_articles set working_revision_id = v_rev where id = v_article;

  insert into journal_article_members (article_id, profile_id, role, added_by)
  values (v_article, auth.uid(), 'author', auth.uid());

  insert into journal_revision_changes (revision_id, actor_id, changed_fields, lock_version, content_hash)
  select v_rev, auth.uid(), array['title', 'slug'], 1, content_hash from journal_revisions where id = v_rev;

  perform private.journal_audit(v_article, v_rev, 'created', jsonb_build_object('title', v_title));
  return v_article;
end;
$$;

/*
 * Save the working revision. Optimistic concurrency (D-128): a stale
 * p_expected_lock returns outcome 'conflict' with who saved last, and changes
 * nothing. Fields absent from p_fields are left as they are.
 */
create or replace function journal_save_revision(p_revision uuid, p_expected_lock int, p_fields jsonb)
returns table (outcome text, lock_version int, content_hash text, updated_by uuid, updated_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r journal_revisions;
  n journal_revisions;
  a journal_articles;
  v_changed text[] := '{}';
  v_slug text;
  v_body text;
begin
  select * into r from journal_revisions where id = p_revision for update;
  if not found then
    raise exception 'not_found';
  end if;
  if not journal_can_edit(r.article_id) then
    raise exception 'not_allowed';
  end if;
  select * into a from journal_articles where id = r.article_id;
  if a.archived_at is not null then
    raise exception 'archived';
  end if;
  if a.working_revision_id is distinct from r.id or r.state not in ('draft', 'changes_requested') then
    raise exception 'revision_locked';
  end if;
  -- A scheduled revision is frozen: what was scheduled is what goes live.
  if a.scheduled_revision_id = r.id then
    raise exception 'scheduled';
  end if;
  if r.lock_version <> p_expected_lock then
    return query select 'conflict'::text, r.lock_version, r.content_hash, r.updated_by, r.updated_at;
    return;
  end if;

  n := r;
  if p_fields ? 'title' then n.title := btrim(coalesce(p_fields->>'title', '')); end if;
  if p_fields ? 'slug' then
    v_slug := coalesce(p_fields->>'slug', '');
    if v_slug <> '' and not private.journal_slug_ok(v_slug) then raise exception 'slug_invalid'; end if;
    if v_slug <> '' and not private.journal_slug_free(v_slug, r.article_id) then raise exception 'slug_taken'; end if;
    n.slug := v_slug;
  end if;
  if p_fields ? 'excerpt' then n.excerpt := nullif(btrim(coalesce(p_fields->>'excerpt', '')), ''); end if;
  if p_fields ? 'body_html' then
    v_body := coalesce(p_fields->>'body_html', '');
    -- Belt and braces. The server action sanitises to an allowlist and the
    -- public renderer sanitises again; this refuses the obvious payloads from
    -- a direct request that skipped both.
    -- Attribute patterns are matched INSIDE a tag only, so prose about code
    -- ("the javascript: scheme", "if one = two") is not refused.
    if private.journal_body_unsafe(v_body) then
      raise exception 'body_unsafe';
    end if;
    n.body_html := v_body;
  end if;
  if p_fields ? 'author_name' then n.author_name := nullif(btrim(coalesce(p_fields->>'author_name', '')), ''); end if;
  if p_fields ? 'author_profile_id' then n.author_profile_id := nullif(p_fields->>'author_profile_id', '')::uuid; end if;
  if p_fields ? 'category_id' then n.category_id := nullif(p_fields->>'category_id', '')::uuid; end if;
  if p_fields ? 'tags' then
    n.tags := coalesce((
      select array_agg(distinct t order by t)
      from jsonb_array_elements_text(coalesce(p_fields->'tags', '[]'::jsonb)) as x(t)
      where t ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(t) <= 40), '{}');
  end if;
  if p_fields ? 'featured_media_id' then
    n.featured_media_id := nullif(p_fields->>'featured_media_id', '')::uuid;
    if n.featured_media_id is not null and not exists (
        select 1 from journal_media m where m.id = n.featured_media_id and m.article_id = r.article_id) then
      raise exception 'media_not_in_article';
    end if;
  end if;
  if p_fields ? 'featured_alt' then n.featured_alt := nullif(btrim(coalesce(p_fields->>'featured_alt', '')), ''); end if;
  if p_fields ? 'seo_title' then n.seo_title := nullif(btrim(coalesce(p_fields->>'seo_title', '')), ''); end if;
  if p_fields ? 'seo_description' then n.seo_description := nullif(btrim(coalesce(p_fields->>'seo_description', '')), ''); end if;
  if p_fields ? 'canonical_url' then n.canonical_url := nullif(btrim(coalesce(p_fields->>'canonical_url', '')), ''); end if;
  if p_fields ? 'original_published_at' then
    n.original_published_at := nullif(p_fields->>'original_published_at', '')::timestamptz;
  end if;

  select coalesce(array_agg(f), '{}') into v_changed
  from unnest(array[
    case when n.title is distinct from r.title then 'title' end,
    case when n.slug is distinct from r.slug then 'slug' end,
    case when n.excerpt is distinct from r.excerpt then 'excerpt' end,
    case when n.body_html is distinct from r.body_html then 'body' end,
    case when n.author_name is distinct from r.author_name
           or n.author_profile_id is distinct from r.author_profile_id then 'author' end,
    case when n.category_id is distinct from r.category_id then 'category' end,
    case when n.tags is distinct from r.tags then 'tags' end,
    case when n.featured_media_id is distinct from r.featured_media_id
           or n.featured_alt is distinct from r.featured_alt then 'featured_image' end,
    case when n.seo_title is distinct from r.seo_title
           or n.seo_description is distinct from r.seo_description
           or n.canonical_url is distinct from r.canonical_url then 'seo' end,
    case when n.original_published_at is distinct from r.original_published_at then 'dates' end
  ]) as f where f is not null;

  if cardinality(v_changed) = 0 then
    return query select 'unchanged'::text, r.lock_version, r.content_hash, r.updated_by, r.updated_at;
    return;
  end if;

  update journal_revisions set
    title = n.title, slug = n.slug, excerpt = n.excerpt, body_html = n.body_html,
    author_name = n.author_name, author_profile_id = n.author_profile_id,
    category_id = n.category_id, tags = n.tags,
    featured_media_id = n.featured_media_id, featured_alt = n.featured_alt,
    seo_title = n.seo_title, seo_description = n.seo_description,
    canonical_url = n.canonical_url, original_published_at = n.original_published_at,
    lock_version = r.lock_version + 1,
    updated_by = auth.uid(), updated_at = now()
  where id = r.id
  returning * into n;

  insert into journal_revision_changes (revision_id, actor_id, changed_fields, lock_version, content_hash)
  values (r.id, auth.uid(), v_changed, n.lock_version, n.content_hash);
  update journal_articles set updated_at = now() where id = r.article_id;

  return query select 'saved'::text, n.lock_version, n.content_hash, n.updated_by, n.updated_at;
end;
$$;

/*
 * Make the article editable again. Live → a new draft copied from it (the live
 * revision keeps serving, D-126). Approved → superseded by a new draft.
 * Already editable → returns that revision. In review → withdraw first.
 */
create or replace function journal_start_revision(p_article uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  a journal_articles;
  w journal_revisions;
  v_new uuid;
begin
  if not journal_can_edit(p_article) then
    raise exception 'not_allowed';
  end if;
  select * into a from journal_articles where id = p_article for update;
  if a.archived_at is not null then
    raise exception 'archived';
  end if;
  select * into w from journal_revisions where id = a.working_revision_id;

  if w.state in ('draft', 'changes_requested') then
    return w.id;
  end if;
  if w.state = 'in_review' then
    raise exception 'withdraw_first';
  end if;
  if a.scheduled_revision_id = w.id then
    raise exception 'scheduled';
  end if;
  if w.state = 'approved' then
    update journal_revisions set state = 'superseded' where id = w.id;
  end if;

  insert into journal_revisions (
    article_id, number, based_on, title, slug, excerpt, body_html, author_name,
    author_profile_id, category_id, tags, featured_media_id, featured_alt,
    seo_title, seo_description, canonical_url, original_published_at, source_url,
    created_by, updated_by)
  select w.article_id, (select max(number) + 1 from journal_revisions where article_id = p_article),
         w.id, w.title, w.slug, w.excerpt, w.body_html, w.author_name,
         w.author_profile_id, w.category_id, w.tags, w.featured_media_id, w.featured_alt,
         w.seo_title, w.seo_description, w.canonical_url, w.original_published_at, w.source_url,
         auth.uid(), auth.uid()
  returning id into v_new;

  update journal_articles set working_revision_id = v_new, updated_at = now() where id = p_article;
  perform private.journal_audit(p_article, v_new, 'revision_started', jsonb_build_object('based_on', w.id));
  return v_new;
end;
$$;

create or replace function journal_submit_for_review(p_revision uuid, p_expected_lock int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r journal_revisions;
  a journal_articles;
begin
  select * into r from journal_revisions where id = p_revision for update;
  if not found then raise exception 'not_found'; end if;
  if not journal_can_edit(r.article_id) then raise exception 'not_allowed'; end if;
  select * into a from journal_articles where id = r.article_id;
  if a.archived_at is not null then raise exception 'archived'; end if;
  if a.working_revision_id is distinct from r.id or r.state not in ('draft', 'changes_requested') then
    raise exception 'revision_locked';
  end if;
  if r.lock_version <> p_expected_lock then raise exception 'conflict'; end if;
  if btrim(r.title) = '' then raise exception 'title_required'; end if;
  if r.slug = '' then raise exception 'slug_required'; end if;
  if btrim(regexp_replace(r.body_html, '<[^>]*>', '', 'g')) = '' then raise exception 'body_required'; end if;
  if not private.journal_slug_free(r.slug, r.article_id) then raise exception 'slug_taken'; end if;

  update journal_revisions
  set state = 'in_review', submitted_by = auth.uid(), submitted_at = clock_timestamp()
  where id = r.id;
  perform private.journal_audit(r.article_id, r.id, 'submitted', jsonb_build_object('content_hash', r.content_hash));
end;
$$;

create or replace function journal_withdraw_submission(p_revision uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r journal_revisions;
begin
  select * into r from journal_revisions where id = p_revision for update;
  if not found then raise exception 'not_found'; end if;
  if not journal_can_edit(r.article_id) then raise exception 'not_allowed'; end if;
  if r.state <> 'in_review' then raise exception 'not_in_review'; end if;
  update journal_revisions set state = 'draft' where id = r.id;
  perform private.journal_audit(r.article_id, r.id, 'withdrawn');
end;
$$;

-- =============================================================== review ==
create or replace function journal_assign_reviewer(p_article uuid, p_reviewer uuid, p_assign boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from journal_articles where id = p_article) then raise exception 'not_found'; end if;
  if p_assign then
    if not private.journal_profile_has_role(p_reviewer, 'reviewer') then
      raise exception 'not_a_reviewer';
    end if;
    insert into journal_review_assignments (article_id, reviewer_id, assigned_by)
    values (p_article, p_reviewer, auth.uid())
    on conflict do nothing;
  else
    delete from journal_review_assignments where article_id = p_article and reviewer_id = p_reviewer;
  end if;
  perform private.journal_audit(p_article, null,
    case when p_assign then 'reviewer_assigned' else 'reviewer_unassigned' end,
    jsonb_build_object('reviewer_id', p_reviewer));
end;
$$;

/*
 * A formal decision on ONE revision, bound to the hash the reviewer saw
 * (D-125). Review is OPTIONAL (D-130): a decision never gates publication.
 * Refused for anyone not assigned, anyone without the reviewer role, and
 * anyone who saved changes to this revision — a self-review would mean nothing.
 */
create or replace function journal_decide(p_revision uuid, p_decision journal_decision, p_expected_hash text, p_note text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r journal_revisions;
begin
  select * into r from journal_revisions where id = p_revision for update;
  if not found then raise exception 'not_found'; end if;
  if not journal_has_role('reviewer')
     or not exists (select 1 from journal_review_assignments
                    where article_id = r.article_id and reviewer_id = auth.uid()) then
    raise exception 'not_assigned';
  end if;
  if r.state <> 'in_review' then raise exception 'not_in_review'; end if;
  if r.content_hash <> coalesce(p_expected_hash, '') then raise exception 'stale_revision'; end if;
  if exists (select 1 from journal_revision_changes
             where revision_id = r.id and actor_id = auth.uid()) then
    raise exception 'own_changes';
  end if;
  if p_decision = 'request_changes' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'note_required';
  end if;

  insert into journal_review_decisions (article_id, revision_id, reviewer_id, decision, content_hash, note, decided_at)
  values (r.article_id, r.id, auth.uid(), p_decision, r.content_hash, nullif(btrim(coalesce(p_note, '')), ''), clock_timestamp());

  update journal_revisions
  set state = case when p_decision = 'approve' then 'approved'::journal_revision_state
                   else 'changes_requested'::journal_revision_state end,
      decided_at = clock_timestamp()
  where id = r.id;

  perform private.journal_audit(r.article_id, r.id,
    case when p_decision = 'approve' then 'approved' else 'changes_requested' end,
    jsonb_build_object('content_hash', r.content_hash));
end;
$$;

-- ============================================================= comments ==
create or replace function journal_add_comment(p_article uuid, p_revision uuid, p_body text, p_parent uuid, p_anchor text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not journal_can_view(p_article) then raise exception 'not_allowed'; end if;
  if p_revision is not null and not exists (
      select 1 from journal_revisions where id = p_revision and article_id = p_article) then
    raise exception 'not_found';
  end if;
  if p_parent is not null and not exists (
      select 1 from journal_comments where id = p_parent and article_id = p_article) then
    raise exception 'not_found';
  end if;
  insert into journal_comments (article_id, revision_id, parent_id, author_id, body, anchor)
  values (p_article, p_revision, p_parent, auth.uid(), btrim(p_body), nullif(btrim(coalesce(p_anchor, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function journal_resolve_comment(p_comment uuid, p_resolved boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c journal_comments;
begin
  select * into c from journal_comments where id = p_comment;
  if not found then raise exception 'not_found'; end if;
  if not (journal_can_edit(c.article_id) or (c.author_id = auth.uid() and journal_can_view(c.article_id))) then
    raise exception 'not_allowed';
  end if;
  update journal_comments
  set resolved_at = case when p_resolved then now() end,
      resolved_by = case when p_resolved then auth.uid() end
  where id = p_comment;
end;
$$;

create or replace function journal_set_member(p_article uuid, p_profile uuid, p_role text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (journal_is_editor() or exists (
      select 1 from journal_article_members
      where article_id = p_article and profile_id = auth.uid() and role = 'author')) then
    raise exception 'not_allowed';
  end if;
  if p_role is null then
    delete from journal_article_members where article_id = p_article and profile_id = p_profile;
  else
    if p_role not in ('author', 'collaborator') then raise exception 'invalid_role'; end if;
    if not private.journal_profile_has_role(p_profile, 'writer') then raise exception 'not_a_writer'; end if;
    insert into journal_article_members (article_id, profile_id, role, added_by)
    values (p_article, p_profile, p_role, auth.uid())
    on conflict (article_id, profile_id) do update set role = excluded.role;
  end if;
  perform private.journal_audit(p_article, null, 'member_changed',
    jsonb_build_object('profile_id', p_profile, 'role', p_role));
end;
$$;

-- ============================================================ publishing ==
/*
 * D-130: approval is OPTIONAL. Publishing needs the publish permission and a
 * valid revision — not a review. What is protected instead:
 *   * only the article's working revision can be published, by its content
 *     hash (the publisher publishes exactly what they last saw saved);
 *   * the live revision keeps serving until that explicit publish (D-126);
 *   * every publish, schedule, failure and retry is audited.
 *
 * Who may publish, schedule, unpublish or cancel a schedule: editors (and
 * admins) for any article; a writer for an article on which they are the
 * AUTHOR. Collaborators edit but do not publish. Archive/delete stay with
 * editors.
 */
create or replace function journal_can_publish(p_article uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select journal_is_editor()
      or (journal_has_role('writer') and exists (
            select 1 from journal_article_members m
            where m.article_id = p_article and m.profile_id = auth.uid() and m.role = 'author'));
$$;

/* The same rule for a stored person (the scheduler, re-checked at run time). */
create or replace function private.journal_profile_can_publish(p_profile uuid, p_article uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select private.journal_profile_has_role(p_profile, 'editor')
      or (exists (select 1 from journal_staff s where s.profile_id = p_profile and s.role = 'writer')
          and exists (select 1 from journal_article_members m
                      where m.article_id = p_article and m.profile_id = p_profile and m.role = 'author'));
$$;

/* Why a revision cannot go live now, or null. Shared by publish, schedule and the runner. */
create or replace function private.journal_publish_problem(r journal_revisions, a journal_articles)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when r.id is null or a.id is null or r.article_id <> a.id then 'not_found'
    when a.archived_at is not null then 'archived'
    when a.working_revision_id is distinct from r.id then 'not_working_revision'
    when r.state not in ('draft', 'changes_requested', 'in_review', 'approved') then 'not_publishable'
    when btrim(r.title) = '' then 'title_required'
    when r.slug = '' then 'slug_required'
    when btrim(regexp_replace(r.body_html, '<[^>]*>', '', 'g')) = '' then 'body_required'
    when not private.journal_slug_ok(r.slug) or not private.journal_slug_free(r.slug, a.id) then 'slug_taken'
    else null
  end;
$$;

create or replace function journal_publish(p_revision uuid, p_expected_hash text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r journal_revisions;
  a journal_articles;
  v_problem text;
begin
  select * into r from journal_revisions where id = p_revision for update;
  if not found then raise exception 'not_found'; end if;
  if not journal_can_publish(r.article_id) then raise exception 'not_allowed'; end if;
  select * into a from journal_articles where id = r.article_id for update;
  if r.content_hash <> coalesce(p_expected_hash, '') then raise exception 'stale_revision'; end if;
  v_problem := private.journal_publish_problem(r, a);
  if v_problem is not null then raise exception '%', v_problem; end if;
  perform private.journal_go_live(r.article_id, r.id, 'published');
end;
$$;

/*
 * Schedule the working revision. Its content hash is recorded and the
 * revision is locked against saves until the schedule runs or is cancelled,
 * so what goes live is exactly what was scheduled.
 */
create or replace function journal_schedule(p_revision uuid, p_expected_hash text, p_at timestamptz)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r journal_revisions;
  a journal_articles;
  v_problem text;
begin
  select * into r from journal_revisions where id = p_revision for update;
  if not found then raise exception 'not_found'; end if;
  if not journal_can_publish(r.article_id) then raise exception 'not_allowed'; end if;
  select * into a from journal_articles where id = r.article_id for update;
  if r.content_hash <> coalesce(p_expected_hash, '') then raise exception 'stale_revision'; end if;
  v_problem := private.journal_publish_problem(r, a);
  if v_problem is not null then raise exception '%', v_problem; end if;
  if p_at is null or p_at <= now() + interval '1 minute' then raise exception 'schedule_in_past'; end if;
  update journal_articles
  set scheduled_revision_id = r.id, scheduled_for = p_at, scheduled_by = auth.uid(),
      scheduled_hash = r.content_hash, schedule_attempts = 0, updated_at = now()
  where id = a.id;
  perform private.journal_audit(a.id, r.id, 'scheduled', jsonb_build_object('for', p_at, 'content_hash', r.content_hash));
end;
$$;

create or replace function journal_cancel_schedule(p_article uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not journal_can_publish(p_article) then raise exception 'not_allowed'; end if;
  update journal_articles
  set scheduled_revision_id = null, scheduled_for = null, scheduled_by = null,
      scheduled_hash = null, schedule_attempts = 0, updated_at = now()
  where id = p_article and scheduled_revision_id is not null;
  if found then
    perform private.journal_audit(p_article, null, 'schedule_cancelled');
  end if;
end;
$$;

/*
 * THE SCHEDULER (D-132). Run every minute by pg_cron (below), as the database
 * owner — no client role can execute it. Processes EVERY due article, so a
 * missed or failed run is caught up by the next one; `skip locked` makes
 * overlapping runs safe, and go-live clears the schedule, so a retry or a
 * duplicate run never publishes twice.
 *
 * Each article runs in its own sub-transaction. A rule that no longer holds
 * (archived, content changed, publisher lost permission, slug taken…)
 * cancels that schedule and is audited. An unexpected error keeps the
 * schedule for the next run and is audited as a retry; after 5 consecutive
 * errors it is cancelled and audited as failed, so nothing retries forever
 * silently.
 */
create or replace function journal_publish_due()
returns table (article_id uuid, outcome text)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  a journal_articles;
  r journal_revisions;
  v_reason text;
  v_err text;
begin
  for a in
    select * from journal_articles
    where scheduled_for is not null and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
  loop
    begin
      select * into r from journal_revisions where id = a.scheduled_revision_id;
      v_reason := private.journal_publish_problem(r, a);
      if v_reason is null and r.content_hash is distinct from a.scheduled_hash then
        v_reason := 'changed_since_scheduled';
      end if;
      if v_reason is null and (a.scheduled_by is null or not private.journal_profile_can_publish(a.scheduled_by, a.id)) then
        v_reason := 'scheduler_not_permitted';
      end if;

      if v_reason is null then
        perform private.journal_go_live(a.id, r.id, 'scheduled_published');
        return query select a.id, 'published'::text;
      else
        update journal_articles
        set scheduled_revision_id = null, scheduled_for = null, scheduled_by = null,
            scheduled_hash = null, schedule_attempts = 0
        where id = a.id;
        insert into journal_audit (article_id, revision_id, actor_id, action, detail)
        values (a.id, a.scheduled_revision_id, null, 'schedule_failed',
                jsonb_build_object('reason', v_reason, 'scheduled_for', a.scheduled_for));
        return query select a.id, v_reason;
      end if;
    exception when others then
      -- This article's sub-transaction is rolled back; the others are unaffected.
      v_err := left(sqlerrm, 200);
      if a.schedule_attempts + 1 >= 5 then
        update journal_articles
        set scheduled_revision_id = null, scheduled_for = null, scheduled_by = null,
            scheduled_hash = null, schedule_attempts = 0
        where id = a.id;
        insert into journal_audit (article_id, revision_id, actor_id, action, detail)
        values (a.id, a.scheduled_revision_id, null, 'schedule_failed', jsonb_build_object('reason', 'error', 'error', v_err));
        return query select a.id, 'failed_after_retries'::text;
      else
        update journal_articles set schedule_attempts = schedule_attempts + 1 where id = a.id;
        insert into journal_audit (article_id, revision_id, actor_id, action, detail)
        values (a.id, a.scheduled_revision_id, null, 'schedule_retry',
                jsonb_build_object('attempt', a.schedule_attempts + 1, 'error', v_err));
        return query select a.id, 'retry'::text;
      end if;
    end;
  end loop;
end;
$$;

/*
 * Take the live revision down. If it is also the working revision it returns
 * to draft (editable, publishable again); if a newer working revision exists
 * it is retired — the newer one is what gets published next.
 */
create or replace function private.journal_take_down(a journal_articles)
returns void
language sql security definer
set search_path = public
as $$
  update journal_revisions
  set state = case when id = a.working_revision_id then 'draft'::journal_revision_state
                   else 'retired'::journal_revision_state end
  where id = a.live_revision_id;
$$;

create or replace function journal_unpublish(p_article uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a journal_articles;
begin
  if not journal_can_publish(p_article) then raise exception 'not_allowed'; end if;
  select * into a from journal_articles where id = p_article for update;
  if not found then raise exception 'not_found'; end if;
  if a.live_revision_id is null then raise exception 'not_live'; end if;
  perform private.journal_take_down(a);
  update journal_articles
  set live_revision_id = null, published = false, updated_at = now()
  where id = p_article;
  perform private.journal_sync_media(p_article);
  perform private.journal_audit(p_article, a.live_revision_id, 'unpublished');
end;
$$;

create or replace function journal_archive(p_article uuid, p_archive boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a journal_articles;
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  select * into a from journal_articles where id = p_article for update;
  if not found then raise exception 'not_found'; end if;
  if p_archive then
    if a.live_revision_id is not null then
      perform private.journal_take_down(a);
    end if;
    update journal_articles
    set archived_at = now(), live_revision_id = null, published = false,
        scheduled_revision_id = null, scheduled_for = null, scheduled_by = null,
        scheduled_hash = null, schedule_attempts = 0, updated_at = now()
    where id = p_article;
    perform private.journal_sync_media(p_article);
    perform private.journal_audit(p_article, a.live_revision_id, 'archived');
  else
    update journal_articles set archived_at = null, updated_at = now() where id = p_article;
    perform private.journal_audit(p_article, null, 'unarchived');
  end if;
end;
$$;

/* Delete an article that has never been public. Editors only. */
create or replace function journal_delete_article(p_article uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a journal_articles;
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  select * into a from journal_articles where id = p_article for update;
  if not found then raise exception 'not_found'; end if;
  if a.first_published_at is not null or a.live_revision_id is not null then
    raise exception 'was_published';
  end if;
  perform private.journal_audit(p_article, null, 'deleted',
    jsonb_build_object('title', (select title from journal_revisions where id = a.working_revision_id)));
  delete from journal_articles where id = p_article;
end;
$$;

-- ================================================================= media ==
create or replace function journal_register_media(
  p_article uuid, p_path text, p_mime text, p_bytes int, p_alt text, p_source_url text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not journal_can_edit(p_article) then raise exception 'not_allowed'; end if;
  if exists (select 1 from journal_articles where id = p_article and archived_at is not null) then
    raise exception 'archived';
  end if;
  if p_path is null or p_path not like p_article::text || '/%' or p_path like '%..%' then
    raise exception 'path_outside_article';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'journal-media' and name = p_path) then
    raise exception 'object_missing';
  end if;
  insert into journal_media (article_id, storage_path, mime_type, bytes, alt_text, source_url, uploaded_by)
  values (p_article, p_path, p_mime, p_bytes, nullif(btrim(coalesce(p_alt, '')), ''), p_source_url, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function journal_media_readable(p_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from journal_media m where m.storage_path = p_name and m.is_public)
      or journal_can_view(private.journal_try_uuid(split_part(p_name, '/', 1)));
$$;

/*
 * The storage path behind /journal/media/<id>: only for an image the live
 * revision uses, or for staff who can see the article (previews). Anything
 * else is indistinguishable from "no such image".
 */
create or replace function journal_media_path(p_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select m.storage_path from journal_media m
  where m.id = p_id and (m.is_public or journal_can_view(m.article_id));
$$;

insert into storage.buckets (id, name, public)
values ('journal-media', 'journal-media', false)
on conflict (id) do nothing;

drop policy if exists "journal staff upload media" on storage.objects;
create policy "journal staff upload media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'journal-media'
    and journal_can_edit(private.journal_try_uuid(split_part(name, '/', 1)))
  );

-- Staff read what they can see; everyone else only what is live (D-127).
drop policy if exists "journal media readable" on storage.objects;
create policy "journal media readable" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'journal-media' and journal_media_readable(name)
  );
-- Never an UPDATE or DELETE policy: revisions keep referring to their media.

-- ======================================================== public reads ==
create or replace function private.journal_text(p_html text)
returns text
language sql immutable
as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p_html, ''), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'));
$$;

/* The public listing. Live revisions of unarchived articles, nothing else. */
create or replace function journal_public_list(
  p_category text default null, p_tag text default null, p_query text default null,
  p_limit int default 24, p_offset int default 0
) returns table (
  slug text, title text, excerpt text, author_name text,
  category_slug text, category_name text, tags text[],
  featured_media_id uuid, featured_alt text,
  display_date timestamptz, updated_at timestamptz, word_count int
)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_q text := nullif(left(btrim(coalesce(p_query, '')), 200), '');
begin
  return query
    select r.slug, r.title, r.excerpt, r.author_name,
           c.slug, c.name, r.tags,
           r.featured_media_id, r.featured_alt,
           coalesce(r.original_published_at, a.first_published_at),
           a.published_at,
           coalesce(array_length(regexp_split_to_array(nullif(private.journal_text(r.body_html), ''), '\s+'), 1), 0)
    from journal_articles a
    join journal_revisions r on r.id = a.live_revision_id and r.state = 'live'
    left join journal_categories c on c.id = r.category_id
    where a.archived_at is null
      and (p_category is null or c.slug = p_category)
      and (p_tag is null or p_tag = any (r.tags))
      and (v_q is null or to_tsvector('english',
             r.title || ' ' || coalesce(r.excerpt, '') || ' ' || array_to_string(r.tags, ' ') || ' ' || private.journal_text(r.body_html))
           @@ websearch_to_tsquery('english', v_q))
    order by
      case when v_q is null then 0 else ts_rank(to_tsvector('english',
        r.title || ' ' || coalesce(r.excerpt, '') || ' ' || private.journal_text(r.body_html)),
        websearch_to_tsquery('english', v_q)) end desc,
      coalesce(r.original_published_at, a.first_published_at) desc
    limit least(greatest(coalesce(p_limit, 24), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

/*
 * One public article by slug. An old slug returns only `redirect_to`, so a
 * renamed article keeps its links (SEO) without exposing anything else.
 */
create or replace function journal_public_article(p_slug text)
returns table (
  slug text, title text, excerpt text, body_html text, author_name text,
  category_slug text, category_name text, tags text[],
  featured_media_id uuid, featured_alt text,
  seo_title text, seo_description text, canonical_url text, source_url text,
  display_date timestamptz, first_published_at timestamptz, updated_at timestamptz,
  redirect_to text
)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
    select r.slug, r.title, r.excerpt, r.body_html, r.author_name,
           c.slug, c.name, r.tags, r.featured_media_id, r.featured_alt,
           r.seo_title, r.seo_description, r.canonical_url, r.source_url,
           coalesce(r.original_published_at, a.first_published_at), a.first_published_at, a.published_at,
           null::text
    from journal_articles a
    join journal_revisions r on r.id = a.live_revision_id and r.state = 'live'
    left join journal_categories c on c.id = r.category_id
    where a.archived_at is null and a.slug = p_slug;
  if found then return; end if;

  return query
    select null::text, null::text, null::text, null::text, null::text, null::text, null::text,
           null::text[], null::uuid, null::text, null::text, null::text, null::text, null::text,
           null::timestamptz, null::timestamptz, null::timestamptz, a.slug
    from journal_articles a
    where a.archived_at is null and a.live_revision_id is not null
      and p_slug = any (a.previous_slugs)
    limit 1;
end;
$$;

create or replace function journal_public_tags()
returns table (tag text)
language sql stable security definer
set search_path = public
as $$
  select distinct t
  from journal_articles a
  join journal_revisions r on r.id = a.live_revision_id and r.state = 'live'
  cross join unnest(r.tags) as t
  where a.archived_at is null
  order by t;
$$;

-- ================================================================ import ==
create or replace function journal_import_start(p_kind text, p_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  insert into journal_import_runs (source_kind, source_name, started_by)
  values (p_kind, left(p_name, 200), auth.uid()) returning id into v;
  return v;
end;
$$;

create or replace function journal_import_log(
  p_run uuid, p_source_id text, p_source_url text, p_title text, p_outcome text,
  p_article uuid, p_slug text, p_messages jsonb
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  insert into journal_import_items (run_id, source_id, source_url, title, outcome, article_id, final_slug, messages)
  values (p_run, p_source_id, p_source_url, left(p_title, 300), p_outcome, p_article, p_slug, coalesce(p_messages, '[]'::jsonb));
end;
$$;

create or replace function journal_import_finish(p_run uuid, p_totals jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  update journal_import_runs set finished_at = now(), totals = coalesce(p_totals, '{}'::jsonb) where id = p_run;
end;
$$;

/*
 * Step 1 of importing one post. Idempotent per (kind, source id):
 *   new        — article + draft revision 1 created (or an earlier attempt's
 *                shell reused, so a retry never duplicates)
 *   unchanged  — same source hash as last time; nothing to do
 *   update     — source changed and nobody in WLA has touched the article
 *   edited     — source changed but WLA staff edited it; left alone
 */
create or replace function journal_import_prepare(p_kind text, p_source_id text, p_source_hash text, p_title text)
returns table (outcome text, article_id uuid, revision_id uuid)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s journal_import_sources;
  v_article uuid;
  v_rev uuid;
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtext('journal_import:' || p_kind || ':' || p_source_id));

  select * into s from journal_import_sources where source_kind = p_kind and source_id = p_source_id;

  if found and s.article_id is not null then
    select working_revision_id into v_rev from journal_articles where id = s.article_id;
    if s.source_hash is not null and s.source_hash = p_source_hash then
      return query select 'unchanged'::text, s.article_id, v_rev; return;
    end if;
    if private.journal_import_untouched(s.article_id) then
      return query select case when s.source_hash is null then 'new' else 'update' end, s.article_id, v_rev; return;
    end if;
    return query select 'edited'::text, s.article_id, v_rev; return;
  end if;

  insert into journal_articles (created_by) values (auth.uid()) returning id into v_article;
  insert into journal_revisions (article_id, number, title, created_by, updated_by)
  values (v_article, 1, left(coalesce(nullif(btrim(p_title), ''), 'Imported article'), 200), auth.uid(), auth.uid())
  returning id into v_rev;
  update journal_articles set working_revision_id = v_rev where id = v_article;

  insert into journal_import_sources (source_kind, source_id, article_id, source_hash)
  values (p_kind, p_source_id, v_article, null)
  on conflict (source_kind, source_id) do update set article_id = excluded.article_id, source_hash = null;

  return query select 'new'::text, v_article, v_rev;
end;
$$;

/*
 * Step 2: write the imported content into the untouched draft, resolving slug
 * conflicts in the database (race-safe) and reporting them.
 */
create or replace function journal_import_apply(
  p_article uuid, p_kind text, p_source_id text, p_source_hash text, p_source_url text, p_fields jsonb
) returns table (final_slug text, slug_changed boolean)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_rev uuid;
  v_base text := coalesce(nullif(p_fields->>'slug', ''), 'imported-article');
  v_slug text;
  v_n int := 1;
  v_body text := coalesce(p_fields->>'body_html', '');
  v_hash text;
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from journal_import_sources
                 where source_kind = p_kind and source_id = p_source_id and article_id = p_article) then
    raise exception 'not_found';
  end if;
  if not private.journal_import_untouched(p_article) then raise exception 'edited'; end if;
  if private.journal_body_unsafe(v_body) then
    raise exception 'body_unsafe';
  end if;

  if not private.journal_slug_ok(v_base) then v_base := 'imported-article'; end if;
  v_slug := v_base;
  while not private.journal_slug_free(v_slug, p_article) loop
    v_n := v_n + 1;
    v_slug := left(v_base, 110) || '-' || v_n;
  end loop;

  select working_revision_id into v_rev from journal_articles where id = p_article;
  update journal_revisions set
    title = left(coalesce(nullif(btrim(p_fields->>'title'), ''), title), 200),
    slug = v_slug,
    excerpt = nullif(left(btrim(coalesce(p_fields->>'excerpt', '')), 600), ''),
    body_html = v_body,
    author_name = nullif(left(btrim(coalesce(p_fields->>'author_name', '')), 120), ''),
    featured_media_id = nullif(p_fields->>'featured_media_id', '')::uuid,
    featured_alt = nullif(left(btrim(coalesce(p_fields->>'featured_alt', '')), 500), ''),
    original_published_at = nullif(p_fields->>'original_published_at', '')::timestamptz,
    source_url = nullif(p_source_url, ''),
    lock_version = lock_version + 1,
    updated_by = auth.uid(), updated_at = now()
  where id = v_rev
  returning content_hash into v_hash;

  insert into journal_revision_changes (revision_id, actor_id, changed_fields, lock_version, content_hash)
  select v_rev, auth.uid(), array['import'], lock_version, content_hash from journal_revisions where id = v_rev;

  update journal_import_sources
  set source_hash = p_source_hash, source_url = p_source_url, last_imported_at = now()
  where source_kind = p_kind and source_id = p_source_id;

  perform private.journal_audit(p_article, v_rev, 'imported',
    jsonb_build_object('source', p_kind, 'source_id', p_source_id, 'slug', v_slug));
  return query select v_slug, v_slug <> v_base;
end;
$$;

-- ============================================================ scheduler ==
/*
 * Is automatic publishing running? For the studio (editors only): whether the
 * pg_cron job exists and is active, when it last ran and how, and how many
 * scheduled articles are overdue. Reads the cron schema dynamically, so this
 * function exists (and says "not configured") where pg_cron does not.
 */
create or replace function journal_scheduler_status()
returns table (configured boolean, active boolean, last_run_at timestamptz, last_status text, overdue int)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_active boolean;
  v_last timestamptz;
  v_status text;
  v_overdue int;
begin
  if not journal_is_editor() then raise exception 'not_allowed'; end if;
  select count(*) into v_overdue from journal_articles
  where scheduled_for is not null and scheduled_for < now() - interval '2 minutes';
  if to_regclass('cron.job') is null then
    return query select false, false, null::timestamptz, null::text, v_overdue;
    return;
  end if;
  execute $q$select active from cron.job where jobname = 'journal-publish-due'$q$ into v_active;
  if to_regclass('cron.job_run_details') is not null then
    execute $q$select d.end_time, d.status from cron.job_run_details d
               join cron.job j on j.jobid = d.jobid
               where j.jobname = 'journal-publish-due'
               order by d.start_time desc limit 1$q$ into v_last, v_status;
  end if;
  return query select v_active is not null, coalesce(v_active, false), v_last, v_status, v_overdue;
end;
$$;

/*
 * Register the job (D-132). pg_cron is preloaded on Supabase (local and
 * hosted). Where it is not available — e.g. a plain PostgreSQL test cluster —
 * the migration still applies, says so, and journal_scheduler_status() reports
 * "not configured" in the studio, so the gap is visible rather than silent.
 * cron.schedule() upserts by job name, so re-applying is harmless.
 */
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise warning 'pg_cron is not available: scheduled Journal articles will not publish automatically (D-132).';
    return;
  end if;
  begin
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('journal-publish-due', '* * * * *', 'select public.journal_publish_due()');
  exception when others then
    raise warning 'pg_cron could not be set up (%): scheduled Journal articles will not publish automatically (D-132).', sqlerrm;
  end;
end
$cron$;

-- ============================================================ legacy rows ==
-- Any 0002 article (none are known to exist) becomes revision 1. A row that
-- was already public stays live, recorded as a pre-workflow publication; any
-- change to it now needs review.
do $$
declare
  a record;
  v_rev uuid;
begin
  for a in select * from journal_articles where working_revision_id is null loop
    insert into journal_revisions (article_id, number, state, title, slug, excerpt, body_html, category_id)
    values (a.id, 1,
            case when a.published then 'live'::journal_revision_state else 'draft'::journal_revision_state end,
            coalesce(a.title, ''), coalesce(a.slug, ''), a.standfirst,
            coalesce((select string_agg('<p>' || replace(replace(replace(p, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>', '')
                      from unnest(regexp_split_to_array(coalesce(a.body, ''), E'\\n\\s*\\n')) p
                      where btrim(p) <> ''), ''),
            a.category_id)
    returning id into v_rev;
    update journal_articles set
      working_revision_id = v_rev,
      live_revision_id = case when a.published then v_rev end,
      first_published_at = case when a.published then coalesce(a.published_at, a.created_at) end
    where id = a.id;
    insert into journal_audit (article_id, revision_id, action, detail)
    values (a.id, v_rev, 'legacy_backfill', jsonb_build_object('was_published', a.published));
  end loop;
end $$;

-- ===================================================== row level security ==
alter table journal_staff              enable row level security;
alter table journal_revisions          enable row level security;
alter table journal_media              enable row level security;
alter table journal_article_members    enable row level security;
alter table journal_review_assignments enable row level security;
alter table journal_review_decisions   enable row level security;
alter table journal_comments           enable row level security;
alter table journal_revision_changes   enable row level security;
alter table journal_audit              enable row level security;
alter table journal_import_sources     enable row level security;
alter table journal_import_runs        enable row level security;
alter table journal_import_items       enable row level security;

-- 0002's public read and admin write on articles are replaced (D-127).
drop policy if exists "published articles are public" on journal_articles;
drop policy if exists "admins manage articles" on journal_articles;
drop policy if exists "admins manage categories" on journal_categories;

create policy "journal staff read articles" on journal_articles
  for select to authenticated using (journal_can_view(id));
create policy "journal staff read revisions" on journal_revisions
  for select to authenticated using (journal_can_view(article_id));
create policy "journal staff read media rows" on journal_media
  for select to authenticated using (journal_can_view(article_id));
create policy "journal staff read members" on journal_article_members
  for select to authenticated using (journal_can_view(article_id));
create policy "journal staff read assignments" on journal_review_assignments
  for select to authenticated using (journal_can_view(article_id));
create policy "journal staff read decisions" on journal_review_decisions
  for select to authenticated using (journal_can_view(article_id));
create policy "journal staff read comments" on journal_comments
  for select to authenticated using (journal_can_view(article_id));
create policy "journal staff read changes" on journal_revision_changes
  for select to authenticated using (
    journal_can_view((select r.article_id from journal_revisions r where r.id = revision_id)));
create policy "journal staff read audit" on journal_audit
  for select to authenticated using (
    (article_id is not null and journal_can_view(article_id)) or (article_id is null and is_admin()));
create policy "journal staff read own roles" on journal_staff
  for select to authenticated using (profile_id = auth.uid() or is_admin());
create policy "journal editors read import sources" on journal_import_sources
  for select to authenticated using (journal_is_editor());
create policy "journal editors read import runs" on journal_import_runs
  for select to authenticated using (journal_is_editor());
create policy "journal editors read import items" on journal_import_items
  for select to authenticated using (journal_is_editor());

-- Categories stay publicly readable (0002); editors manage them.
create policy "journal editors manage categories" on journal_categories
  for all to authenticated using (journal_is_editor()) with check (journal_is_editor());

-- No client write path to any of this, whatever a later default grant does:
-- every write goes through the functions above (which run as the owner).
revoke insert, update, delete, truncate on
  journal_articles, journal_revisions, journal_media, journal_article_members,
  journal_review_assignments, journal_review_decisions, journal_comments,
  journal_revision_changes, journal_audit, journal_staff,
  journal_import_sources, journal_import_runs, journal_import_items
  from anon, authenticated;
revoke select on
  journal_articles, journal_revisions, journal_media, journal_article_members,
  journal_review_assignments, journal_review_decisions, journal_comments,
  journal_revision_changes, journal_audit, journal_staff,
  journal_import_sources, journal_import_runs, journal_import_items
  from anon;

-- Internal helpers are never callable by a client.
revoke all on function private.journal_go_live(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.journal_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.journal_sync_media(uuid) from public, anon, authenticated;
revoke all on function private.journal_slug_free(text, uuid) from public, anon, authenticated;
revoke all on function private.journal_import_untouched(uuid) from public, anon, authenticated;
revoke all on function private.journal_profile_has_role(uuid, journal_role) from public, anon, authenticated;
-- Pure helpers in `private` are not callable by clients (the schema convention
-- since 20260929120000: usage for authenticated only, PUBLIC execute revoked).
revoke all on function
  private.journal_hash(journal_revisions), private.journal_revision_guard(),
  private.journal_slug_ok(text), private.journal_body_unsafe(text),
  private.journal_text(text), private.journal_try_uuid(text)
  from public, anon, authenticated;
-- The staff upload policy evaluates this as the signed-in uploader.
grant execute on function private.journal_try_uuid(text) to authenticated;
-- The read policy evaluates this as the requesting role, anon included. It
-- lives in `public` so anon needs no access to the `private` schema at all.
grant execute on function journal_media_readable(text) to anon, authenticated;

-- Staff functions: signed-in only. Each re-checks the role itself.
revoke all on function
  journal_staff_directory(), journal_set_role(text, journal_role, boolean),
  journal_create_article(text, text), journal_save_revision(uuid, int, jsonb),
  journal_start_revision(uuid), journal_submit_for_review(uuid, int),
  journal_withdraw_submission(uuid), journal_assign_reviewer(uuid, uuid, boolean),
  journal_decide(uuid, journal_decision, text, text),
  journal_add_comment(uuid, uuid, text, uuid, text), journal_resolve_comment(uuid, boolean),
  journal_set_member(uuid, uuid, text), journal_publish(uuid, text), journal_scheduler_status(),
  journal_schedule(uuid, text, timestamptz), journal_cancel_schedule(uuid),
  journal_unpublish(uuid), journal_archive(uuid, boolean), journal_delete_article(uuid),
  journal_register_media(uuid, text, text, int, text, text),
  journal_import_start(text, text), journal_import_log(uuid, text, text, text, text, uuid, text, jsonb),
  journal_import_finish(uuid, jsonb), journal_import_prepare(text, text, text, text),
  journal_import_apply(uuid, text, text, text, text, jsonb)
  from public, anon;

-- Public reads are safe for anyone (D-127, D-131).
grant execute on function
  journal_public_list(text, text, text, int, int), journal_public_article(text),
  journal_public_tags(), journal_media_path(uuid)
  to anon, authenticated;

-- The scheduler runs only as the database owner (pg_cron). No client role can
-- trigger publication, early or otherwise (D-132).
revoke all on function journal_publish_due() from public, anon, authenticated;
revoke all on function private.journal_take_down(journal_articles) from public, anon, authenticated;
revoke all on function private.journal_publish_problem(journal_revisions, journal_articles) from public, anon, authenticated;
revoke all on function private.journal_profile_can_publish(uuid, uuid) from public, anon, authenticated;
