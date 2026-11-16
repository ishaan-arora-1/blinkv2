-- ============================================================================
-- Blink UGC · 0034_gumroad
--
-- Payments move from Razorpay to Gumroad. The subscriptions table and both
-- tier functions are provider-agnostic already — they join a subscription to a
-- plan and read plans.tier — so this adds the Gumroad identifiers alongside the
-- Razorpay ones rather than replacing them. Existing Razorpay subscribers keep
-- their tier through the switch; nothing about entitled_tier() changes.
--
-- gumroad_permalink is the short code in the product URL
-- (ishaana.gumroad.com/l/<permalink>). It is what the Ping payload sends back
-- as product_permalink, and the only thing that identifies which plan was
-- bought, so it is unique and indexed.
-- ============================================================================

alter table public.plans      add column if not exists gumroad_permalink text;
alter table public.subscriptions add column if not exists gumroad_subscription_id text;
alter table public.subscriptions add column if not exists gumroad_sale_id text;

create unique index if not exists plans_gumroad_permalink_key
  on public.plans (gumroad_permalink) where gumroad_permalink is not null;

create unique index if not exists subscriptions_gumroad_subscription_id_key
  on public.subscriptions (gumroad_subscription_id) where gumroad_subscription_id is not null;

-- The three memberships created on 2026-11-17. Monthly only: Gumroad bills a
-- membership on its own recurrence, so an annual tier is a separate product
-- rather than a period column, and none exists yet.
update public.plans set gumroad_permalink = 'qtoezc'  where id = 'creator';
update public.plans set gumroad_permalink = 'jpmvgm'  where id = 'studio';
update public.plans set gumroad_permalink = 'bdzmsgg' where id = 'agency';

-- Razorpay's subscription id was NOT NULL, which it cannot be once a row can
-- arrive from the other provider.
alter table public.subscriptions alter column razorpay_subscription_id drop not null;

do $$
declare n integer;
begin
  select count(*) into n from public.plans
   where active and period = 'monthly' and gumroad_permalink is null;
  if n > 0 then
    raise exception '% active monthly plan(s) have no Gumroad product', n;
  end if;
end $$;
