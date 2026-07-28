-- Brand photo pool for the "photo" ad preset. An agent uploads lifestyle/brand
-- photos once; the photo template rotates them (logo + headline + CTA overlaid).
-- Photos live in the public `social-images` bucket; this table is the index.
-- Service-role only (RLS on, no policies) — same posture as social_ads.

create table if not exists public.social_ad_photos (
  id         uuid primary key default gen_random_uuid(),
  agent_id   bigint not null,
  url        text not null,       -- public URL in the social-images bucket
  label      text,                -- optional caption/alt for the agent's own reference
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.social_ad_photos is
  'Agent brand/lifestyle photos feeding the "photo" ad preset. URLs point at the public social-images bucket. Service-role only.';

create index if not exists social_ad_photos_agent_idx
  on public.social_ad_photos (agent_id, active, created_at desc);

alter table public.social_ad_photos enable row level security;
