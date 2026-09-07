-- Google Analytics 4 as a read-only connection on social_accounts
-- (platform = 'google', a value the CHECK has allowed since the table was
-- created). One row per agent: which GA4 property is theirs, the properties
-- the authorising account can see (so the agent can pick when we cannot
-- match one), a cached report per window, and Google's refresh token.
--
-- The hub already sends the agent's GA4 tag its events; until now nothing
-- read them back, so the marketing page could only say "the tag is on".

alter table public.social_accounts
  add column if not exists ga_property_id text,
  add column if not exists ga_property_name text,
  add column if not exists ga_properties jsonb,
  add column if not exists ga_metrics jsonb,
  add column if not exists ga_metrics_refreshed_at timestamptz,
  add column if not exists google_refresh_token_enc text;

comment on column public.social_accounts.ga_property_id is 'GA4 property id (numeric, without the properties/ prefix) the marketing page reads. Null until matched or chosen.';
comment on column public.social_accounts.ga_properties is 'Properties visible to the authorising Google account at connect time: [{id, name, measurementIds}].';
comment on column public.social_accounts.ga_metrics is 'Cached reports keyed by window in days: {"30": {report, refreshedAt}}.';

-- One Google Analytics connection per agent. PARTIAL: never target it with a
-- PostgREST upsert (42P10); the callback selects then inserts/updates.
create unique index if not exists social_accounts_agent_google_key
  on public.social_accounts (agent_id)
  where platform = 'google';
