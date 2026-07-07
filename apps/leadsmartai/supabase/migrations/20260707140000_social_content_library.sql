-- Social Content Library — the SHARED, AI-seeded EVERGREEN post bank.
--
-- Phase 1 of "Social Content Database + weekly Marketing Assistant
-- recommendations". This table is NOT per-agent: it's one shared library of
-- timeless, consumer-useful real-estate posts (tips, pitfalls, how-tos) that the
-- weekly recommender draws EVERGREEN picks from. TIMELY posts come from the Data
-- Center newsletter digest at recommend time and are NOT stored here.
--
-- Seeding: lib/social/generateEvergreen.ts writes ~24-30 rows via Claude (no
-- web_search — evergreen advice must stay timeless and must NOT assert specific
-- rates/prices/laws). Upserted idempotently on (title) by the seed route.
--
-- Access: service-role only. RLS is ON with NO policies, so the session client
-- reads/writes nothing; the seed route + recommender go through supabaseServer
-- (service role), matching the RLS-deny posture of the warehouse/newsletter
-- tables.

create table if not exists public.social_content_library (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in (
      'buying',
      'selling',
      'financing',
      'market_basics',
      'pitfalls',
      'how_to',
      'staging',
      'negotiation'
    )
  ),
  title text not null,
  -- the scroll-stopping first line
  hook text not null,
  -- 2-4 sentence post body
  body text not null,
  hashtags text[] not null default '{}',
  -- a suggestion the agent can hand to their image tool of choice
  image_prompt text,
  cta text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (title)
);

comment on table public.social_content_library is
  'Shared, AI-seeded EVERGREEN social post library (timeless tips/pitfalls/how-tos). Not per-agent. Drives the EVERGREEN half of the weekly Marketing Assistant recommendations. Service-role only (RLS on, no policies).';

comment on column public.social_content_library.hook is
  'The scroll-stopping first line of the post.';
comment on column public.social_content_library.body is
  '2-4 sentence post body. Evergreen: no specific rates/prices/laws.';
comment on column public.social_content_library.image_prompt is
  'A suggested prompt for the agent to generate an accompanying image.';

create index if not exists idx_social_content_library_category_status
  on public.social_content_library (category, status);

-- Service-role only. Enable RLS with no policies so the session-bound client is
-- deny-all; all access is through supabaseServer (service role).
alter table public.social_content_library enable row level security;
