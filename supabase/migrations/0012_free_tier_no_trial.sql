-- ============================================================================
-- Blink UGC · 0012_free_tier_no_trial
--
-- The seven-day trial is replaced by a permanent free tier.
--
-- The trial answered "how does someone try this before paying?" with a clock:
-- everyone got Starter for a week, and on day eight the whole product locked,
-- including the parts that cost us nothing to run. That is the worst of both —
-- a deadline for the customer, and an account we can never show anything to
-- again once it passes.
--
-- The new answer is a floor rather than a countdown:
--
--     free      photo carousels, over the built-in photography       forever
--     starter   + hook videos, animated carousels, custom image sets  paid
--     growth    + Blink AI                                            paid
--
-- Photo carousels are pure client-side composition — our own stock photos, our
-- own copy templates, rendered in the browser. They cost nothing per use, so
-- there is nothing to protect and no reason for them to expire. Everything a
-- vendor bills us for sits behind a real subscription.
--
-- Three things follow from that, and they are the three parts of this file:
--   1. entitled_tier() stops reading the trial and returns 'free' as its floor
--   2. custom image sets become a Starter feature, enforced in RLS
--   3. the plans table stops describing itself in terms of a trial
-- ============================================================================

-- ─── 1 · the tier functions ─────────────────────────────────────────────────
--
-- 'free' replaces 'none' as the floor. The rename is the point: 'none' meant
-- "locked out", and the app treated it that way — a tier of 'none' put a
-- paywall in front of the entire studio. There is no locked-out state any more.
-- Someone who never paid and someone whose card expired land in the same place,
-- which is the free tier, with their work intact.

create or replace function public.entitled_tier(p_user_id uuid)
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
    'free'
  );
$$;

comment on function public.entitled_tier(uuid) is
  'The tier a user may use: their live subscription, or ''free''. No trial branch since 0012.';

-- paid_tier() keeps the same floor so there is one tier vocabulary, not two.
--
-- It is worth asking whether this function still earns its place. It exists
-- because 0009/0010 had to tell "may see it" apart from "has bought it", and
-- the only thing that ever separated the two was the trial granting a tier
-- nobody paid for. With the trial gone the two functions return the same value
-- for every user alive today.
--
-- It stays because that equality is a coincidence of the current rules, not a
-- property of the system. The next comp'd account, partner tier or win-back
-- grant re-opens the gap instantly, and the failure mode is silent: metered
-- features would start spending at a vendor on an account that never paid. A
-- function that is currently redundant is a cheaper thing to keep than that bug
-- is to find.

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
    'free'
  );
$$;

comment on function public.paid_tier(uuid) is
  'Tier from an actual subscription, ''free'' if none. Use for features that cost money per use; use entitled_tier() for everything else.';

-- Ranking in one place, so a policy never has to spell the ordering out again.
create or replace function public.tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
           when 'growth'  then 2
           when 'starter' then 1
           else 0                 -- 'free', and anything unrecognised
         end;
$$;

create or replace function public.has_tier(p_user_id uuid, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tier_rank(public.entitled_tier(p_user_id)) >= public.tier_rank(p_tier);
$$;

comment on function public.has_tier(uuid, text) is
  'Does this user''s entitled tier reach p_tier? For RLS policies; the API uses entitlements.js.';

-- ─── trial_ends_at is now vestigial ─────────────────────────────────────────
--
-- The column is kept rather than dropped. Nothing reads it after this migration,
-- but every account created before today carries the date its trial would have
-- ended, and that is the only record of who was mid-trial when the model
-- changed — worth having if anyone writes in about it.
--
-- The default and the NOT NULL do go: a column that keeps stamping a trial date
-- onto new signups is a trial that half-exists, and the next person to read the
-- schema would reasonably conclude the feature is still live.

alter table public.profiles
  alter column trial_ends_at drop default,
  alter column trial_ends_at drop not null;

comment on column public.profiles.trial_ends_at is
  'Historical only. The free trial ended with 0012; nothing reads this. Null on accounts created since.';

-- ─── 2 · custom image sets are a Starter feature ────────────────────────────
--
-- The five built-in photo collections stay free — they are static client
-- constants pointing at /public assets (see 0001), so a free photo carousel
-- always has photography to sit on. What Starter buys is uploading your own.
--
-- This has to be enforced here rather than in the API, because image sets are
-- the one feature the browser writes directly: the client inserts into these
-- tables with the user's own token and never touches the Express server. A
-- check in the React app would be a suggestion.
--
-- Only INSERT is gated. Reads, updates and deletes stay open to the owner on
-- purpose — someone who cancels keeps their sets, can still build carousels
-- from them, and can still delete them. Downgrading takes away the ability to
-- add more, not the work already done.

drop policy if exists "image_sets: owner all" on public.image_sets;

create policy "image_sets: owner reads" on public.image_sets
  for select using (auth.uid() = user_id);

create policy "image_sets: Starter creates" on public.image_sets
  for insert with check (auth.uid() = user_id and public.has_tier(auth.uid(), 'starter'));

create policy "image_sets: owner updates" on public.image_sets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "image_sets: owner deletes" on public.image_sets
  for delete using (auth.uid() = user_id);

drop policy if exists "set_images: owner all" on public.set_images;

create policy "set_images: owner reads" on public.set_images
  for select using (auth.uid() = user_id);

create policy "set_images: Starter creates" on public.set_images
  for insert with check (auth.uid() = user_id and public.has_tier(auth.uid(), 'starter'));

create policy "set_images: owner updates" on public.set_images
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "set_images: owner deletes" on public.set_images
  for delete using (auth.uid() = user_id);

-- The row is what makes an image exist to the app, so the policies above are
-- the gate. This is the second half: without it a free account could still push
-- bytes into the bucket, fail the row insert, and leave us paying for storage
-- nobody can see.
--
-- RESTRICTIVE, so it ANDs with "uploads: owner writes" instead of offering an
-- alternative way in. Scoped to the <uid>/sets/ prefix that setImagePath()
-- writes to — brand logos and hook-video demos share this bucket and must stay
-- reachable on the free tier.

drop policy if exists "uploads: set images need Starter" on storage.objects;

create policy "uploads: set images need Starter" on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id <> 'uploads'
    or (storage.foldername(name))[2] is distinct from 'sets'
    or public.has_tier(auth.uid(), 'starter')
  );

-- ─── 3 · what the plans say they are ────────────────────────────────────────
--
-- The pricing page renders these two columns verbatim, so they are the change
-- as far as a customer is concerned. Both were written when Starter was "the
-- entry plan after your trial"; Starter is now what you buy when the free tier
-- stops being enough, and the copy has to name the thing it adds.
--
-- The Growth list also still credited Google Veo, which stopped being true when
-- Blink AI moved to fal. Nothing else quotes the vendor to customers, so it is
-- simply dropped rather than swapped for another name they have no reason to
-- know.

update public.plans set
  blurb = 'Hook videos, animated carousels and your own photo sets.',
  features = '[
    "Everything free: unlimited photo carousels",
    "Animated carousels — a 3D character acts out your message",
    "Unlimited hook videos with the full creator roster",
    "Your own custom image sets",
    "1080 × 1350 PNG and ZIP export",
    "Video export with synthesized soundtracks",
    "Cloud sync across devices"
  ]'::jsonb
where tier = 'starter';

update public.plans set
  blurb = 'Everything in Starter, plus Blink AI video generation.',
  features = '[
    "Everything in Starter",
    "Blink AI — describe a shot, get the video",
    "Creator and product image conditioning",
    "1080p generations up to 8 seconds",
    "Generations archived to your library",
    "Priority rendering"
  ]'::jsonb
where tier = 'growth';
