-- ===========================================================================
-- JOURNAL STUDIO, SIMPLIFIED (D-134 … D-136). Additive; nothing is dropped.
--
--   1. Private preview links (D-134): unguessable, revocable, view-only links
--      that show the latest SAVED version of one article to someone without
--      a WLA account. Only the SHA-256 of a token is stored; the token is
--      shown once to the person who made it. Holding a link never grants
--      edit access: editing still needs a signed-in, authorised collaborator.
--   2. Unused media can be removed safely (D-135): only files no version of
--      the article refers to, never a public one, and never one uploaded in
--      the last 24 hours (an unsaved editor may still be using it).
--   3. The journal-media bucket itself enforces the image rules (D-135):
--      10 MB and an explicit raster allowlist, as well as the database checks
--      and the server's byte sniffing.
--   4. An article can start untitled (D-136); publishing still needs a title.
--
-- The public API, the scheduler and the review tables are unchanged.
-- ===========================================================================

-- ------------------------------------------------------- preview links --
create table journal_preview_links (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references journal_articles(id) on delete cascade,
  -- SHA-256 (hex) of the token. The token itself is never stored.
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  revoked_by  uuid references profiles(id) on delete set null
);
create index journal_preview_links_article_idx on journal_preview_links (article_id, created_at desc);

alter table journal_preview_links enable row level security;
-- Staff who can see the article see its links (never the token: it isn't here).
create policy "journal staff read preview links" on journal_preview_links
  for select to authenticated using (journal_can_view(article_id));
revoke insert, update, delete, truncate on journal_preview_links from anon, authenticated;
revoke select on journal_preview_links from anon;

/* A valid, unrevoked, unexpired link for an unarchived article: its article id. */
create or replace function private.journal_preview_article_id(p_token text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select l.article_id
  from journal_preview_links l
  join journal_articles a on a.id = l.article_id
  where p_token is not null
    and length(p_token) between 32 and 128
    and l.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and l.revoked_at is null
    and l.expires_at > now()
    and a.archived_at is null;
$$;

/*
 * Make a view-only preview link. Anyone who can EDIT the article may share
 * it. Returns the token ONCE; only its hash is kept.
 */
create or replace function journal_create_preview_link(p_article uuid, p_days int default 30)
returns table (link_id uuid, token text, expires_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90));
begin
  if not journal_can_edit(p_article) then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from journal_articles where id = p_article and archived_at is not null) then
    raise exception 'archived';
  end if;
  -- 32 random bytes, URL-safe base64 without padding (43 characters).
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into journal_preview_links (article_id, token_hash, created_by, expires_at)
  values (p_article, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), auth.uid(), v_expires)
  returning id into v_id;
  perform private.journal_audit(p_article, null, 'preview_link_created', jsonb_build_object('link_id', v_id, 'expires_at', v_expires));
  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function journal_revoke_preview_link(p_link uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l journal_preview_links;
begin
  select * into l from journal_preview_links where id = p_link for update;
  if not found or not journal_can_edit(l.article_id) then
    raise exception 'not_allowed';
  end if;
  if l.revoked_at is not null then
    return;
  end if;
  update journal_preview_links set revoked_at = now(), revoked_by = auth.uid() where id = p_link;
  perform private.journal_audit(l.article_id, null, 'preview_link_revoked', jsonb_build_object('link_id', p_link));
end;
$$;

/*
 * What a preview link shows: the latest SAVED version (the working
 * revision) of that one article, and nothing else — no ids, hashes,
 * comments, reviewers or history. A bad, revoked or expired token returns no
 * row, the same answer as one that never existed.
 */
create or replace function journal_preview_article(p_token text)
returns table (
  title text, excerpt text, body_html text, author_name text,
  category_name text, tags text[], featured_media_id uuid, featured_alt text,
  original_published_at timestamptz, first_published_at timestamptz,
  source_url text, saved_at timestamptz, is_live boolean
)
language sql stable security definer
set search_path = public
as $$
  select r.title, r.excerpt, r.body_html, r.author_name,
         c.name, r.tags, r.featured_media_id, r.featured_alt,
         r.original_published_at, a.first_published_at,
         r.source_url, r.updated_at, a.live_revision_id = r.id
  from journal_articles a
  join journal_revisions r on r.id = a.working_revision_id
  left join journal_categories c on c.id = r.category_id
  where a.id = private.journal_preview_article_id(p_token);
$$;

/*
 * The storage path of one image a preview may show: it must belong to the
 * link's article AND be used by the version the preview shows. Anything else
 * returns nothing. The route that calls this signs the path (D-134, the D-64
 * pattern: authorise in the database, sign on the server).
 */
create or replace function journal_preview_media_path(p_token text, p_media uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select m.storage_path
  from journal_media m
  join journal_articles a on a.id = m.article_id
  join journal_revisions r on r.id = a.working_revision_id
  where m.id = p_media
    and a.id = private.journal_preview_article_id(p_token)
    and (r.featured_media_id = m.id or position(m.id::text in r.body_html) > 0);
$$;

-- ---------------------------------------------------------- unused media --
/* Is this media row referred to by ANY version of its article (any state)? */
create or replace function private.journal_media_referenced(p_media uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from journal_media m
    join journal_revisions r on r.article_id = m.article_id
    where m.id = p_media
      and (r.featured_media_id = m.id or position(m.id::text in r.body_html) > 0));
$$;

/*
 * Uploads of this article nobody uses: registered images no version refers
 * to (not public, older than 24 hours), and files in the article's folder
 * that were never registered (older than one hour). Editors of the article
 * only.
 */
create or replace function journal_unused_media(p_article uuid)
returns table (media_id uuid, storage_path text)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not journal_can_edit(p_article) then
    raise exception 'not_allowed';
  end if;
  return query
    select m.id, m.storage_path
    from journal_media m
    where m.article_id = p_article
      and not m.is_public
      and m.created_at < now() - interval '24 hours'
      and not private.journal_media_referenced(m.id)
    union all
    select null::uuid, o.name
    from storage.objects o
    where o.bucket_id = 'journal-media'
      and o.name like p_article::text || '/%'
      and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from journal_media m where m.storage_path = o.name);
end;
$$;

/*
 * Forget one unused image: deletes its row (so nothing can refer to it any
 * more) and returns the storage path for the caller to remove the file with
 * their own session. Refused for anything public, referenced, or recent.
 */
create or replace function journal_forget_media(p_media uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  m journal_media;
begin
  select * into m from journal_media where id = p_media for update;
  if not found or not journal_can_edit(m.article_id) then
    raise exception 'not_allowed';
  end if;
  if m.is_public then raise exception 'media_in_use'; end if;
  if private.journal_media_referenced(m.id) then raise exception 'media_in_use'; end if;
  if m.created_at > now() - interval '24 hours' then raise exception 'media_recent'; end if;
  delete from journal_media where id = p_media;
  perform private.journal_audit(m.article_id, null, 'media_removed', jsonb_build_object('media_id', p_media));
  return m.storage_path;
end;
$$;

/*
 * The storage DELETE rule. Only an UNREGISTERED file in an article the
 * caller can edit — a registered image must be forgotten first (above), so
 * nothing any version refers to can be deleted — and only the caller's own
 * upload or one left unregistered for over an hour.
 */
create or replace function journal_media_removable(p_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select journal_can_edit(private.journal_try_uuid(split_part(p_name, '/', 1)))
     and not exists (select 1 from journal_media m where m.storage_path = p_name)
     and exists (
       select 1 from storage.objects o
       where o.bucket_id = 'journal-media' and o.name = p_name
         and (o.owner_id = auth.uid()::text or o.created_at < now() - interval '1 hour'));
$$;

drop policy if exists "journal staff remove unused media" on storage.objects;
create policy "journal staff remove unused media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'journal-media' and journal_media_removable(name)
  );

-- The bucket enforces the image rules too: 10 MB and raster types only.
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'journal-media';

-- ------------------------------------------------------ untitled start --
/* As before (20261014120000), except the title may be empty at the start. */
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
  if char_length(v_title) > 200 then
    raise exception 'title_too_long';
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

-- ---------------------------------------------------------------- grants --
revoke all on function private.journal_preview_article_id(text) from public, anon, authenticated;
revoke all on function private.journal_media_referenced(uuid) from public, anon, authenticated;
revoke all on function
  journal_create_preview_link(uuid, int), journal_revoke_preview_link(uuid),
  journal_unused_media(uuid), journal_forget_media(uuid)
  from public, anon;
-- Previews are for people without an account: the token is the only key.
grant execute on function journal_preview_article(text), journal_preview_media_path(text, uuid) to anon, authenticated;
-- The storage delete policy evaluates this as the signed-in remover.
revoke all on function journal_media_removable(text) from public, anon;
grant execute on function journal_media_removable(text) to authenticated;
