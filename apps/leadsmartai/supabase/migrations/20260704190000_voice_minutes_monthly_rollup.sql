-- Extend the monthly usage rollup to expose voice minutes, so the entitlement
-- cap check (canPlaceVoiceCall) can read month-to-date voice usage the same way
-- it reads ai_actions. CREATE OR REPLACE keeps ai_actions_used and appends
-- voice_minutes_used (depends on entitlement_usage_daily.voice_minutes_used
-- from 20260704180000).

create or replace view public.entitlement_ai_usage_monthly as
  select
    user_id,
    product,
    date_trunc('month'::text, usage_date::timestamp with time zone)::date as month_start,
    sum(ai_actions_used)::integer as ai_actions_used,
    sum(voice_minutes_used)::integer as voice_minutes_used
  from entitlement_usage_daily
  group by user_id, product, date_trunc('month'::text, usage_date::timestamp with time zone);
