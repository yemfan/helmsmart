-- Dedupe key so the "approaching your AI voice-minutes limit" email fires at
-- most once per calendar month per agent. Stores the 'YYYY-MM' (UTC) of the
-- last send; a new month != stored value re-arms the notification.
alter table public.voice_receptionist_settings
  add column if not exists voice_limit_notified_period text;
