-- social_accounts.last_used_at — the last field needed to retire
-- agent_social_connections.
--
-- Consolidation: connecting a Page wrote `agent_social_connections` while every
-- publisher read `social_accounts`, so a connected Page was invisible to the
-- publish rail (it silently no-opped). We standardize on `social_accounts` —
-- it already has encrypted tokens (page_access_token_enc) and a status enum
-- that already permits 'revoked', so revocation needs no new column.
--
-- `last_used_at` is the one thing social_accounts lacked: the settings panel
-- renders "last used <date>" per connection. (agent_social_connections'
-- token_expires_at is NOT carried over — nothing renders it, and long-lived
-- Page tokens derived from a long-lived user token don't expire; the +55d value
-- was a placeholder for a refresh cron that never shipped.)

alter table public.social_accounts
  add column if not exists last_used_at timestamptz;
