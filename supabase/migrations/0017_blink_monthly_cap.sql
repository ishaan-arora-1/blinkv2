-- ============================================================================
-- Blink UGC · 0017_blink_monthly_cap
--
-- Growth is sold with a number on it: 25 Blink AI videos a month.
--
-- Two things forced this. Blink AI moved from Wan 2.2 to Veo 3.1, which is what
-- it took to get audio — Wan renders silent clips, and a UGC ad with no voice
-- and no room tone is not something anyone can post. Veo generates the
-- soundtrack in the same pass, and costs several times more per second of
-- output while doing it.
--
-- Against a flat $25.99 plan, "unlimited" and "a model priced like this" cannot
-- both be true. One heavy account generating all day costs more than the plan
-- collects, and the way that shows up is a vendor bill nobody predicted. So the
-- allowance is stated rather than discovered: 25 a month, which is more than
-- any account has used in a month to date, and it resets on the 1st.
--
-- The cap is enforced in server/src/routes/veo.js, counted from
-- generation_events. This migration is the customer-facing half of it — the
-- pricing page renders plans.features verbatim, so a cap the server applies and
-- the page does not mention is a surprise, not a plan.
--
-- The number lives in two places by necessity (BLINK_MONTHLY_LIMIT and this
-- row) because one is a limit and the other is a promise. They have to be
-- changed together.
-- ============================================================================

update public.plans set
  blurb = 'Everything in Starter, plus 25 Blink AI videos a month.',
  features = '[
    "Everything in Starter",
    "Blink AI — describe a shot, get the video",
    "25 Blink AI videos a month",
    "Generated audio on every clip",
    "Creator and product image conditioning",
    "1080p generations up to 8 seconds",
    "Generations archived to your library",
    "Priority rendering"
  ]'::jsonb
where tier = 'growth';
