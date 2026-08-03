-- ============================================================================
-- reelmint · 0005_usd_plans
--
-- Aligns the plans table with what actually exists in Razorpay: two monthly
-- plans, Starter and Growth, priced in USD.
--
-- Three things change together, and they have to move together or the app
-- quotes one price and the gateway charges another:
--   · currency INR -> USD, with the amounts Razorpay will really bill
--   · plan and tier vocabulary -> starter / growth, matching what the customer
--     sees on their statement
--   · razorpay_plan_id populated, which is what unblocks checkout
--
-- The annual rows are removed. They were seeded ahead of the Razorpay plans
-- existing, and a plan the customer can select but cannot pay for is worse than
-- no plan at all. They come back when the matching Razorpay plans do.
-- ============================================================================

-- "paise" is rupee-specific and now wrong. This column has always meant "the
-- smallest unit of `currency`" — cents here, paise before.
alter table public.plans rename column price_paise to price_minor;

comment on column public.plans.price_minor is
  'Price in the smallest unit of `currency` (cents for USD, paise for INR). Must match the linked Razorpay plan exactly.';

-- ─── tier vocabulary ────────────────────────────────────────────────────────
-- tier is what gates features. Renaming it to match the customer-facing plan
-- names keeps one word for one concept end to end, instead of support having to
-- translate "Growth" into "studio" to read the database.

alter table public.plans drop constraint plans_tier_check;

update public.plans set tier = 'starter' where tier = 'creator';
update public.plans set tier = 'growth'  where tier = 'studio';

alter table public.plans
  add constraint plans_tier_check check (tier in ('starter', 'growth'));

-- entitled_tier() hands out the top tier during a trial; that name moved too.
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
    (
      select 'growth'
      from public.profiles pr
      where pr.id = p_user_id
        and pr.trial_ends_at > now()
    ),
    'none'
  );
$$;

-- ─── the plans themselves ───────────────────────────────────────────────────

delete from public.plans where period = 'yearly';

update public.plans set
  id               = 'starter',
  name             = 'Starter',
  blurb            = 'Carousels and creator-led hook videos, unlimited.',
  price_minor      = 799,          -- $7.99
  currency         = 'USD',
  razorpay_plan_id = 'plan_TLRjF7Yr9fkK1H',
  sort             = 1
where id = 'creator';

update public.plans set
  id               = 'growth',
  name             = 'Growth',
  blurb            = 'Everything in Starter, plus Blink AI video generation.',
  price_minor      = 2599,         -- $25.99
  currency         = 'USD',
  razorpay_plan_id = 'plan_TLRiBvalqxk8cO',
  sort             = 2
where id = 'studio';

update public.plans
set features = '[
  "Everything in Starter",
  "Blink AI — prompt-to-video with Google Veo",
  "Creator and product image conditioning",
  "1080p generations up to 8 seconds",
  "Generations archived to your library",
  "Priority rendering"
]'::jsonb
where id = 'growth';

-- A plan linked to the wrong Razorpay plan bills the wrong amount silently, so
-- make the link unique rather than trusting it to stay correct by hand.
create unique index if not exists plans_razorpay_plan_id_idx
  on public.plans (razorpay_plan_id)
  where razorpay_plan_id is not null;
