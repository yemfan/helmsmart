-- Signature-tier brand kit: per-agent brand color for the generated social card.
-- Hex like '#0072ce' (validation lives in the API/UI); NULL = default RealtyBoss blue.

alter table public.agent_ai_settings
  add column if not exists brand_color text null;

comment on column public.agent_ai_settings.brand_color is
  'Signature brand-kit accent color (hex, e.g. #0072ce) for generated social cards. NULL = default RealtyBoss blue.';
