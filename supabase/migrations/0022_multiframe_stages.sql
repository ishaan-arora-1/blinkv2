-- ============================================================================
-- Blink UGC · 0022_multiframe_stages
--
-- Multiframe becomes a thing you drive rather than a thing you start.
--
-- It used to run the whole way through on one click: plan, draw every frame,
-- and immediately hand all of them to Veo. That spends the expensive half of
-- the reel — one clip per scene, out of a monthly allowance of 25 — before
-- anyone has seen whether the cheap half is any good. The frames arrive about a
-- minute before the first clip, and they are exactly the evidence needed to
-- decide whether the reel is worth filming, so the pipeline now stops there and
-- waits to be told.
--
-- 'frames_ready' is that resting state: planned, drawn, nothing spent on video,
-- and no vendor work in flight. It is not an in-flight status — a reel sitting
-- in it costs nothing and must not block the account from starting another.
-- ============================================================================

alter table public.multiframes
  drop constraint if exists multiframes_status_check;

alter table public.multiframes
  add constraint multiframes_status_check
  check (status in ('pending', 'scripting', 'frames_ready', 'rendering', 'ready', 'failed'));

comment on column public.multiframes.status is
  'pending/scripting -> frames_ready (frames drawn, waiting for the go-ahead) -> rendering -> ready. frames_ready is idle: nothing is running and nothing more has been charged.';

-- How many times each frame has been redrawn.
--
-- Kept on the row rather than counted from events because it is read on every
-- poll to render the UI, and because it is the number the per-reel redraw cap
-- is enforced against. Frames are cheap next to clips, but they are not free,
-- and an unbounded redraw button is an unbounded vendor bill.
alter table public.multiframe_scenes
  add column if not exists frame_revisions integer not null default 0;
