-- ============================================================================
-- Blink UGC · 0025_razorpay_plan_ids
--
-- Connect the six plans from 0024 to Razorpay.
--
-- HOW TO USE THIS FILE
--
--   1. Create the six plans in the Razorpay dashboard first. The plan there is
--      the authority on what a customer is actually charged; this table only
--      decides what the page advertises, and 0005 is the migration that exists
--      because those two once disagreed.
--   2. Paste each plan id below, replacing the plan_XXXX placeholders.
--   3. Delete the lines for any plan you have not created yet — a NULL leaves
--      checkout answering with a clear message naming the empty column, which
--      is a far better failure than a half-set id.
--   4. supabase db push
--
-- Create them TWICE: once with your live keys and once in test mode. Razorpay
-- issues different ids per mode, and planMode.js picks the column matching the
-- key the API is running on. Without the test ids, a local checkout resolves to
-- the LIVE plan and takes real money.
--
-- Each plan must match what is already in this table:
--
--   creator         monthly   USD    19       creator_annual   yearly   USD   190
--   studio          monthly   USD    49       studio_annual    yearly   USD   490
--   agency          monthly   USD   129       agency_annual    yearly   USD  1290
--
-- In Razorpay a yearly plan is period "yearly" with interval 1 — not period
-- "monthly" with interval 12. The two bill differently.
-- ============================================================================

-- ── live mode ───────────────────────────────────────────────────────────────
update public.plans set razorpay_plan_id = 'plan_XXXX_creator_monthly' where id = 'creator';
update public.plans set razorpay_plan_id = 'plan_XXXX_studio_monthly'  where id = 'studio';
update public.plans set razorpay_plan_id = 'plan_XXXX_agency_monthly'  where id = 'agency';
update public.plans set razorpay_plan_id = 'plan_XXXX_creator_yearly'  where id = 'creator_annual';
update public.plans set razorpay_plan_id = 'plan_XXXX_studio_yearly'   where id = 'studio_annual';
update public.plans set razorpay_plan_id = 'plan_XXXX_agency_yearly'   where id = 'agency_annual';

-- ── test mode ───────────────────────────────────────────────────────────────
update public.plans set razorpay_plan_id_test = 'plan_TEST_creator_monthly', price_minor_test =   1900 where id = 'creator';
update public.plans set razorpay_plan_id_test = 'plan_TEST_studio_monthly',  price_minor_test =   4900 where id = 'studio';
update public.plans set razorpay_plan_id_test = 'plan_TEST_agency_monthly',  price_minor_test =  12900 where id = 'agency';
update public.plans set razorpay_plan_id_test = 'plan_TEST_creator_yearly',  price_minor_test =  19000 where id = 'creator_annual';
update public.plans set razorpay_plan_id_test = 'plan_TEST_studio_yearly',   price_minor_test =  49000 where id = 'studio_annual';
update public.plans set razorpay_plan_id_test = 'plan_TEST_agency_yearly',   price_minor_test = 129000 where id = 'agency_annual';
