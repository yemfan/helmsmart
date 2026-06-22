-- CMA reports: store the full snapshot JSON.
--
-- The AI (Claude + web search) CMA producer returns extra fields the
-- per-column schema doesn't capture — cited `sources`, the engine `summary`,
-- and an AI `disclaimer`. Persist the whole snapshot here so the detail view,
-- PDF, and email can render sources + the disclaimer. The existing per-field
-- columns (subject_json/comps_json/valuation_json/strategies_json + the
-- denormalized estimate columns) stay populated for the list view; rows
-- written before this column existed read back from those.
alter table public.cma_reports
  add column if not exists snapshot_json jsonb;
