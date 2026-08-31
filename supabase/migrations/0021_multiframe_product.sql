-- ============================================================================
-- Blink UGC · 0021_multiframe_product
--
-- The product a reel is about.
--
-- Multiframe could already write a reel from a typed idea, which is fine for
-- "a morning routine" and useless for "an ad for my candle": the generator
-- invents a candle, and it is not the customer's candle. The shape, the colour
-- and the label all drift, and what comes back cannot be posted.
--
-- So the customer uploads the actual photograph, and it is held here for the
-- whole render. Stored rather than passed through memory for two reasons. The
-- image is handed to the image model once per scene — up to six times — and a
-- signed URL is a few hundred bytes where the base64 is several megabytes.
-- And a reel that failed at scene four can be looked at afterwards, which is
-- impossible if the only copy of its subject was a variable in a dead process.
--
-- It lives in the generations bucket beside the frames and clips it produced,
-- so deleting the reel's folder still takes everything with it.
-- ============================================================================

alter table public.multiframes
  add column if not exists product_path text;

comment on column public.multiframes.product_path is
  'Storage path of the customer-supplied product photo every frame is conditioned on. Null for reels written from the idea alone.';
