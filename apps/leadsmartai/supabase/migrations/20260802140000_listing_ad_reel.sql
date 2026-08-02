-- The finished branded video ad (Phase 2b): the cinematic clips are merged into
-- one tour (fal ffmpeg) and wrapped by the deployed Remotion BrandedClip
-- composition into a captioned, branded 9:16 reel. This holds the render state +
-- the final MP4 URL so the panel can build, poll, preview, and publish it.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS ad_reel_url           text,
  ADD COLUMN IF NOT EXISTS ad_reel_caption       text,
  ADD COLUMN IF NOT EXISTS ad_reel_render_id     text,
  ADD COLUMN IF NOT EXISTS ad_reel_render_bucket text,
  -- idle | rendering | ready | failed
  ADD COLUMN IF NOT EXISTS ad_reel_status        text,
  ADD COLUMN IF NOT EXISTS ad_reel_error         text,
  ADD COLUMN IF NOT EXISTS ad_reel_updated_at    timestamptz;

COMMENT ON COLUMN public.listings.ad_reel_url IS 'final branded video-ad MP4 (public)';
COMMENT ON COLUMN public.listings.ad_reel_status IS 'idle | rendering | ready | failed';
