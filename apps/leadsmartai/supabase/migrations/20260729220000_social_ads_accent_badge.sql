-- The spotlight/feature ad templates use two extra text fields that weren't in
-- social_ads: `headline_accent` (the gold second headline line) and `badge`
-- (spotlight's tag chip). Without these columns the render-by-id route drops
-- them, so scheduled/auto-rotated ads render an incomplete hero. Additive.

alter table public.social_ads add column if not exists headline_accent text;
alter table public.social_ads add column if not exists badge text;
