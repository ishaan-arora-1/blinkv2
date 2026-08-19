-- Close the hole 0016 left open: bulk inserts.
--
-- 0016 caps inserts with a BEFORE ... FOR EACH ROW trigger that counts the
-- user's recent rows and refuses once the count exceeds the cap. Against a
-- client inserting one row at a time that works. Against the client this was
-- written for it does nothing at all.
--
-- What the data actually showed, once it was looked at properly: 1,000 sampled
-- rows from one burst all carrying the *identical* created_at of
-- 2026-08-19T14:40:11.482259Z. Not a fast loop — a single INSERT statement with
-- tens of thousands of rows in its body, which is something PostgREST is happy
-- to accept as a JSON array. Bursts landed roughly hourly, ~60,000 rows each,
-- and the account refreshed its access token about two minutes before each one.
--
-- A per-row BEFORE trigger cannot see this. Rows inserted earlier by the same
-- statement carry that statement's command id, so a SELECT inside the trigger —
-- which runs under the same command — does not see them. Every row of a 60,000
-- row INSERT therefore observes the same pre-statement count, and all 60,000
-- pass a cap of 60. The guard only ever engages on the *next* statement.
--
-- So the real ceiling 0016 bought was "cap rows per hour, plus one unbounded
-- statement", and one statement is enough to insert millions.
--
-- The fix is a statement-level AFTER trigger. By the time it runs the rows are
-- in the table and visible, so the count is the true one. A transition table
-- gives it the set of users the statement touched without scanning anything.
--
-- 0016's row-level trigger is deliberately left in place. It still stamps
-- created_at (the window is measured in that column, and a client-supplied
-- value would otherwise sidestep the whole thing), and it still rejects a
-- row-at-a-time flood early, before any rows are written. This is the backstop
-- for the case it cannot see.

create or replace function public.enforce_insert_rate_cap_stmt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cap int := tg_argv[0]::int;
  r   record;
  n   int;
begin
  -- Only the users this statement actually inserted for. A bulk insert is
  -- almost always one user, so this loop runs once.
  for r in select distinct user_id from new_rows loop
    -- Same LIMIT discipline as 0016: bounded by the cap, not by how many rows
    -- the account owns. This one has 27.8 million.
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
    using r.user_id;

    if n > cap then
      -- Raising here aborts the statement, so every row it inserted is rolled
      -- back — including the ones already written. That is the point: the
      -- alternative is letting the whole batch stand because the first row
      -- looked fine.
      raise exception
        using errcode = 'check_violation',
              message = format(
                'Rate limit: no more than %s new %s per hour. Try again shortly.',
                cap, tg_table_name
              );
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.enforce_insert_rate_cap_stmt() is
  'AFTER INSERT ... FOR EACH STATEMENT guard. Catches bulk inserts, which the per-row cap in 0016 cannot see.';

revoke all on function public.enforce_insert_rate_cap_stmt() from public;

-- Same caps as 0016, applied a second way. REFERENCING NEW TABLE is what makes
-- the inserted set available without touching the base table.

drop trigger if exists brands_insert_rate_cap_stmt on public.brands;
create trigger brands_insert_rate_cap_stmt
  after insert on public.brands
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(60);

drop trigger if exists image_sets_insert_rate_cap_stmt on public.image_sets;
create trigger image_sets_insert_rate_cap_stmt
  after insert on public.image_sets
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(120);

drop trigger if exists carousels_insert_rate_cap_stmt on public.carousels;
create trigger carousels_insert_rate_cap_stmt
  after insert on public.carousels
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(120);

drop trigger if exists videos_insert_rate_cap_stmt on public.videos;
create trigger videos_insert_rate_cap_stmt
  after insert on public.videos
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(120);

drop trigger if exists blinks_insert_rate_cap_stmt on public.blinks;
create trigger blinks_insert_rate_cap_stmt
  after insert on public.blinks
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(120);

drop trigger if exists set_images_insert_rate_cap_stmt on public.set_images;
create trigger set_images_insert_rate_cap_stmt
  after insert on public.set_images
  referencing new table as new_rows
  for each statement execute function public.enforce_insert_rate_cap_stmt(600);
