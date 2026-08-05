-- Animated carousels: a second kind of carousel whose backgrounds are generated
-- rather than chosen from a photo set.
--
-- The slides are the same shape as a photo carousel's — draggable text layers
-- over a background — so this extends `carousels` rather than adding a parallel
-- table. Every editor, list and export path keeps working by construction; the
-- only difference is where the background came from and that the row now has a
-- render lifecycle attached to it.

-- ============================================================================
-- Entitlement: paid, as distinct from entitled
-- ============================================================================
--
-- Animated carousels are metered — each one spends real money at an image
-- vendor — but they sit on Starter rather than Growth. That combination is not
-- expressible with entitled_tier() alone.
--
-- The reason is 0009: the trial grants 'starter'. So `entitled_tier(u) >=
-- 'starter'` is true for someone who has never paid, and gating on it would
-- hand every email address that ever signed up a budget to burn. Blink AI never
-- had this problem because it needs 'growth', which the trial cannot reach.
--
-- So this is the second half of the entitlement question. entitled_tier() says
-- what a user may see; paid_tier() says what they have actually bought. A
-- feature that costs us money per use asks both.
--
-- Deliberately NOT a boolean: "is this a paying customer" collapses the tier
-- out, and the next metered feature that lands on Growth would need a third
-- function. Returning the tier keeps one shape for every such question.

create or replace function public.paid_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.tier
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.user_id = p_user_id
        and s.status in ('active', 'authenticated', 'pending')
        and (s.current_end is null or s.current_end > now())
      order by p.rank desc
      limit 1
    ),
    'none'
  );
$$;

comment on function public.paid_tier(uuid) is
  'Tier from an actual subscription, ignoring the trial. Use for features that cost money per use; use entitled_tier() for everything else.';

-- ============================================================================
-- carousels: a kind, and a render lifecycle
-- ============================================================================

alter table public.carousels
  add column if not exists kind text not null default 'photo'
    check (kind in ('photo', 'animated')),
  -- What the user asked the carousel to be about. Null for photo carousels,
  -- which take their copy from a preset instead.
  add column if not exists topic text,
  add column if not exists character_id text,
  -- The background palette the copy writer chose, reused if slides are re-rolled
  -- later so a new slide still matches the ones beside it.
  add column if not exists palette text,
  add column if not exists status text not null default 'ready'
    check (status in ('pending', 'rendering', 'ready', 'failed')),
  add column if not exists error text;

-- Photo carousels are complete the moment they are created, which is why
-- 'ready' is the default: the column has to be correct for the rows that
-- already exist, and every one of them is a finished photo carousel.

create index if not exists carousels_rendering_idx
  on public.carousels (status) where status in ('pending', 'rendering');

-- ============================================================================
-- Generated slide images
-- ============================================================================
--
-- One row per slide image, rather than a jsonb array on the carousel.
--
-- Slides render concurrently and land out of order, and any one of them can
-- fail on its own — a five-slide carousel is thirty seconds of somebody's money
-- and losing the other four to one refusal is the outcome worth designing away.
-- Separate rows let each slide arrive, fail and be re-rolled independently.

create table if not exists public.carousel_slides (
  id           uuid primary key default gen_random_uuid(),
  carousel_id  uuid not null references public.carousels(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- Position in the carousel, 0-based. Unique per carousel so a re-roll
  -- replaces a slide rather than quietly appending a second copy of it.
  idx          integer not null,
  -- What the character is doing here. Kept so a re-roll can regenerate the same
  -- moment instead of inventing a new one.
  action       text,
  storage_path text,
  status       text not null default 'pending'
                 check (status in ('pending', 'ready', 'failed')),
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (carousel_id, idx)
);

create index if not exists carousel_slides_carousel_idx
  on public.carousel_slides (carousel_id, idx);

create trigger carousel_slides_updated_at
  before update on public.carousel_slides
  for each row execute function public.set_updated_at();

-- ============================================================================
-- The generations bucket has to accept images now
-- ============================================================================
--
-- It was created for Veo and allows video only, so a slide upload fails with
-- "mime type image/png is not supported". The existing policies already say the
-- right thing — service-role writes, owner reads — so only the mime list moves.

update storage.buckets
   set allowed_mime_types = array['video/mp4', 'video/webm', 'image/png', 'image/jpeg', 'image/webp']
 where id = 'generations';

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.carousel_slides enable row level security;

-- Read-only to the owner. No insert or update policy on purpose: these rows are
-- written by the server with the service role, exactly like `blinks`. A client
-- that could insert one could fabricate a finished generation it never paid for.
create policy "carousel_slides: owner reads" on public.carousel_slides
  for select using (auth.uid() = user_id);

-- Deleting is safe and useful — it follows the carousel via the cascade above,
-- but an explicit policy lets the editor drop a single slide.
create policy "carousel_slides: owner deletes" on public.carousel_slides
  for delete using (auth.uid() = user_id);
