-- ============================================================================
-- Blink UGC · 0014_allow_paused_subscriptions
--
-- A paused subscription keeps full paid access, and the webhook telling us it
-- was paused retries forever.
--
-- The status column's CHECK lists every Razorpay subscription status except
-- 'paused'. The webhook handler has a case for subscription.paused and writes
-- the status straight through, so the upsert violates the constraint, the
-- handler throws, and the route answers 500. Three things follow from that one
-- missing word:
--
--   · the mirror row keeps whatever status it had, which is 'active', so
--     entitled_tier() goes on granting the paid tier to a subscription that is
--     not collecting money
--   · 500 means "retry" to Razorpay, correctly and deliberately, so the same
--     delivery comes back on a schedule and fails identically, forever
--   · webhook_events accumulates a row with a populated `error` and a null
--     processed_at for each attempt
--
-- 'paused' is deliberately not added to entitled_tier()'s granting list — the
-- whole point is that a paused subscription should not entitle anyone. It only
-- has to be storable. Once the row can say 'paused', the existing rule that
-- grants on ('active','authenticated','pending') excludes it by construction.
--
-- Found by replaying Razorpay's real event sequence against the webhook
-- endpoint and asserting entitlement after each delivery; see
-- server/scripts/verify-access-grant.mjs.

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('created', 'authenticated', 'active', 'pending',
                    'halted', 'cancelled', 'completed', 'expired', 'paused'));

comment on column public.subscriptions.status is
  'Razorpay''s own subscription status, mirrored verbatim. entitled_tier() grants on active/authenticated/pending only; every other value is storable but entitles nothing.';
