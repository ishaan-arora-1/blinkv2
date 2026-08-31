-- ============================================================================
-- Blink UGC · 0020_multiframe_pricing
--
-- The customer-facing half of Multiframe, deliberately split from 0019.
--
-- 0019 is additive and invisible: two new tables nobody can see. This file
-- changes what the live pricing page says, and the page renders plans.features
-- verbatim — so applying it announces Multiframe to every visitor the moment it
-- runs. That has to happen when the feature ships, not when its schema lands,
-- or the page sells something the deployed app does not have.
--
-- APPLY THIS AT LAUNCH, not with 0019.
--
-- The rule it exists to obey is 0017's: BLINK_MONTHLY_LIMIT and the plans row
-- are a limit and a promise about the same number, and they move together.
-- Multiframe does not change the number — it changes what can spend it. A scene
-- is a Veo clip drawn from the same 25, so a customer can now exhaust the
-- month's allowance without generating a single Blink AI video, and the old
-- wording would promise "25 Blink AI videos" to someone who spent all 25 on
-- reels. The allowance is therefore restated in the units it is counted in.
-- ============================================================================

update public.plans set
  blurb = 'Everything in Starter, plus 25 AI videos a month.',
  features = '[
    "Everything in Starter",
    "Blink AI — describe a shot, get the video",
    "Multiframe — one idea becomes a multi-scene reel",
    "25 AI videos a month, shared across both",
    "A reel spends one for each scene in it",
    "Generated audio on every clip",
    "Creator and product image conditioning",
    "1080p generations up to 8 seconds",
    "Generations archived to your library",
    "Priority rendering"
  ]'::jsonb
where tier = 'growth';
