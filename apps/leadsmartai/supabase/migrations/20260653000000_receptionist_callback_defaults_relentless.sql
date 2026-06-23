-- RealtorBoss — make the default Receptionist call-back ladder actually relentless.
--
-- The landing now promises "never miss a single call — the AI keeps calling
-- back until it connects, and never gives up." The original defaults (3 attempts
-- in a single day) undercut that. Bump the out-of-the-box cadence so the default
-- behavior matches the claim:
--
--   callback_max_per_day : 3 → 4
--   callback_max_days    : 1 → 3      (total attempts 3 → 12, over 3 days)
--   callback_interval_minutes        : unchanged (30 min — relentless, not spammy)
--
-- When the (now longer) ladder is exhausted without reaching the caller, the cron
-- still opens a manual "call back" crm_tasks row, so a lead is never silently
-- dropped.

alter table public.missed_call_settings
  alter column callback_max_per_day set default 4,
  alter column callback_max_days set default 3;

-- Bring existing rows still on the old default cadence (3 / 1) up to the new
-- default. Rows an agent has customized to any other value are left untouched.
update public.missed_call_settings
  set callback_max_per_day = 4,
      callback_max_days = 3,
      updated_at = now()
  where callback_max_per_day = 3
    and callback_max_days = 1;

comment on column public.missed_call_settings.callback_max_per_day is
  'Call-back attempts placed per day (1–10). Default 4.';
comment on column public.missed_call_settings.callback_max_days is
  'Days to keep attempting call-backs before opening a manual task (1–7). Default 3.';
