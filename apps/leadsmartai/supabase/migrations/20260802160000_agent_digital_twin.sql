-- Agent digital twin — Phase A (brand profile from an uploaded intro video).
-- The agent uploads a short intro video of themselves; we transcribe it (fal
-- Wizper) and Claude distills a structured brand profile (bio / specialties /
-- market / tone / tagline) that personalizes their AI-generated marketing.
--
-- LIKENESS/VOICE CONSENT is required before any processing (dt_consent). These
-- fields live on `agents` alongside the existing branding columns.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS dt_intro_video_path text,
  ADD COLUMN IF NOT EXISTS dt_consent          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dt_consent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS dt_transcript       text,
  ADD COLUMN IF NOT EXISTS dt_brand_profile    jsonb,
  -- idle | processing | ready | failed
  ADD COLUMN IF NOT EXISTS dt_status           text,
  ADD COLUMN IF NOT EXISTS dt_error            text,
  ADD COLUMN IF NOT EXISTS dt_updated_at       timestamptz;

COMMENT ON COLUMN public.agents.dt_brand_profile IS 'jsonb {bio, specialties[], market, tone, tagline} distilled from the intro video';
COMMENT ON COLUMN public.agents.dt_consent IS 'agent consented to AI use of their likeness/voice';
