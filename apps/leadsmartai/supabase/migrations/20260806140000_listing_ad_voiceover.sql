-- Listing → video ad: AI script + voiceover (Phase 2d)
--
-- Adds the narration script, the per-clip length used (so the voiceover mux
-- knows the video's duration), and the finished voiced-video URL. All columns
-- are nullable and back-compatible: existing ads keep working with no voiceover.
alter table public.listings
  add column if not exists ad_clip_seconds integer,
  add column if not exists ad_reel_script text,
  add column if not exists ad_reel_voiced_url text;

comment on column public.listings.ad_clip_seconds is
  'Seconds per cinematic clip used for the current ad (5 or 10); drives voiceover compose duration. Null = legacy 5.';
comment on column public.listings.ad_reel_script is
  'AI-written, agent-editable narration script for the video ad voiceover.';
comment on column public.listings.ad_reel_voiced_url is
  'Finished video ad with voiceover muxed on (fal compose); preferred over ad_reel_url when present.';
