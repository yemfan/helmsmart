-- MarketingBoss AI — Autopilot marketing campaigns.
-- A campaign points at a product/business link. The AI researches the market +
-- competitors into a `brief`, then (later slices) plans and posts content on a
-- cadence the user controls. Cost is bounded by allowed media types + a credit
-- budget; autonomy is per-campaign (review the drafts, or full auto).

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  link text not null,                       -- the product / business URL
  name text,                                -- brand/campaign name (from the brief)
  brief jsonb,                              -- AI brand brief (audience, tone, pillars, competitors…)
  media_types text[] not null default '{image}',   -- allowed: text | image | video (cost control)
  channels text[] not null default '{}',    -- target platforms
  frequency int not null default 3,         -- posts per week
  budget_credits int,                       -- optional cap on fal credits (null = uncapped)
  spent_credits int not null default 0,
  mode text not null default 'review' check (mode in ('review', 'auto')),
  status text not null default 'active' check (status in ('active', 'paused')),
  next_run_at timestamptz,                  -- when the autopilot next plans a post
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One planned/published post in a campaign (the review queue + history).
create table if not exists public.campaign_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'skipped')),
  type text not null check (type in ('text', 'image', 'video')),
  angle text,                               -- the content angle / pillar this post covers
  title text,
  caption text,
  hashtags text[] not null default '{}',
  link text,                                -- CTA destination
  media_prompt text,                        -- fal.ai prompt (generated on approve/auto)
  media_url text,                           -- rendered/uploaded media
  per_platform jsonb,                       -- { platform: tailored caption }
  channels text[] not null default '{}',
  results jsonb,                            -- publish results per platform
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists campaigns_user_idx on public.campaigns (user_id, created_at desc);
create index if not exists campaign_posts_campaign_idx on public.campaign_posts (campaign_id, created_at desc);
create index if not exists campaign_posts_user_status_idx on public.campaign_posts (user_id, status);

-- Owner-scoped RLS (same posture as `generations`): a user sees/edits only their
-- own rows. Server routes still validate via the service-role client.
alter table public.campaigns enable row level security;
alter table public.campaign_posts enable row level security;

create policy "campaigns_owner_all" on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "campaign_posts_owner_all" on public.campaign_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
