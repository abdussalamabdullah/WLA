-- ============================================================================
-- Editable content — decision D-08 (conflict C3)
--
-- PRD §28 / CMS-01 require editable Journal articles, Journal categories,
-- mission catalogue and Mission Detail. Tech Spec §39 forbids BOTH a full
-- custom CMS and an external CMS.
--
-- Resolution: ordinary Postgres tables plus a thin internal admin. No page
-- builder, no block editor, no third-party service.
--
-- Note what is NOT here: Mission Kit resources need no CMS at all. The Six
-- Names printables are print-ready artwork authored outside the system — they
-- are a file in Storage plus a mission_resources row, nothing more.
-- ============================================================================

-- Gate for the internal admin. Set manually in the dashboard; there is
-- deliberately no self-service route to becoming an admin.
alter table profiles add column if not exists is_admin boolean not null default false;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- ------------------------------------------------------------- journal ----
create table journal_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table journal_articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  standfirst    text,
  body          text not null,             -- markdown
  category_id   uuid references journal_categories(id) on delete set null,
  cover_image   text,
  published     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on journal_articles (category_id, published_at desc);

alter table journal_categories enable row level security;
alter table journal_articles   enable row level security;

create policy "journal categories are public" on journal_categories
  for select using (true);
create policy "published articles are public" on journal_articles
  for select using (published = true);

create policy "admins manage categories" on journal_categories
  for all using (is_admin()) with check (is_admin());
create policy "admins manage articles" on journal_articles
  for all using (is_admin()) with check (is_admin());

-- Mission catalogue / Mission Detail editing (CMS-01) writes to the existing
-- `missions` table, which had select-only policies until now.
create policy "admins manage missions" on missions
  for all using (is_admin()) with check (is_admin());
create policy "admins manage mission screens" on mission_screens
  for all using (is_admin()) with check (is_admin());
create policy "admins manage mission resources" on mission_resources
  for all using (is_admin()) with check (is_admin());
create policy "admins manage parent notes" on mission_parent_notes
  for all using (is_admin()) with check (is_admin());
