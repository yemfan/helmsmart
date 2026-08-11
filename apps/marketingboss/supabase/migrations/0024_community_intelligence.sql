-- Community Intelligence Engine (MVP) — the universal community model.
-- Communities are shared facts (like viral_items): authenticated read,
-- service-role writes. Per-user state (favorites/collections) lives in
-- community_saves. See docs/marketing/community-intelligence-engine.md.

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'web_research',   -- provider abstraction: a real connector fills the same shape
  platform text not null,                        -- reddit | facebook | linkedin | discord | slack | x | youtube | quora | ...
  name text not null,                            -- r/RealEstateTechnology, "Real Estate AI" LinkedIn group…
  url text,
  category text,
  industry text,
  language text,
  description text,
  audience jsonb,        -- { membersEstimate, activeEstimate, targetAudience, professionalLevel, geography }
  activity jsonb,        -- { level, postsPerDayEstimate, engagement, note }
  culture jsonb,         -- { tone, formality, humor, technicalDepth, friendliness }
  rules jsonb,           -- { promotionAllowed, externalLinks, selfPromotionPolicy, moderationStrictness, note }
  topics jsonb,          -- { trending: [], evergreen: [], faqs: [] }
  dna jsonb,             -- { summary, bestContent: [], postingStyle, bestTime, recommendation }
  score_components jsonb,  -- audienceMatch/engagement/growth/competition/promotionTolerance/conversionPotential (0-100 each)
  opportunity_score numeric not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  analysis_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communities_score_idx on public.communities (status, opportunity_score desc, created_at desc);
create index if not exists communities_platform_idx on public.communities (platform);
create index if not exists communities_industry_idx on public.communities (industry);

alter table public.communities enable row level security;

create policy "communities_read" on public.communities
  for select to authenticated using (true);

-- Per-user saves + lightweight collections ("Favorites", "Publishing list"…).
create table if not exists public.community_saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  collection text not null default 'Favorites',
  created_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

alter table public.community_saves enable row level security;

create policy "community_saves_owner_all" on public.community_saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
