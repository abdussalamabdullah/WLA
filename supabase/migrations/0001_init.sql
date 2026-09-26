-- ============================================================================
-- WLA Academy — initial schema
-- Authority: Technical Specification §6–§23, §49, §50; Academy Architecture §3.
--
-- THE LOAD-BEARING RULE (Tech Spec §50):
--   learner progress keys on child_id + mission_id — NEVER parent_id.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
-- Architecture §4: the three statuses are LOCKED.
create type mission_status as enum ('not_started', 'in_progress', 'complete');

-- Tech Spec §10 calls these illustrative, not mandated.
create type entitlement_source as enum ('free', 'purchase', 'gift', 'redeemed', 'admin');
create type entitlement_status as enum ('active', 'revoked');

-- Public Master: missions are labelled "Physical" or "Hybrid".
create type mission_delivery as enum ('physical', 'hybrid', 'digital');

-- Master copy §4 — the five Labs. One WLA system, not five colour brands.
create type wla_lab as enum ('challenge', 'decision', 'curiosity', 'wellbeing', 'navigation');

-- Tech Spec §15. screen_type selects the renderer component; adding a value
-- here requires a matching entry in features/mission-engine/registry.ts.
create type screen_type as enum ('content', 'choice', 'response', 'reveal', 'handoff', 'completion');

create type resource_type as enum ('pdf', 'image', 'document', 'other');

-- Architecture §15 — the distinction that must never collapse into "files".
create type evidence_type as enum ('physical', 'digital');

-- --------------------------------------------------------- parent account --
-- Tech Spec §6: only what is needed to operate WLA.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------- child profile --
-- Tech Spec §7: keep child information minimal. No faces, no full public
-- names, no school, no address (Brief §46).
create table child_profiles (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references profiles(id) on delete cascade,
  display_name  text not null,
  -- Year of birth only: enough to match a mission's age band without storing
  -- a full DOB. See docs/DECISIONS.md → OPEN-05.
  birth_year    int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on child_profiles (parent_id);

-- ----------------------------------------------------- mission definition --
-- Tech Spec §9. This is the mission ITSELF — never what a child has done.
create table missions (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  description    text,
  lab            wla_lab not null,
  min_age        int not null,
  max_age        int not null,
  duration       text,                       -- display string e.g. "60–90 mins"
  delivery_type  mission_delivery not null default 'hybrid',
  cover_image    text,
  -- Commercial data lives on the mission. UI must never hard-code either
  -- value (client instruction, 2026-09-25).
  price_minor    int,                        -- minor units, e.g. pence
  currency       text not null default 'GBP',
  is_free        boolean not null default false,
  -- Tech Spec §53: progress records the version it began under so that editing
  -- a live mission cannot silently corrupt a child's in-flight state.
  version        int not null default 1,
  published      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Tech Spec §15/§16. Mission CONTENT, rendered by the shared engine.
create table mission_screens (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references missions(id) on delete cascade,
  screen_key     text not null,
  type           screen_type not null,
  title          text,
  body           text,
  sequence       int not null,
  -- Component-specific payload (choice options, branch targets, reveal
  -- conditions, handoff copy). Validated by zod in the mission engine —
  -- Tech Spec §12 requires this JSON be "validated and controlled".
  configuration  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (mission_id, screen_key)
);
create index on mission_screens (mission_id, sequence);

-- Tech Spec §19. Architecture §7: what WLA GIVES the child.
create table mission_resources (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references missions(id) on delete cascade,
  title          text not null,
  description    text,
  type           resource_type not null default 'pdf',
  storage_path   text not null,
  can_view       boolean not null default true,
  can_print      boolean not null default true,
  can_download   boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);
create index on mission_resources (mission_id, sort_order);

-- Tech Spec §21. Architecture §8: adult guidance, separate from Mission Kit.
create table mission_parent_notes (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references missions(id) on delete cascade unique,
  content     text not null,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ entitlement --
-- Tech Spec §10. Catalogue ≠ entitlement ≠ progress (PRD §9).
create table mission_entitlements (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references child_profiles(id) on delete cascade,
  mission_id    uuid not null references missions(id) on delete cascade,
  source        entitlement_source not null,
  status        entitlement_status not null default 'active',
  -- Set by the Stripe webhook only (Tech Spec §40) — never by the client.
  stripe_payment_intent_id text,
  granted_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (child_id, mission_id)
);
create index on mission_entitlements (child_id);

-- --------------------------------------------------------------- progress --
-- Tech Spec §11 + §50.
create table mission_progress (
  id                uuid primary key default gen_random_uuid(),
  child_id          uuid not null references child_profiles(id) on delete cascade,
  mission_id        uuid not null references missions(id) on delete cascade,
  status            mission_status not null default 'not_started',
  current_screen_key text,
  -- Which mission version this run began under (Tech Spec §53).
  mission_version   int not null default 1,
  started_at        timestamptz,
  completed_at      timestamptz,
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Tech Spec §27: "Do not create duplicate progress records every time Start
  -- is clicked." Enforced in the database, not just in application code.
  unique (child_id, mission_id)
);
create index on mission_progress (child_id, status);

-- Tech Spec §12. Deliberately a single JSON blob: the Architecture (§19)
-- forbids forcing every mission into one internal sequence, so the shape is
-- owned by each mission's Build Brief and validated by the engine.
create table mission_state (
  progress_id  uuid primary key references mission_progress(id) on delete cascade,
  state_data   jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Responses are split out of state_data so that Mission Trail can surface a
-- child's own words without parsing an opaque blob (Architecture §15).
create table mission_responses (
  id           uuid primary key default gen_random_uuid(),
  progress_id  uuid not null references mission_progress(id) on delete cascade,
  screen_key   text not null,
  value        jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (progress_id, screen_key)
);

-- Tech Spec §22. Private by default (Architecture §15).
create table mission_evidence (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references child_profiles(id) on delete cascade,
  mission_id    uuid not null references missions(id) on delete cascade,
  progress_id   uuid references mission_progress(id) on delete set null,
  type          evidence_type not null,
  title         text not null,
  description   text,
  -- NULL for physical evidence. The Academy records that the artefact belongs
  -- to the Trail without pretending to hold a copy (Brief §27, UI/UX §44).
  storage_path  text,
  created_at    timestamptz not null default now(),
  constraint digital_evidence_has_file
    check (type = 'physical' or storage_path is not null)
);
create index on mission_evidence (child_id, mission_id);

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Scope note (conflict C2): RLS enforces the FAMILY boundary — a parent reaches
-- only their own children's rows. It cannot distinguish sibling from sibling,
-- because both are the same authenticated user. Within-family child scoping is
-- enforced in src/lib/permissions. Both layers are required.
-- ============================================================================

alter table profiles             enable row level security;
alter table child_profiles       enable row level security;
alter table missions             enable row level security;
alter table mission_screens      enable row level security;
alter table mission_resources    enable row level security;
alter table mission_parent_notes enable row level security;
alter table mission_entitlements enable row level security;
alter table mission_progress     enable row level security;
alter table mission_state        enable row level security;
alter table mission_responses    enable row level security;
alter table mission_evidence     enable row level security;

-- Helper: does this child belong to the calling parent?
create or replace function owns_child(target_child uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from child_profiles c
    where c.id = target_child and c.parent_id = auth.uid()
  );
$$;

-- Helper: is this progress row inside the calling parent's family?
create or replace function owns_progress(target_progress uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from mission_progress p
    join child_profiles c on c.id = p.child_id
    where p.id = target_progress and c.parent_id = auth.uid()
  );
$$;

-- --- parent account ---
create policy "parent reads own profile"    on profiles for select using (id = auth.uid());
create policy "parent updates own profile"  on profiles for update using (id = auth.uid());
create policy "parent inserts own profile"  on profiles for insert with check (id = auth.uid());

-- --- child profiles ---
create policy "parent manages own children" on child_profiles
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- --- mission catalogue: published missions are world-readable ---
create policy "published missions are readable" on missions
  for select using (published = true);

-- Mission CONTENT is gated on entitlement. Without this, an unpurchased
-- mission's screens could be read straight out of the API.
create policy "screens require entitlement" on mission_screens
  for select using (
    exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where e.mission_id = mission_screens.mission_id
        and c.parent_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy "resources require entitlement" on mission_resources
  for select using (
    exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where e.mission_id = mission_resources.mission_id
        and c.parent_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy "parent notes require entitlement" on mission_parent_notes
  for select using (
    exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where e.mission_id = mission_parent_notes.mission_id
        and c.parent_id = auth.uid()
        and e.status = 'active'
    )
  );

-- --- entitlements: readable by the family, written only by the webhook ---
-- No insert/update policy: entitlement creation goes through the service-role
-- client after Stripe signature verification (Tech Spec §40).
create policy "family reads own entitlements" on mission_entitlements
  for select using (owns_child(child_id));

-- --- learner state ---
create policy "family reads own progress"   on mission_progress
  for select using (owns_child(child_id));
create policy "family writes own progress"  on mission_progress
  for insert with check (owns_child(child_id));
create policy "family updates own progress" on mission_progress
  for update using (owns_child(child_id)) with check (owns_child(child_id));

create policy "family reads own state"      on mission_state
  for select using (owns_progress(progress_id));
create policy "family writes own state"     on mission_state
  for insert with check (owns_progress(progress_id));
create policy "family updates own state"    on mission_state
  for update using (owns_progress(progress_id)) with check (owns_progress(progress_id));

create policy "family reads own responses"  on mission_responses
  for select using (owns_progress(progress_id));
create policy "family writes own responses" on mission_responses
  for insert with check (owns_progress(progress_id));
create policy "family updates own responses" on mission_responses
  for update using (owns_progress(progress_id)) with check (owns_progress(progress_id));

create policy "family reads own evidence"   on mission_evidence
  for select using (owns_child(child_id));
create policy "family writes own evidence"  on mission_evidence
  for insert with check (owns_child(child_id));

-- ============================================================================
-- STORAGE (Tech Spec §20) — two buckets, deliberately NOT treated alike.
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('mission-resources', 'mission-resources', false),  -- WLA-supplied
  ('mission-evidence',  'mission-evidence',  false)   -- child-generated
on conflict (id) do nothing;

-- Resources: readable when the family holds an entitlement for that mission.
-- Path convention: mission-resources/<mission_id>/<filename>
create policy "entitled families read mission resources" on storage.objects
  for select using (
    bucket_id = 'mission-resources'
    and exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where c.parent_id = auth.uid()
        and e.status = 'active'
        and e.mission_id::text = (storage.foldername(name))[1]
    )
  );

-- Evidence: strictly the family's own. Tech Spec §47 — never a public URL.
-- Path convention: mission-evidence/<child_id>/<mission_id>/<filename>
create policy "family reads own evidence files" on storage.objects
  for select using (
    bucket_id = 'mission-evidence'
    and owns_child(((storage.foldername(name))[1])::uuid)
  );

create policy "family uploads own evidence files" on storage.objects
  for insert with check (
    bucket_id = 'mission-evidence'
    and owns_child(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------- trigger --
-- Create the parent profile row on signup.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
