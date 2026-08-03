-- ============================================================================
-- reelmint · 0001_init
-- Accounts, brand profile, and the content tables that back cloud sync.
--
-- Every user table is protected by RLS keyed on auth.uid(). The service role
-- used by the API server bypasses RLS, so anything the server does on a user's
-- behalf must scope by user_id explicitly.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─── shared helpers ─────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per auth.users row, created by trigger on signup.
-- trial_ends_at is the single source of truth for the free trial: a profile
-- whose trial_ends_at is in the future is entitled to the top tier.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  avatar_url    text,
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  -- Reused across every subscription this user ever creates, so upgrading a
  -- plan does not leave a trail of duplicate customers in Razorpay.
  razorpay_customer_id text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Populate profiles from the Google identity Supabase Auth hands us.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;

  insert into public.brands (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ─── brands ─────────────────────────────────────────────────────────────────
-- The brand profile that drives every piece of generated copy. 1:1 with a user.

create table public.brands (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  app_name   text not null default '',
  tagline    text not null default '',
  category   text not null default 'productivity',
  verb       text not null default 'get things done',
  tone       text not null default 'bold',
  accent     text not null default '#d6f65c',
  onboarded  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- Declared here rather than beside handle_new_user() so both tables the
-- function writes into already exist when the trigger can first fire.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── image sets ─────────────────────────────────────────────────────────────
-- Only the user's own sets live here. The five built-in sets stay as static
-- client constants pointing at /public assets — no reason to pay for rows.

create table public.image_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'My set',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index image_sets_user_idx on public.image_sets (user_id, created_at desc);

create trigger image_sets_updated_at
  before update on public.image_sets
  for each row execute function public.set_updated_at();

create table public.set_images (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references public.image_sets(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index set_images_set_idx on public.set_images (set_id, position);

-- ─── carousels ──────────────────────────────────────────────────────────────
-- slides is jsonb on purpose. It is a nested editor document (slides -> text
-- layers with per-layer position, font, colour) that is always read and written
-- whole. Normalising it into tables would buy nothing and cost a round trip per
-- drag.

create table public.carousels (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null default 'Untitled carousel',
  preset_id      text,
  set_assignment jsonb not null default '{}'::jsonb,
  slides         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index carousels_user_idx on public.carousels (user_id, created_at desc);

create trigger carousels_updated_at
  before update on public.carousels
  for each row execute function public.set_updated_at();

-- ─── hook videos ────────────────────────────────────────────────────────────

create table public.videos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null default 'Untitled video',
  character_id   text not null,
  hook           jsonb not null default '{}'::jsonb,
  demo_path      text,
  demo_duration  numeric not null default 0,
  demo_trim      jsonb not null default '{"start":0,"end":0}'::jsonb,
  audio          jsonb not null default '{"trackId":"hype","volume":0.8}'::jsonb,
  overlays       jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index videos_user_idx on public.videos (user_id, created_at desc);

create trigger videos_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

-- ─── Blink AI generations ───────────────────────────────────────────────────
-- status moves pending -> rendering -> ready | failed. The row is created by
-- the API server before it calls Veo so a generation is always accounted for,
-- even if the render later fails.

create table public.blinks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  prompt           text not null,
  creator_id       text,
  creator_name     text,
  duration_seconds integer not null default 6,
  aspect_ratio     text not null default '9:16',
  resolution       text not null default '1080p',
  negative_prompt  text,
  status           text not null default 'pending'
                     check (status in ('pending','rendering','ready','failed')),
  operation_name   text,
  storage_path     text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index blinks_user_idx on public.blinks (user_id, created_at desc);
create index blinks_status_idx on public.blinks (status) where status in ('pending','rendering');

create trigger blinks_updated_at
  before update on public.blinks
  for each row execute function public.set_updated_at();

-- ─── usage log ──────────────────────────────────────────────────────────────
-- Append-only record of billable work, written by the server. Not used to gate
-- anything today (plans are unmetered) but it is what you will want the day you
-- add quotas or need to explain a Google bill.

create table public.generation_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  cost_units integer not null default 1,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index generation_events_user_idx on public.generation_events (user_id, created_at desc);

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.brands            enable row level security;
alter table public.image_sets        enable row level security;
alter table public.set_images        enable row level security;
alter table public.carousels         enable row level security;
alter table public.videos            enable row level security;
alter table public.blinks            enable row level security;
alter table public.generation_events enable row level security;

-- profiles: readable by its owner. Insert is handled by the signup trigger, so
-- no insert policy is granted.
create policy "profiles: owner reads"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner updates" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- RLS decides which ROWS a user may touch. It says nothing about which COLUMNS.
--
-- That distinction matters here: the update policy above is row-correct — a
-- user may only ever write their own profile — but on its own it would let them
-- write *any field* of it, including trial_ends_at. Anyone could open the
-- console and hand themselves a ten-year free trial:
--
--   supabase.from('profiles').update({ trial_ends_at: '2099-01-01' }).eq('id', me)
--
-- Column privileges are the mechanism that actually closes this. Supabase
-- grants authenticated full UPDATE on new public tables by default, so the
-- grant has to be narrowed explicitly. Only these two columns are the user's to
-- change; trial_ends_at and razorpay_customer_id belong to the server.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

create policy "brands: owner reads"   on public.brands for select using (auth.uid() = user_id);
create policy "brands: owner writes"  on public.brands for insert with check (auth.uid() = user_id);
create policy "brands: owner updates" on public.brands for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "image_sets: owner all" on public.image_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "set_images: owner all" on public.set_images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "carousels: owner all" on public.carousels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "videos: owner all" on public.videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Blinks are created and advanced by the server (service role). Users may read
-- their own and delete them; they may not forge or mutate one.
create policy "blinks: owner reads"   on public.blinks for select using (auth.uid() = user_id);
create policy "blinks: owner deletes" on public.blinks for delete using (auth.uid() = user_id);

create policy "generation_events: owner reads" on public.generation_events
  for select using (auth.uid() = user_id);
