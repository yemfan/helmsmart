-- Voice-minutes entitlement: a monthly AI-voice cap on the plan, plus a
-- per-day usage counter the Retell call-events webhook increments.
--
-- Pairs with lib/entitlements/planCatalog.ts (`voiceMinutesPerMonth`) and
-- lib/entitlements/recordVoiceUsage.ts, which meters each connected AI call
-- in WHOLE MINUTES (rounded up) into entitlement_usage_daily.voice_minutes_used.
-- Additive + idempotent; safe to re-run.

alter table public.product_entitlements
  add column if not exists voice_minutes_per_month integer;

alter table public.entitlement_usage_daily
  add column if not exists voice_minutes_used integer not null default 0;

-- Backfill the cap on existing entitlement rows from the plan catalog.
-- (starter 15 · growth/Pro 100 · elite/Premium 300 · signature 600 · team 900)
update public.product_entitlements
set voice_minutes_per_month = case plan
    when 'starter'   then 15
    when 'growth'    then 100
    when 'elite'     then 300
    when 'signature' then 600
    when 'team'      then 900
    else voice_minutes_per_month
  end
where voice_minutes_per_month is null;
