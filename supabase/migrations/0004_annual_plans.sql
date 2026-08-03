-- ============================================================================
-- reelmint · 0004_annual_plans
-- Adds a yearly option alongside each monthly tier.
--
-- tier and rank are what gate features, and they are unchanged: an annual
-- subscriber and a monthly subscriber on the same tier get exactly the same
-- access. period only affects what is charged and how often, so
-- entitled_tier() needs no changes at all.
-- ============================================================================

-- Which plans a customer may hold at once is a tier question, not a period
-- question — being on Creator monthly and Creator annual simultaneously is
-- always a mistake. The API already refuses to create a second subscription
-- for a plan you are on, and treats any other live plan as one to replace.

insert into public.plans (id, name, blurb, tier, rank, price_paise, period, interval, features, sort) values
  (
    'creator_annual',
    'Creator',
    'Carousels and creator-led hook videos, unlimited.',
    'creator',
    1,
    -- Twelve months for the price of ten. Placeholder economics — change here
    -- AND in the matching Razorpay plan, which cannot be edited after creation.
    999000,
    'yearly',
    1,
    '[
      "Unlimited photo carousels",
      "Unlimited hook videos with the full creator roster",
      "Your own custom image sets",
      "1080 × 1350 PNG and ZIP export",
      "Video export with synthesized soundtracks",
      "Cloud sync across devices"
    ]'::jsonb,
    3
  ),
  (
    'studio_annual',
    'Studio',
    'Everything in Creator, plus Blink AI video generation.',
    'studio',
    2,
    2499000,
    'yearly',
    1,
    '[
      "Everything in Creator",
      "Blink AI — prompt-to-video with Google Veo",
      "Creator and product image conditioning",
      "1080p generations up to 8 seconds",
      "Generations archived to your library",
      "Priority rendering"
    ]'::jsonb,
    4
  )
on conflict (id) do nothing;

-- Guard the invariant the pricing page depends on: exactly one active plan per
-- (tier, period). Without this a duplicate seed would render two identical
-- cards and make "which plan am I on" ambiguous.
create unique index if not exists plans_tier_period_active_idx
  on public.plans (tier, period)
  where active;
