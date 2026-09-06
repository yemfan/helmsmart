-- Marketing Hub v2: the page becomes a configurable conversion engine.
--
-- Two new tables and two indexes. Nothing existing is moved or renamed.
--
-- 1. agent_hub_settings — one row per agent, one JSONB document.
--
--    Hero copy and CTAs, services, which tools to show, market areas, social
--    profile links, featured content, the AI assistant's greeting and
--    knowledge, lead-capture behaviour, SEO fields, appearance. Every one of
--    these is a short per-agent list or a handful of strings, so a document
--    validated in code (lib/marketing-hub/config.ts) is the right shape —
--    the same choice `agents.onboarding` and `agents.dt_brand_profile`
--    already made. Eight normalized tables would buy nothing here and cost a
--    join per section on a public page that must stay fast.
--
--    The agent's identity (username, bio, specialties, hub_published) stays
--    on `agents` where the foundation migration put it.
--
-- 2. hub_conversations — a visitor's chat with the agent's AI assistant.
--
--    Keyed on the agent and the first-party visitor id, transcript as one
--    jsonb array — the `sms_conversations` shape, which has worked for the
--    SMS responder. `contact_id` is filled in the moment the visitor gives
--    enough to become a lead, so the agent can read what was said before the
--    name arrived.
--
-- RLS is enabled with no policies on both: reads and writes go through the
-- service-role client, scoped by agent id in the WHERE clause. That is the
-- stance `agent_tracking_config` took and for the same reason — a public-read
-- policy added later would OR into any query that leaned on RLS for scoping.

create table if not exists public.agent_hub_settings (
  agent_id   bigint primary key references public.agents(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_hub_settings is
  'Marketing hub configuration, one JSONB document per agent. Shape and defaults are owned by lib/marketing-hub/config.ts; unknown keys are dropped on read, so a stale document never breaks the page.';

alter table if exists public.agent_hub_settings enable row level security;

create table if not exists public.hub_conversations (
  id            uuid primary key default gen_random_uuid(),
  agent_id      bigint not null references public.agents(id) on delete cascade,
  visitor_id    text null,
  session_id    text null,
  contact_id    uuid null references public.contacts(id) on delete set null,
  messages      jsonb not null default '[]'::jsonb,
  lead_state    jsonb not null default '{}'::jsonb,
  message_count integer not null default 0,
  locale        text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.hub_conversations is
  'A visitor''s conversation with an agent''s public AI assistant. messages = [{role, content, at}]; lead_state = what the assistant has learned so far (name, email, phone, intent, ...). contact_id set once the visitor becomes a lead.';

create index if not exists idx_hub_conversations_agent_created
  on public.hub_conversations (agent_id, created_at desc);

create index if not exists idx_hub_conversations_agent_visitor
  on public.hub_conversations (agent_id, visitor_id, updated_at desc)
  where visitor_id is not null;

create index if not exists idx_hub_conversations_contact
  on public.hub_conversations (contact_id)
  where contact_id is not null;

alter table if exists public.hub_conversations enable row level security;

-- The overview asks "this agent, these event types, this month". The
-- foundation index is (agent_id, created_at); adding event_type lets the
-- per-type counts seek rather than filter.
create index if not exists idx_traffic_events_agent_type_created
  on public.traffic_events (agent_id, event_type, created_at desc)
  where agent_id is not null;
