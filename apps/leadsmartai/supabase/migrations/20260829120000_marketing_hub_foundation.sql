-- Marketing Hub, phase 1: give agents a public address, and give the event
-- layer the tenant dimension it never had.
--
-- Two additive changes, no data movement.
--
-- 1. `agents` gains the identity a public page needs. Most of what a hub
--    renders already lives on this table — brand_name, logo_url,
--    agent_photo_url, service_areas_v2, dt_brand_profile, dt_portrait_path —
--    so this adds only what is genuinely missing: the URL, the words, and the
--    switch that says the page is ready to be seen.
--
-- 2. `traffic_events` gains agent_id, visitor_id and session_id. This table is
--    already, field for field, close to the event schema the Hub spec asks
--    for: event_type, page_path, source, campaign, lead_id, metadata. The one
--    thing it could not express is WHOSE traffic a row describes, which is the
--    only reason it was platform-wide rather than multi-tenant.
--
-- The nullable agent_id is what keeps this backward compatible. Every existing
-- row, and every row the city-page and exit-intent writers keep producing, has
-- a null agent and means "CloseBoss's own traffic". Hub rows carry an agent.
-- The two never mix as long as readers say which they want — and the platform
-- readers are updated in the same change to ask for `agent_id is null`.
-- Without that filter the blend is silent: no error, just CloseBoss marketing
-- numbers quietly inflated by every agent's visitors.

-- ── agents: the public identity ──────────────────────────────────────────

alter table if exists public.agents
  add column if not exists slug text null,
  add column if not exists bio text null,
  add column if not exists specialties text[] null,
  add column if not exists hub_published boolean not null default false;

comment on column public.agents.slug is
  'URL segment for the public marketing hub: /a/<slug>. Lowercase, unique. Null until the agent picks one.';
comment on column public.agents.bio is
  'Short first-person introduction shown on the hub hero. Plain text.';
comment on column public.agents.specialties is
  'Free-form tags (first-time buyers, luxury, relocation, Chinese-speaking...). Not an enum: the list grows and a CHECK here would fail a save mid-onboarding.';
comment on column public.agents.hub_published is
  'False until the agent publishes. The public route 404s on an unpublished hub, so a half-filled page is never indexable.';

-- Lowercase alphanumerics and single hyphens, 3..48 chars, no leading or
-- trailing hyphen. Enforced here rather than only in the form because the slug
-- becomes a public URL and a bad one is expensive to withdraw once indexed.
alter table if exists public.agents
  drop constraint if exists agents_slug_format;
alter table if exists public.agents
  add constraint agents_slug_format
  check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48);

-- Unique, but only over the rows that have one — many agents will never set a
-- slug and null is not a collision.
create unique index if not exists idx_agents_slug_unique
  on public.agents (slug)
  where slug is not null;

-- ── traffic_events: the tenant dimension ─────────────────────────────────

alter table if exists public.traffic_events
  add column if not exists agent_id bigint null references public.agents(id) on delete cascade,
  add column if not exists visitor_id text null,
  add column if not exists session_id text null;

comment on column public.traffic_events.agent_id is
  'Whose traffic this is. NULL = CloseBoss platform traffic (city pages, marketing site) — the meaning every pre-existing row already carries. Set = a visit to that agent''s marketing hub.';
comment on column public.traffic_events.visitor_id is
  'Opaque per-browser id, first-party. Survives sessions so an anonymous visitor can be joined to the lead they later become.';
comment on column public.traffic_events.session_id is
  'Opaque per-visit id. Resets between visits; visitor_id does not.';

-- The hub dashboard asks "this agent, this month" and the platform dashboard
-- asks "no agent, this month". One index serves both, because a null agent_id
-- is just another value to seek on.
create index if not exists idx_traffic_events_agent_created
  on public.traffic_events (agent_id, created_at desc);

-- Visitor stitching: "everything this browser did before it became a lead".
create index if not exists idx_traffic_events_visitor
  on public.traffic_events (visitor_id, created_at desc)
  where visitor_id is not null;
