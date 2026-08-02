-- Listing ad facts + photos: the source material for the listing → video ad
-- feature. The listings table today stores only address/price/dates/status,
-- with no photos or property specs to build an ad from. These columns hold the
-- facts pulled from the listing's MLS URL (AI web-fetch) or filled in manually.
--
-- All nullable — intake is best-effort (portals block scraping) and the agent
-- fills gaps. jsonb arrays for highlights + photo_urls keep it schema-light.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS beds                 smallint,
  ADD COLUMN IF NOT EXISTS baths                numeric(4,1),
  ADD COLUMN IF NOT EXISTS sqft                 integer,
  ADD COLUMN IF NOT EXISTS year_built           smallint,
  ADD COLUMN IF NOT EXISTS property_description  text,
  ADD COLUMN IF NOT EXISTS highlights           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_urls           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Provenance of the facts above: 'mls_url' (AI-pulled) or 'manual' (agent).
  ADD COLUMN IF NOT EXISTS ad_facts_source      text,
  -- 0-1 confidence the AI reported when pulling from the MLS URL.
  ADD COLUMN IF NOT EXISTS ad_facts_confidence  numeric,
  ADD COLUMN IF NOT EXISTS ad_facts_updated_at  timestamptz;

COMMENT ON COLUMN public.listings.highlights IS 'jsonb array of short selling-point strings for the ad';
COMMENT ON COLUMN public.listings.photo_urls IS 'jsonb array of listing photo URLs (from MLS pull or upload)';
COMMENT ON COLUMN public.listings.ad_facts_source IS 'mls_url | manual — provenance of the ad facts';
