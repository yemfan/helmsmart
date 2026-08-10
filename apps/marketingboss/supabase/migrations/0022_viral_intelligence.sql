-- Marketing Intelligence Engine (MVP) — the SHARED viral library.
-- Legal posture: metadata-only. We store links, metadata, and OUR OWN
-- AI-generated analysis — never third-party media. Remix produces original
-- expression from structural patterns; `rights` records this per row.

create table if not exists public.viral_items (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'web_research',  -- web_research | user | own_content | (future connectors)
  url text,
  title text not null,
  description text,
  platform text,                                -- tiktok | instagram | youtube | linkedin | x | multi | ...
  content_type text,                            -- video | image | carousel | text
  format text,                                  -- ugc | talking_head | listicle | before_after | ...
  industries text[],
  metrics jsonb,                                -- discovered/ESTIMATED metrics + where the estimate came from
  score_components jsonb,                       -- momentum/engagement/acceleration/recency/replicability/industryFit/crossPlatform (0-100 each)
  viral_score numeric not null default 0,       -- weighted blend (weights live in code, adjustable)
  velocity text,                                -- emerging | rising | exploding | viral | established | declining | evergreen
  status text not null default 'discovered'
    check (status in ('discovered', 'analyzed', 'templated', 'archived')),
  analysis jsonb,                               -- creative DNA: hookType, emotionalTrigger, structureNotes, whyItWorks[]
  analysis_version int not null default 1,
  rights jsonb,                                 -- { sourceType, storage: 'metadata_only', displayAllowed, remixAllowed: 'concept_only', attribution }
  user_id uuid references auth.users (id) on delete cascade,  -- null = global library row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists viral_items_score_idx on public.viral_items (status, viral_score desc, created_at desc);
create index if not exists viral_items_platform_idx on public.viral_items (platform);
create index if not exists viral_items_velocity_idx on public.viral_items (velocity);

create table if not exists public.viral_templates (
  id uuid primary key default gen_random_uuid(),
  viral_item_id uuid references public.viral_items (id) on delete set null,
  title text not null,
  description text,
  content_type text,
  format text,
  platforms text[],
  industries text[],
  objective text,
  hook_type text,
  emotional_trigger text,
  structure jsonb,                              -- [{ slot: 'HOOK', pattern: '3 things nobody tells you about {TOPIC}' }, ...]
  variables text[],
  replicability int,                            -- 0-100
  difficulty text,                              -- easy | medium | hard
  estimated_duration text,
  viral_score numeric,
  usage_count int not null default 0,
  performance jsonb,                            -- real-world rollup (PerformanceLearner, later)
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists viral_templates_type_idx on public.viral_templates (status, content_type);

-- Shared library: any signed-in user can READ global rows (and their own
-- submissions); only the server (service role) writes.
alter table public.viral_items enable row level security;
alter table public.viral_templates enable row level security;

create policy "viral_items_read" on public.viral_items
  for select to authenticated using (user_id is null or user_id = auth.uid());

create policy "viral_templates_read" on public.viral_templates
  for select to authenticated using (true);
