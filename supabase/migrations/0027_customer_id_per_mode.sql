-- ============================================================================
-- Blink UGC · 0027_customer_id_per_mode
--
-- A Razorpay customer belongs to one mode, like a plan does.
--
-- profiles.razorpay_customer_id held whichever id was made first, with nothing
-- recording which mode made it. Switching the API's keys to test then handed
-- Razorpay a live customer id and checkout failed with "The id provided does
-- not exist" — a true statement about a customer that exists only in the other
-- mode, and an opaque one to read at a payment screen.
--
-- Plans already solve this with a column per mode, so customers do the same.
-- The existing column keeps the live ids; test ids go beside them. Switching
-- modes now costs nothing in either direction, which matters because that is
-- exactly what testing a checkout requires.
-- ============================================================================

alter table public.profiles
  add column if not exists razorpay_customer_id_test text;

comment on column public.profiles.razorpay_customer_id is
  'Razorpay customer id in LIVE mode. See razorpay_customer_id_test for the other one — an id from the wrong mode fails as "The id provided does not exist".';
