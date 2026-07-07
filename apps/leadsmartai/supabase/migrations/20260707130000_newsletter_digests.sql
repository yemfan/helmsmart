-- Weekly Regional Newsletter — NATIONAL digest store (Phase 1).
--
-- One row per week: the AI-written, cited NATIONAL rate + housing NEWS digest
-- that headlines every weekly issue (lib/newsletter/generateDigest.ts). The
-- REGIONAL market-data snapshot is layered on per-issue at render time from the
-- Data Center warehouse (market_geographies + market_metrics) — it is NOT stored
-- here, so a single national digest fans out across every region for a week.
--
-- RLS is ON with NO policies: every read/write goes through the service-role
-- client (@/lib/supabaseServer) from the digest cron and the public archive
-- pages (frozen, safe-to-expose content). A session client reads nothing.

create table if not exists public.newsletter_digests (
  id         uuid primary key default gen_random_uuid(),
  -- Monday of the week this digest covers; one digest per week.
  week_of    date not null unique,
  title      text not null,
  intro      text,
  -- items: [{ headline, summary, why_it_matters, source_url, publisher }]
  items      jsonb not null,
  -- sources: [{ title, url, publisher }]
  sources    jsonb,
  status     text not null default 'published',
  created_at timestamptz not null default now()
);

comment on table public.newsletter_digests is
  'Weekly Regional Newsletter — NATIONAL rate + housing news digest, one row per week (week_of = that week''s Monday). AI-written + cited (lib/newsletter/generateDigest.ts). The regional market snapshot is added per-issue at render time from the Data Center warehouse, not stored here. Service-role only (RLS on, no policies).';

comment on column public.newsletter_digests.items is
  'jsonb array: [{ headline, summary, why_it_matters, source_url, publisher }] — every source_url is a real http(s) URL found via web_search.';

comment on column public.newsletter_digests.sources is
  'jsonb array: [{ title, url, publisher }] — the citation list for the week.';

-- Newest-first archive scans (hub + "latest issue").
create index if not exists idx_newsletter_digests_week
  on public.newsletter_digests (week_of desc);

alter table public.newsletter_digests enable row level security;
-- Intentionally NO policies: reads/writes are service-role only.
