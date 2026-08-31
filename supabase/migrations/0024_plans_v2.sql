-- ============================================================================
-- Blink UGC · 0024_plans_v2
--
-- Three plans, priced against what the product actually costs to run.
--
-- The old pair could not survive paid acquisition. Growth was $25.99 for 25
-- Veo clips; at the real rate that is $20 of video plus frames and narration,
-- so the plan cleared about four dollars before payment fees and infrastructure
-- — and before generate_audio was turned off for reels it cost $30 to serve and
-- was underwater at full use. The 25 in 0017 was set against the wrong
-- per-second price and never rechecked. Nothing caught it because nobody ever
-- came close to the cap.
--
-- Two changes fix it.
--
-- The allowance is now denominated in SECONDS OF FINISHED VIDEO rather than in
-- clips. Seconds are what fal bills for, so it is the only unit that stays
-- honest: a credit meaning "one clip" cost us forty cents at four seconds and
-- eighty at eight, which made the eight-second option strictly correct for the
-- customer and strictly worse for us. It is also the unit a buyer understands —
-- "two minutes a month" needs no footnote, where "25 videos" turned out to mean
-- about six.
--
-- And Starter is gone. A tier whose whole contents cost us nothing to serve
-- cannot fund the ads that sell it: at $7.99 and four months of retention it
-- is worth about $26, which does not buy a click-through in this category. The
-- entry plan is now $19 and exists to catch people who bounce off the video
-- price, not to be advertised. Studio is the plan the ads point at.
--
-- Prices are USD, for a US market.
--
--   Creator  $19/mo   $190/yr   no video, unlimited carousels and hook videos
--   Studio   $49/mo   $490/yr   2 minutes of Blink AI video a month
--   Agency  $129/mo  $1290/yr   6 minutes
--
-- Annual is two months free. With paid acquisition that trade is worth more
-- than it costs: it removes twelve months of churn risk and turns a four-month
-- CAC payback into an immediate one.
-- ============================================================================

-- ============================================================================
-- 1 · The legacy rows keep working
-- ============================================================================
--
-- subscriptions.plan_id references plans.id, so the old rows cannot simply be
-- deleted — and must not be, while anyone still holds one. Their tier is
-- remapped to the nearest new one so entitled_tier() keeps resolving for an
-- existing subscriber, and they are deactivated so the pricing page stops
-- offering them. Nobody can buy them; everyone who has one keeps what they had.

-- The constraint comes off first. It still reads ('starter','growth'), so
-- remapping a legacy row to 'creator' while it is in force fails against the
-- old vocabulary before the new one is ever installed.

alter table public.plans drop constraint if exists plans_tier_check;

update public.plans set tier = 'creator' where tier = 'starter';
update public.plans set tier = 'studio'  where tier = 'growth';

update public.plans
   set active = false,
       name = name || ' (retired)'
 where id in ('starter', 'growth');

-- ============================================================================
-- 2 · The tier vocabulary
-- ============================================================================
--
-- entitled_tier() and paid_tier() read plans.tier as data rather than naming
-- tiers themselves, so this constraint is the only place the vocabulary is
-- fixed and neither function has to change. Added once every row already
-- satisfies it.

alter table public.plans
  add constraint plans_tier_check check (tier in ('creator', 'studio', 'agency'));

-- ============================================================================
-- 3 · The plans
-- ============================================================================
--
-- razorpay_plan_id is deliberately null. The plan has to exist in Razorpay
-- first with a matching amount and interval — DEPLOY.md is explicit about this,
-- and 0005 is the migration that exists because it was once done the other way
-- round. Until the ids are filled in, checkout answers with the message in
-- routes/billing.js naming exactly which column is empty, rather than failing
-- somewhere inside the gateway.
--
-- The feature lists are customer-facing copy, rendered verbatim by both the
-- pricing page and the landing page. They are written to sell: the first line
-- of each paid tier is what the tier below does not have.

insert into public.plans (id, name, blurb, tier, rank, price_minor, currency, period, interval, features, active, sort) values
(
  'creator', 'Creator',
  'Post every day without a camera — carousels, hook videos and animated stories.',
  'creator', 1, 1900, 'USD', 'monthly', 1,
  '[
    "Unlimited photo carousels",
    "Unlimited hook videos with all 10 AI creators",
    "60 animated carousel slides a month",
    "Your own custom image sets",
    "1080 × 1350 and 1080 × 1920 exports",
    "Everything saved and synced across your devices"
  ]'::jsonb,
  true, 1
),
(
  'studio', 'Studio',
  'Two minutes of finished, narrated, subtitled AI video every month.',
  'studio', 2, 4900, 'USD', 'monthly', 1,
  '[
    "Everything in Creator",
    "Blink AI — 2 minutes of finished video a month",
    "Multi-scene reels up to 48 seconds each",
    "Your product held identical in every single frame",
    "One AI voiceover across the whole video — 6 voices",
    "Subtitles burned in, timed to the words actually spoken",
    "See every scene before you spend anything filming it",
    "Redraw any scene up to 3 times, free",
    "Always 1080p",
    "120 animated carousel slides a month"
  ]'::jsonb,
  true, 2
),
(
  'agency', 'Agency',
  'Six minutes a month — for shipping new ads every week.',
  'agency', 3, 12900, 'USD', 'monthly', 1,
  '[
    "Everything in Studio",
    "Blink AI — 6 minutes of finished video a month",
    "Roughly 7 full-length reels, or 11 shorter ones",
    "Redraw any scene up to 6 times, free",
    "300 animated carousel slides a month",
    "Priority rendering"
  ]'::jsonb,
  true, 3
),
(
  'creator_annual', 'Creator',
  'Post every day without a camera — two months free on annual.',
  'creator', 1, 19000, 'USD', 'yearly', 1,
  '[
    "Two months free",
    "Unlimited photo carousels",
    "Unlimited hook videos with all 10 AI creators",
    "60 animated carousel slides a month",
    "Your own custom image sets",
    "1080 × 1350 and 1080 × 1920 exports",
    "Everything saved and synced across your devices"
  ]'::jsonb,
  true, 4
),
(
  'studio_annual', 'Studio',
  'Two minutes of finished AI video a month — two months free on annual.',
  'studio', 2, 49000, 'USD', 'yearly', 1,
  '[
    "Two months free",
    "Everything in Creator",
    "Blink AI — 2 minutes of finished video a month",
    "Multi-scene reels up to 48 seconds each",
    "Your product held identical in every single frame",
    "One AI voiceover across the whole video — 6 voices",
    "Subtitles burned in, timed to the words actually spoken",
    "See every scene before you spend anything filming it",
    "Redraw any scene up to 3 times, free",
    "Always 1080p",
    "120 animated carousel slides a month"
  ]'::jsonb,
  true, 5
),
(
  'agency_annual', 'Agency',
  'Six minutes a month — two months free on annual.',
  'agency', 3, 129000, 'USD', 'yearly', 1,
  '[
    "Two months free",
    "Everything in Studio",
    "Blink AI — 6 minutes of finished video a month",
    "Roughly 7 full-length reels, or 11 shorter ones",
    "Redraw any scene up to 6 times, free",
    "300 animated carousel slides a month",
    "Priority rendering"
  ]'::jsonb,
  true, 6
)
on conflict (id) do update set
  name = excluded.name, blurb = excluded.blurb, tier = excluded.tier, rank = excluded.rank,
  price_minor = excluded.price_minor, currency = excluded.currency, period = excluded.period,
  interval = excluded.interval, features = excluded.features, active = excluded.active,
  sort = excluded.sort;
