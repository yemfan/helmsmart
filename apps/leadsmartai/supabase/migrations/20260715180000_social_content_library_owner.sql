-- Content ownership for the social content library.
--
-- WHY: `social_content_library` was implicitly 100%-shared — buildEvergreenRows
-- selects it with no owner filter, so EVERY row is eligible for EVERY agent's
-- weekly recommendations. That was fine while the library held only
-- consumer-education copy an agent posts to their own clients.
--
-- It stops being fine the moment we put the RealtyBoss brand's own marketing in
-- there (founder voice: "I'm a realtor. Before RealtyBoss, I tried everything…").
-- Without an owner column, that copy would be recommended to real agents, who
-- would post "I built RealtyBoss" to their own feeds. Ownership is a correctness
-- requirement here, not a nice-to-have.
--
-- Model: NULL agent_id = shared (eligible for everyone, the default and the
-- existing 29 rows); non-null = private to that agent.

alter table public.social_content_library
  add column if not exists agent_id bigint
  references public.agents(id) on delete cascade;

comment on column public.social_content_library.agent_id is
  'Owner. NULL = shared library, eligible for every agent. Non-null = private to that agent (e.g. the brand agent''s founder-voice marketing). Never surface one agent''s owned content to another.';

create index if not exists idx_social_content_library_agent_status
  on public.social_content_library (agent_id, status);

-- Title uniqueness has to become per-owner. It was a global `unique (title)`,
-- which would stop two agents from ever owning same-titled content. NULLS NOT
-- DISTINCT (PG15+; this project is on 17.6) keeps the shared rows deduped by
-- title exactly as before, since their agent_id is NULL and NULLs compare equal
-- under this option. The seed-evergreen upsert moves to onConflict=agent_id,title.
alter table public.social_content_library
  drop constraint if exists social_content_library_title_key;

alter table public.social_content_library
  add constraint social_content_library_owner_title_key
  unique nulls not distinct (agent_id, title);

-- 'brand' category. Every existing category is a consumer-education topic aimed
-- at an agent's clients; brand copy is a different audience (realtors) in a
-- different voice, so it needs its own bucket rather than being crammed into
-- 'how_to'.
alter table public.social_content_library
  drop constraint if exists social_content_library_category_check;

alter table public.social_content_library
  add constraint social_content_library_category_check
  check (category in (
    'buying','selling','financing','market_basics',
    'pitfalls','how_to','staging','negotiation','brand'
  ));
