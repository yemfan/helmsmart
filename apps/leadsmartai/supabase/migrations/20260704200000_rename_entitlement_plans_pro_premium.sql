-- Rename entitlement plan slugs to match the marketing names:
--   growth  -> pro
--   elite   -> premium
-- Aligns product_entitlements.plan with the PLAN_CATALOG / PLANS dialects
-- (starter / pro / premium / signature / team). The plan column has only a
-- non-empty CHECK (no enum), so no constraint change is needed. The mapping
-- functions still accept the legacy slugs as aliases for any straggler data.
-- Idempotent; safe to re-run.

update public.product_entitlements set plan = 'pro'     where plan = 'growth';
update public.product_entitlements set plan = 'premium' where plan = 'elite';
