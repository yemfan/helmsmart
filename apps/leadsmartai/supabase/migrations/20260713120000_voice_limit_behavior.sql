-- Per-agent choice for what happens when the monthly AI voice-minutes allotment
-- runs out (surfaced near the limit; enforced by the inbound receptionist in a
-- follow-up PR):
--   'text_back' = fall back to the SMS missed-call text-back (default, no charge)
--   'overage'   = keep the AI answering, billed at the per-minute overage rate
-- ("Upgrade" is a UI CTA, not a stored runtime behavior.)
alter table public.voice_receptionist_settings
  add column if not exists voice_limit_behavior text not null default 'text_back';

alter table public.voice_receptionist_settings
  drop constraint if exists voice_receptionist_settings_voice_limit_behavior_chk;
alter table public.voice_receptionist_settings
  add constraint voice_receptionist_settings_voice_limit_behavior_chk
  check (voice_limit_behavior in ('text_back', 'overage'));
