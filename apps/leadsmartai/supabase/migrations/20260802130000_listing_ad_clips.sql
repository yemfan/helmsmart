-- Cinematic clips for the listing → video ad (Phase 2). Each listing photo is
-- animated into a short cinematic motion clip via fal image-to-video; the public
-- clip URLs are stored here as the raw material the branded reel stitches
-- together. jsonb array, defaults to [] — empty until the agent generates them.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS ad_clip_urls        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ad_clips_updated_at timestamptz;

COMMENT ON COLUMN public.listings.ad_clip_urls IS 'jsonb array of cinematic clip URLs (fal image-to-video from the listing photos)';
