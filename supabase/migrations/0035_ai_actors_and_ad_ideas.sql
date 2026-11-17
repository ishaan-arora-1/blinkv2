-- ============================================================================
-- Blink UGC · 0035_ai_actors_and_ad_ideas
--
-- Two features, one table.
--
-- AI Actors: one of the ten creators — or a photo of yourself — reads a script
-- to camera, lip-synced, holding your product if you give us a photo of it.
-- That is the format the category is sold on, and the one thing Blink could
-- not make: Blink AI clips are deliberately silent-mouthed, narrated over the
-- top. Each run is a row here because it renders for minutes on the vendor's
-- side, and the status URL has to outlive a Railway redeploy the same way
-- multiframe_scenes.operation_name does.
--
-- Ad Ideas (a product link in, a strategy and a stack of scripts out) needs no
-- table. It renders nothing and stores nothing we would bill for; its daily
-- cap is counted in generation_events under its own kinds, which is the table
-- that is append-only and that a user cannot empty by deleting their work.
-- ============================================================================

create table if not exists public.actor_videos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  brand_id         uuid references public.brands(id) on delete set null,

  -- A roster id ('cr_casual_girl') or 'custom' for an uploaded face.
  actor_id         text not null,
  actor_name       text,

  script           text not null,
  voice            text not null,

  -- voicing   → narration being synthesised
  -- composing → the product being put in the actor's hand
  -- rendering → handed to the avatar model, status_url stored
  status           text not null default 'voicing'
                     check (status in ('voicing', 'composing', 'rendering', 'ready', 'failed')),

  face_path        text,      -- the still the avatar is driven from
  product_path     text,      -- the customer's product photo, if any
  audio_path       text,      -- the narration
  storage_path     text,      -- the finished video
  operation_name   text,      -- the vendor status URL while rendering
  duration_seconds numeric(6, 2),
  error            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists actor_videos_user_idx
  on public.actor_videos (user_id, created_at desc);

create index if not exists actor_videos_inflight_idx
  on public.actor_videos (status) where status in ('voicing', 'composing', 'rendering');

drop trigger if exists actor_videos_updated_at on public.actor_videos;
create trigger actor_videos_updated_at
  before update on public.actor_videos
  for each row execute function public.set_updated_at();

-- Readable and deletable by the owner. Never writable from a client: the
-- status and the paths are the server's to set, and the server writes with
-- the service role.
alter table public.actor_videos enable row level security;

drop policy if exists "actor_videos: owner reads" on public.actor_videos;
create policy "actor_videos: owner reads" on public.actor_videos
  for select using (auth.uid() = user_id);

drop policy if exists "actor_videos: owner deletes" on public.actor_videos;
create policy "actor_videos: owner deletes" on public.actor_videos
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- The plans say so
-- ============================================================================
--
-- The feature list is customer-facing copy rendered verbatim by the pricing
-- page, the landing page and the paywall. A capability that is not on it does
-- not sell. Inserted after the plan's own first line ("Everything in …" or the
-- headline video line) so the new thing reads as part of what the tier is,
-- and guarded so re-running this does not list it twice.

create or replace function pg_temp.add_after(p_features jsonb, p_at int, p_new text[])
returns jsonb language sql as $$
  select coalesce(jsonb_agg(e order by k), '[]'::jsonb)
    from (
      select e, (ord * 10)::numeric as k
        from jsonb_array_elements(p_features) with ordinality as t(e, ord)
      union all
      select to_jsonb(n), (p_at * 10 + i)::numeric
        from unnest(p_new) with ordinality as u(n, i)
       where not p_features ? n
    ) s
$$;

-- Creator: the ideas, not the actors. Ad Ideas is on every tier; listing it
-- here is what tells a Creator buyer they are getting a strategist too.
update public.plans
   set features = pg_temp.add_after(features, 1, array[
         'Ad Ideas — paste a product link, get 30+ scroll-stopping scripts'
       ])
 where tier = 'creator' and active;

-- Studio and Agency: the actors. Second line, directly under "Everything in …"
-- on monthly and under "Two months free" + "Everything in …" on annual.
update public.plans
   set features = pg_temp.add_after(features, case when period = 'yearly' then 3 else 2 end, array[
         'AI Actors — 10 creators read your script, lip-synced, product in hand',
         'Clone yourself — turn one selfie into a talking AI twin',
         'Unlimited Ad Ideas and Hook Lab scripts'
       ])
 where tier in ('studio', 'agency') and active;
