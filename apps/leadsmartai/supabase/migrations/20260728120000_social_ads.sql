-- Promo social ads (single-image, next/og). Mirrors social_carousels: one row per
-- generated ad draft, rendered on the fly by /api/social/ad/[id]. Service-role
-- only (RLS enabled, no policies) — same posture as social_carousels.

create table if not exists public.social_ads (
  id          uuid primary key default gen_random_uuid(),
  agent_id    bigint,
  -- render inputs (shape mirrors lib/social/renderAd.ts AdInput)
  template    text not null default 'bold',   -- bold | photo | stat
  preset      text,                            -- interest-rate | market-update | promo | null (manual)
  format      text not null default 'square',  -- square | portrait | landscape
  headline    text,
  subhead     text,
  cta_text    text,
  stat_value  text,
  stat_label  text,
  stat_context text,
  photo_url   text,
  -- post copy
  caption     text,
  hashtags    text[] not null default '{}',
  -- lifecycle: same vocabulary as social_carousels.status
  status      text not null default 'draft'
              check (status in ('draft','approved','scheduled','posted','dismissed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.social_ads is
  'Single-image promo ads (next/og). Service-role only; rendered by /api/social/ad/[id]. Mirrors social_carousels.';

create index if not exists social_ads_agent_status_idx
  on public.social_ads (agent_id, status, created_at desc);

alter table public.social_ads enable row level security;
-- No policies on purpose: only the service-role client touches this table
-- (identical to social_carousels), so session clients read/write nothing.
