-- ============================================================================
-- Blink UGC · 0025_razorpay_test_plans
--
-- The test-mode half of the wiring for 0024's six plans.
--
-- Razorpay issues a different id per mode, which is why plans carries two
-- columns for it. planMode.js picks the one matching the key the API is booted
-- with: a test key reaches for razorpay_plan_id_test and falls back to the live
-- id when it is empty — which is the failure this file exists to prevent,
-- because that fallback means a local checkout resolving to the live plan and
-- taking real money.
--
-- These ids were read back from Razorpay's own API rather than typed from the
-- dashboard. In this font plan_TWSl5GJw10KV3Y contains a lowercase L, a one and
-- a zero within four characters of each other, and a plan id that is wrong by
-- one character fails at checkout rather than at deploy.
--
-- Verified against GET /v1/plans: names, USD amounts, and period/interval of
-- monthly/1 and yearly/1 — not monthly/12, which bills differently.
--
-- The LIVE ids are still null. Production runs on a live key, so its checkout
-- stays deliberately closed until those plans exist and 0026 fills them in.
-- ============================================================================

update public.plans set razorpay_plan_id_test = 'plan_TWSjT3LZWeQpl4', price_minor_test =   1900 where id = 'creator';
update public.plans set razorpay_plan_id_test = 'plan_TWSjqWAZTdOfPq', price_minor_test =   4900 where id = 'studio';
update public.plans set razorpay_plan_id_test = 'plan_TWSk8JMn5x1hQI', price_minor_test =  12900 where id = 'agency';
update public.plans set razorpay_plan_id_test = 'plan_TWSl5GJw10KV3Y', price_minor_test =  19000 where id = 'creator_annual';
update public.plans set razorpay_plan_id_test = 'plan_TWSlSP2Rgdv2IA', price_minor_test =  49000 where id = 'studio_annual';
update public.plans set razorpay_plan_id_test = 'plan_TWSlkapu2UQr8Q', price_minor_test = 129000 where id = 'agency_annual';
