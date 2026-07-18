-- Weekly Regional Newsletter — subscriber list (Phase 1 capture).
--
-- Phase 1 captures the list only (web subscribe form → service-role insert). It
-- does NOT send email. The schema is architected for all three phases now:
--   * Phase 1: public RealtyBoss subscriptions (agent_id NULL), no send.
--   * Phase 2: email delivery + double-opt-in + a working unsubscribe flow
--     (unsubscribe_token + status are already here for it).
--   * Phase 3: agent-BRANDED delivery — agent_id set links the subscription to
--     the agent whose brand the issue is sent under.
--
-- agent_id is NULLABLE and its column TYPE follows public.agents.id (uuid OR
-- bigint) via the same runtime do-block pattern as market_reports
-- (20260707120000_market_reports.sql), so this migration works on either schema
-- shape. NULL = public RealtyBoss subscription; set = agent-branded (Phase 3).
--
-- RLS is ON with NO policies: Phase 1 writes go through the service-role client
-- from the subscribe API (app/api/newsletter/subscribe). A session client can't
-- read or write, which keeps the email list off the public/anon surface.

do $$
declare
  v_agent_type text;
begin
  select a.atttypid::regtype::text
    into v_agent_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'agents'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  if v_agent_type is null then
    raise exception 'public.agents.id column not found';
  end if;

  if v_agent_type = 'uuid' then
    execute $sql$
      create table if not exists public.newsletter_subscriptions (
        id                uuid primary key default gen_random_uuid(),
        email             text not null,
        -- 'national' | 'state' | 'metro'
        region_level      text not null,
        -- 'US' for national, 2-letter state code, or Zillow metro RegionID.
        region_code       text not null,
        region_name       text,
        -- NULL = public RealtyBoss subscription; set = agent-branded (Phase 3).
        agent_id          uuid references public.agents(id) on delete cascade,
        -- 'subscribed' | 'unsubscribed'
        status            text not null default 'subscribed',
        unsubscribe_token uuid not null default gen_random_uuid(),
        source            text,
        created_at        timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.newsletter_subscriptions (
        id                uuid primary key default gen_random_uuid(),
        email             text not null,
        region_level      text not null,
        region_code       text not null,
        region_name       text,
        agent_id          bigint references public.agents(id) on delete cascade,
        status            text not null default 'subscribed',
        unsubscribe_token uuid not null default gen_random_uuid(),
        source            text,
        created_at        timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for newsletter_subscriptions: %', v_agent_type;
  end if;
end $$;

comment on table public.newsletter_subscriptions is
  'Weekly Regional Newsletter subscriber list. Phase 1 CAPTURES only (web form → service-role insert), no email is sent. Phase 2 adds email delivery + double-opt-in + a working unsubscribe flow (status + unsubscribe_token are already here). Phase 3 uses agent_id for agent-branded delivery. Service-role only (RLS on, no policies).';

comment on column public.newsletter_subscriptions.agent_id is
  'NULL = public RealtyBoss subscription (Phase 1). Set = agent-branded delivery (Phase 3). Column type follows public.agents.id.';

comment on column public.newsletter_subscriptions.unsubscribe_token is
  'Opaque token for the Phase 2 one-click unsubscribe link; unused in Phase 1.';

-- Dedupe: one subscription per (email, region, brand). coalesce(agent_id) folds
-- NULL (public) and set (agent-branded) into distinct buckets; lower(email)
-- makes it case-insensitive. The subscribe API inserts on conflict do nothing.
create unique index if not exists uq_newsletter_subscriptions_dedupe
  on public.newsletter_subscriptions (lower(email), region_code, coalesce(agent_id::text, ''));

-- Agent-scoped scans for Phase 3 branded delivery.
create index if not exists idx_newsletter_subscriptions_agent
  on public.newsletter_subscriptions (agent_id)
  where agent_id is not null;

alter table public.newsletter_subscriptions enable row level security;
-- Intentionally NO policies: Phase 1 writes are service-role only. Email
-- delivery + double-opt-in + the unsubscribe flow are Phase 2.
