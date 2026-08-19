-- Per-user insert rate caps on everything the browser writes directly.
--
-- On 2026-08-18 one account inserted 22.6 million rows into `brands` — bursts
-- of ~13 inserts/second from a `python-requests` script talking straight to
-- PostgREST. The table reached the point where an ORDER BY on it could not
-- finish inside the statement timeout, and Postgres was checkpointing ~965 MB
-- of WAL at a time.
--
-- Nothing was broken, which is the uncomfortable part. RLS did exactly what it
-- says:
--
--   create policy "brands: owner writes" on public.brands
--     for insert with check (auth.uid() = user_id);
--
-- "You may write your own rows" was never meant to imply "as many as you like,
-- as fast as you like", but that is what it grants. The API's rate limiters in
-- server/src/index.js cannot help here: they guard `/api/*` on Railway, and the
-- SPA reaches these tables through supabase-js directly. On that path RLS is
-- the only thing in the way.
--
-- Until 0011 `brands.user_id` was the primary key, so the schema itself allowed
-- exactly one brand per user. Dropping it to support multiple brands was right
-- for the feature and quietly removed the only ceiling that existed. This puts
-- a ceiling back — on every such table, not just the one that got hit.
--
-- A *rate* cap rather than a total one, deliberately. A total cap punishes the
-- best customers eventually: the person who has been generating carousels
-- happily for a year hits a wall for no reason they can see. What separates a
-- runaway script from a person is not how much they have made, it is how fast —
-- 13 inserts a second against a handful an hour. Capping the rate stops the
-- former and is unreachable by the latter.

-- ============================================================================
-- The check
-- ============================================================================

create or replace function public.enforce_insert_rate_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cap int := tg_argv[0]::int;
  n   int;
begin
  -- The window below is measured in created_at, and until this line created_at
  -- was whatever the client sent — PostgREST is happy to accept one. A caller
  -- who wanted around the cap could simply backdate every row and never appear
  -- in the last hour at all. Stamping it here makes the column mean what it has
  -- always claimed to mean (`default now()`), and makes it something the client
  -- cannot use against us. No caller in this repo sets it explicitly.
  new.created_at := now();

  -- Counted through a LIMIT so the work is bounded by the cap, not by how many
  -- rows the user owns. The account that prompted this has 22M brands; without
  -- the LIMIT this trigger would itself be the outage. Every table below has an
  -- index on (user_id, created_at), which is exactly what this predicate wants.
  execute format(
    'select count(*) from ('
      'select 1 from public.%I '
      'where user_id = $1 and created_at > now() - interval ''1 hour'' '
      'limit %s'
    ') t',
    tg_table_name,
    cap + 1
  )
  into n
  using new.user_id;

  if n > cap then
    -- check_violation surfaces through PostgREST as a 400 with this message
    -- intact, so a legitimate user who somehow trips it is told what happened
    -- rather than seeing a bare failure.
    raise exception
      using errcode = 'check_violation',
            message = format(
              'Rate limit: no more than %s new %s per hour. Try again shortly.',
              cap, tg_table_name
            );
  end if;

  return new;
end;
$$;

comment on function public.enforce_insert_rate_cap() is
  'BEFORE INSERT guard: caps rows one user may insert into the triggering table per hour. Cap is passed as the trigger argument.';

-- security definer means this runs as the owner, so revoke the default grant
-- that would let any authenticated role call it directly.
revoke all on function public.enforce_insert_rate_cap() from public;

-- ============================================================================
-- Applied to every table an authenticated client may insert into
-- ============================================================================
--
-- The numbers are set roughly two orders of magnitude above real use. Nine
-- production accounts have one or two brands each; the runaway script was doing
-- 45,000 an hour. Anything in between is a script too, and the honest ones will
-- read the message and slow down.

drop trigger if exists brands_insert_rate_cap on public.brands;
create trigger brands_insert_rate_cap
  before insert on public.brands
  for each row execute function public.enforce_insert_rate_cap(60);

drop trigger if exists image_sets_insert_rate_cap on public.image_sets;
create trigger image_sets_insert_rate_cap
  before insert on public.image_sets
  for each row execute function public.enforce_insert_rate_cap(120);

drop trigger if exists carousels_insert_rate_cap on public.carousels;
create trigger carousels_insert_rate_cap
  before insert on public.carousels
  for each row execute function public.enforce_insert_rate_cap(120);

drop trigger if exists videos_insert_rate_cap on public.videos;
create trigger videos_insert_rate_cap
  before insert on public.videos
  for each row execute function public.enforce_insert_rate_cap(120);

drop trigger if exists blinks_insert_rate_cap on public.blinks;
create trigger blinks_insert_rate_cap
  before insert on public.blinks
  for each row execute function public.enforce_insert_rate_cap(120);

-- set_images is the one table whose index does not already fit the predicate:
-- it is keyed (set_id, position) because it is always read a set at a time.
-- The cap needs (user_id, created_at), so add it.
create index if not exists set_images_user_idx
  on public.set_images (user_id, created_at);

-- Higher than the rest on purpose: these arrive a whole set at a time, so one
-- ordinary upload is legitimately a burst of rows.
drop trigger if exists set_images_insert_rate_cap on public.set_images;
create trigger set_images_insert_rate_cap
  before insert on public.set_images
  for each row execute function public.enforce_insert_rate_cap(600);

-- generation_events is deliberately left alone. Only the service role writes it
-- — there is no client insert policy — and it is the audit trail that would be
-- wanted while investigating exactly this kind of incident. A cap on it could
-- only ever lose evidence.
