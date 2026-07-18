-- Weekly Regional Newsletter — email delivery (Phase 2).
--
-- Phase 1 (20260707130001_newsletter_subscriptions.sql) captured the list only.
-- Phase 2 turns on real email delivery for PUBLIC (agent_id IS NULL) subs with:
--   * double opt-in — a subscriber must click a confirmation link before any
--     issue is sent. confirm_token seeds that link; confirmed_at stamps the
--     click. The weekly send targets confirmed subs only.
--   * idempotent weekly send — last_sent_week records the digest week already
--     mailed to a sub, so a re-run of the cron never double-sends the same issue.
--
-- IMPORTANT re: existing Phase-1 rows: they have confirmed_at NULL (they never
-- double-opted-in), so they will NOT receive email until they re-confirm. That
-- is intentional and CAN-SPAM/deliverability-safe — we only mail confirmed subs.
--
-- Service-role only (the table is RLS-on, no policies). The confirm/unsubscribe
-- pages + the send cron all use the service-role client.

alter table public.newsletter_subscriptions
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirm_token uuid not null default gen_random_uuid(),
  add column if not exists last_sent_week date;

comment on column public.newsletter_subscriptions.confirmed_at is
  'Double opt-in timestamp. NULL = never confirmed (do NOT send). Set when the subscriber clicks the confirmation link (/newsletter/confirm?token=confirm_token). The weekly send only targets confirmed subs.';

comment on column public.newsletter_subscriptions.confirm_token is
  'Opaque token for the double-opt-in confirmation link emailed on subscribe (/newsletter/confirm?token=…). Distinct from unsubscribe_token.';

comment on column public.newsletter_subscriptions.last_sent_week is
  'week_of (YYYY-MM-DD Monday) of the last digest issue mailed to this sub. Makes the weekly send idempotent: a re-run skips subs whose last_sent_week already equals the current week_of.';

-- Fast lookup of sendable subs for the weekly cron: public subscriptions
-- (agent_id NULL) filtered by status + confirmed_at. Partial on agent_id NULL
-- keeps it small (Phase-2 delivery is public-only; agent-branded is Phase 3).
create index if not exists idx_newsletter_subs_sendable
  on public.newsletter_subscriptions (agent_id, status, confirmed_at)
  where agent_id is null;
