-- MarketingBoss AI — Slice 6: per-user social publishing connections.
-- Stores OAuth tokens so a user can publish their generated videos to their own
-- channel (YouTube first; the `platform` column leaves room for TikTok etc.).

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,                 -- 'youtube' (future: 'tiktok', ...)
  provider_account_id text,               -- e.g. YouTube channel id
  account_name text,                      -- e.g. channel title (shown in the UI)
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

-- Tokens are secrets: RLS is ON with NO policies, so the anon/authenticated
-- clients can never read this table. Only the server (service role, which
-- bypasses RLS) reads/writes it — via lib/social.ts.
alter table public.social_connections enable row level security;
