-- ============================================================================
-- reelmint · 0002_billing
-- Razorpay subscription plans, subscription state, payment audit trail and
-- webhook idempotency.
--
-- Razorpay is the source of truth for money; this schema is a local mirror kept
-- in step by the webhook handler. Nothing here is written by the browser — all
-- billing tables are read-only to authenticated users and written only by the
-- API server's service-role client.
-- ============================================================================

-- ─── plans ──────────────────────────────────────────────────────────────────
-- Seeded below with the two tiers. Prices live here rather than in code so they
-- can change without a deploy; razorpay_plan_id is filled in after you create
-- the matching Plans in the Razorpay dashboard (see DEPLOY.md).
--
-- tier is the thing that gates features. Higher rank wins.

create table public.plans (
  id               text primary key,
  name             text not null,
  blurb            text not null default '',
  tier             text not null check (tier in ('creator','studio')),
  rank             integer not null,
  razorpay_plan_id text,
  price_paise      integer not null,
  currency         text not null default 'INR',
  period           text not null default 'monthly',
  interval         integer not null default 1,
  features         jsonb not null default '[]'::jsonb,
  active           boolean not null default true,
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

insert into public.plans (id, name, blurb, tier, rank, price_paise, features, sort) values
  (
    'creator',
    'Creator',
    'Carousels and creator-led hook videos, unlimited.',
    'creator',
    1,
    99900,
    '[
      "Unlimited photo carousels",
      "Unlimited hook videos with the full creator roster",
      "Your own custom image sets",
      "1080 × 1350 PNG and ZIP export",
      "Video export with synthesized soundtracks",
      "Cloud sync across devices"
    ]'::jsonb,
    1
  ),
  (
    'studio',
    'Studio',
    'Everything in Creator, plus Blink AI video generation.',
    'studio',
    2,
    249900,
    '[
      "Everything in Creator",
      "Blink AI — prompt-to-video with Google Veo",
      "Creator and product image conditioning",
      "1080p generations up to 8 seconds",
      "Generations archived to your library",
      "Priority rendering"
    ]'::jsonb,
    2
  );

-- ─── subscriptions ──────────────────────────────────────────────────────────
-- Mirrors a Razorpay subscription. status uses Razorpay's own vocabulary so the
-- webhook handler can write it through without translation.

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  plan_id                  text not null references public.plans(id),
  razorpay_subscription_id text not null unique,
  razorpay_customer_id     text,
  status                   text not null default 'created'
                             check (status in ('created','authenticated','active','pending',
                                               'halted','cancelled','completed','expired')),
  current_start            timestamptz,
  current_end              timestamptz,
  charge_at                timestamptz,
  ended_at                 timestamptz,
  cancel_at_cycle_end      boolean not null default false,
  short_url                text,
  notes                    jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index subscriptions_status_idx on public.subscriptions (user_id, status);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ─── payments ───────────────────────────────────────────────────────────────
-- Audit trail. raw keeps the full Razorpay payload so a support question can be
-- answered without calling their API.

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.profiles(id) on delete set null,
  subscription_id      uuid references public.subscriptions(id) on delete set null,
  razorpay_payment_id  text not null unique,
  razorpay_invoice_id  text,
  amount_paise         integer not null default 0,
  currency             text not null default 'INR',
  status               text,
  method               text,
  raw                  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id, created_at desc);

-- ─── webhook idempotency ────────────────────────────────────────────────────
-- Razorpay retries webhooks. The primary key is Razorpay's x-razorpay-event-id,
-- so a replayed delivery collides and is skipped.

create table public.webhook_events (
  id           text primary key,
  event        text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create index webhook_events_event_idx on public.webhook_events (event, received_at desc);

-- ============================================================================
-- Entitlement
-- ============================================================================

-- Resolves what a user is allowed to do right now, in one place, so the API
-- server and any future SQL-side policy agree by construction.
--
--   · an active/authenticated/pending subscription grants its plan's tier
--   · otherwise a trial that has not yet expired grants the top tier
--   · otherwise nothing
--
-- 'pending' is granted deliberately: Razorpay puts a subscription there while it
-- retries a failed charge, and locking the user out mid-retry is the wrong call.
-- 'halted' means the retries are exhausted, and is not granted.

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
      select 'studio'
      from public.profiles pr
      where pr.id = p_user_id
        and pr.trial_ends_at > now()
    ),
    'none'
  );
$$;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.plans          enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.payments       enable row level security;
alter table public.webhook_events enable row level security;

-- The pricing page needs plans before the user has signed in.
create policy "plans: public read" on public.plans
  for select using (active);

-- Billing state is readable by its owner and writable only by the service role,
-- which bypasses RLS. No insert/update/delete policies here on purpose.
create policy "subscriptions: owner reads" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "payments: owner reads" on public.payments
  for select using (auth.uid() = user_id);

-- webhook_events gets no policy at all: service role only.
