-- ============================================================================
-- Blink UGC · 0007_live_and_test_plans
--
-- Two corrections and one structural fix.
--
-- 1. THE PLAN IDS WERE CROSSED. 0005 wrote Razorpay's live plan ids into the
--    wrong rows:
--
--      starter -> plan_TLRjF7Yr9fkK1H   which is really Growth,  $25.99
--      growth  -> plan_TLRiBvalqxk8cO   which is really Starter, $7.99
--
--    Nothing would have looked broken. Checkout succeeds, the webhook arrives,
--    and the mirror row says 'starter' because that is the row the id sits in.
--    The only thing that disagrees is the customer's card, which gets charged
--    $25.99 for the plan the pricing page quoted at $7.99. 0006 replaced these
--    ids with test-mode ones and so hid the crossing rather than fixing it.
--
-- 2. TEST AND LIVE ARE DIFFERENT PLANS, AT DIFFERENT PRICES. Razorpay keeps the
--    two modes fully separate, and here they have diverged on amount too:
--
--                 test                          live
--      Starter    plan_TLSIYYtddfVmJn  $7.99     plan_TLRiBvalqxk8cO  $7.99
--      Growth     plan_TLSIsgta2iRj6K  $14.99    plan_TLRjF7Yr9fkK1H  $25.99
--
--    One razorpay_plan_id column cannot hold both. Whichever mode lost the
--    column got "The ID provided is invalid or could not be found" at the
--    payment step — a live key cannot see a test plan, or the reverse.
--
--    So the live values stay in the canonical columns and the test values get
--    their own, and the server picks the pair that matches the key it is holding.
--    Production reads the columns it always read; local development stops being
--    a minefield.
--
-- price is duplicated for the same reason as the id. It is what the pricing page
-- quotes, and quoting the live price while a test key charges a different one is
-- how you ship a discrepancy you cannot reproduce locally.
-- ============================================================================

alter table public.plans
  add column if not exists razorpay_plan_id_test text,
  add column if not exists price_minor_test      integer;

comment on column public.plans.razorpay_plan_id_test is
  'Razorpay plan id in TEST mode. razorpay_plan_id holds the LIVE one. The server picks by key prefix; see server/src/planMode.js.';
comment on column public.plans.price_minor_test is
  'Price in test mode, smallest unit of `currency`. Null means test matches live.';

-- ─── live: the canonical columns, with the crossing undone ──────────────────

update public.plans set
  razorpay_plan_id = 'plan_TLRiBvalqxk8cO',   -- Starter, live
  price_minor      = 799,
  currency         = 'USD'
where id = 'starter';

update public.plans set
  razorpay_plan_id = 'plan_TLRjF7Yr9fkK1H',   -- Growth, live
  price_minor      = 2599,
  currency         = 'USD'
where id = 'growth';

-- ─── test overrides ─────────────────────────────────────────────────────────

update public.plans set
  razorpay_plan_id_test = 'plan_TLSIYYtddfVmJn',
  price_minor_test      = 799
where id = 'starter';

update public.plans set
  razorpay_plan_id_test = 'plan_TLSIsgta2iRj6K',
  price_minor_test      = 1499
where id = 'growth';

-- Same protection the live column already has from 0006: two rows pointing at
-- one Razorpay plan is the crossing above waiting to happen again.
create unique index if not exists plans_razorpay_plan_id_test_idx
  on public.plans (razorpay_plan_id_test)
  where razorpay_plan_id_test is not null;

-- A row must never claim the same Razorpay plan is both its live and its test
-- plan. That can only be a copy-paste, and it would route real money through a
-- path someone believed was a sandbox.
alter table public.plans
  drop constraint if exists plans_live_test_plan_distinct;
alter table public.plans
  add constraint plans_live_test_plan_distinct
  check (razorpay_plan_id_test is null or razorpay_plan_id_test <> razorpay_plan_id);
