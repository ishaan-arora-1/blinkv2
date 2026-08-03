-- ============================================================================
-- Blink UGC · 0006_razorpay_plan_ids
--
-- 0005 moved the plans to USD but guessed at the razorpay_plan_id values, and
-- the ids it wrote do not exist in the Razorpay account. Checkout could not
-- have worked: subscriptions.create rejects an unknown plan outright, so every
-- customer would have hit "The ID provided is invalid" at the payment step.
--
-- These ids are read back from the live Razorpay API, and the amounts are the
-- ones Razorpay will actually bill:
--
--   plan_TLSIYYtddfVmJn  Starter  799 USD/month
--   plan_TLSIsgta2iRj6K  Growth  1499 USD/month
--
-- Razorpay is the source of truth for price. When a plan's amount changes there
-- it changes here in the same breath, because the gateway charges its own
-- number regardless of what the pricing page says.
-- ============================================================================

-- ─── the plan links and amounts ─────────────────────────────────────────────

update public.plans set
  razorpay_plan_id = 'plan_TLSIYYtddfVmJn',
  price_minor      = 799,
  currency         = 'USD'
where id = 'starter';

-- Growth was seeded at 2599. The Razorpay plan is 1499, and the gateway wins.
update public.plans set
  razorpay_plan_id = 'plan_TLSIsgta2iRj6K',
  price_minor      = 1499,
  currency         = 'USD'
where id = 'growth';

-- ─── stop INR being the assumed default ─────────────────────────────────────
-- Both currency columns still defaulted to 'INR' from 0002. Any row inserted
-- without an explicit currency — a webhook payload missing the field, a plan
-- added by hand — would be silently labelled rupees and rendered with a ₹ in
-- front of a dollar amount.

alter table public.plans    alter column currency set default 'USD';
alter table public.payments alter column currency set default 'USD';

-- ─── amount_paise -> amount_minor ───────────────────────────────────────────
-- 0005 renamed plans.price_paise for this exact reason but left the payments
-- table behind, so the two halves of billing disagreed about what a unit was.
-- "paise" names a currency this project no longer charges in.

alter table public.payments rename column amount_paise to amount_minor;

comment on column public.payments.amount_minor is
  'Amount in the smallest unit of `currency` (cents for USD, paise for INR), exactly as Razorpay reported it.';
