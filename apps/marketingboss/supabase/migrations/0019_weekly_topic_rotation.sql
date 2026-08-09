-- Weekly schedule: topic ROTATION. One fixed topic per weekday gets stale the
-- moment someone posts aggressively (every Sunday = the same "product
-- spotlight" forever). Instead the user selects a POOL of topics and each
-- posting day takes the next one — rotation is derived from the calendar date
-- (days-since-epoch % pool size), so it's deterministic and needs no cursor.
--
-- The single `topic` column stays as the legacy fallback (used when the pool
-- is empty), so existing schedules keep firing unchanged.

alter table public.weekly_schedules
  add column if not exists topics text[];
