-- ============================================================================
-- Blink UGC · 0033_blurbs_drop_carousels
--
-- 0031 and 0032 renamed the feature lines but left the blurbs, so Creator's
-- card still opened with "carousels, hook videos and animated stories" above a
-- list that no longer uses the word. The blurb is the first line read on the
-- card, so it was the one place the old vocabulary still set the expectation.
-- ============================================================================

update public.plans
   set blurb = 'Post every day without a camera — Instagram posts, hook videos and AI-illustrated stories.'
 where tier = 'creator' and period = 'monthly';

update public.plans
   set blurb = 'Post every day without a camera — two months free on annual.'
 where tier = 'creator' and period = 'yearly';

do $$
declare n integer;
begin
  select count(*) into n from public.plans
   where active and (blurb ilike '%carousel%' or blurb ilike '%slide%');
  if n > 0 then
    raise exception 'plan blurb still sells carousels on % row(s)', n;
  end if;
end $$;
