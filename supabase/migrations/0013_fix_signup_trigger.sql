-- ============================================================================
-- Blink UGC · 0013_fix_signup_trigger
--
-- Signing up has been failing since 0011. Every new account, every time.
--
-- handle_new_user() creates the account's first brand with:
--
--     insert into public.brands (user_id) values (new.id)
--     on conflict (user_id) do nothing;
--
-- ON CONFLICT needs a unique constraint to arbitrate on, and until 0011 there
-- was one — user_id was the primary key. 0011 moved the key to `id` so an
-- account could hold several brands, which is exactly right, and left this
-- clause pointing at a constraint that no longer exists. Postgres raises
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"), the trigger aborts, and because it runs inside GoTrue's own
-- transaction the whole signup fails with a 500.
--
-- Nothing caught it. The failure is invisible to every existing account — they
-- were created before 0011 and never run this again — so the app looks
-- completely healthy to anyone already signed in, including everyone testing
-- it. It only breaks for people who have never used the product, which is the
-- one group nobody is watching.
--
-- Found while verifying the free tier, whose entire premise is that a stranger
-- can sign up and immediately make something.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;

  -- NOT ON CONFLICT. There is deliberately no unique constraint on user_id any
  -- more — that is the whole point of 0011 — so idempotency has to be spelled
  -- out rather than delegated to an index. The guard is what keeps this safe if
  -- the trigger ever fires twice for one account; without it a retry would
  -- silently hand someone a second, empty brand.
  insert into public.brands (user_id)
  select new.id
  where not exists (select 1 from public.brands where user_id = new.id);

  return new;
end;
$$;
