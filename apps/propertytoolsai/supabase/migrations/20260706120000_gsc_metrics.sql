-- Google Search Console ingestion: per-page and per-query daily metrics.
-- Populated by the /api/cron/gsc-import cron via the OAuth refresh-token flow.
-- Access is service-role only: RLS is ENABLED with NO policies (matches this
-- repo's posture — RLS on for all public tables, reached via the service-role
-- client which bypasses RLS).

create table if not exists public.gsc_page_metrics (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  page text not null,
  date date not null,
  clicks int not null default 0,
  impressions int not null default 0,
  ctr numeric,
  position numeric,
  created_at timestamptz default now(),
  unique (site, page, date)
);

create table if not exists public.gsc_query_metrics (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  query text not null,
  page text not null,
  date date not null,
  clicks int not null default 0,
  impressions int not null default 0,
  ctr numeric,
  position numeric,
  created_at timestamptz default now(),
  unique (site, query, page, date)
);

-- Helpful indexes for the admin reporting queries (by-site + date windows,
-- and page-prefix scans for /guides/ cluster coverage).
create index if not exists idx_gsc_page_metrics_site_date on public.gsc_page_metrics (site, date);
create index if not exists idx_gsc_page_metrics_site_page on public.gsc_page_metrics (site, page);
create index if not exists idx_gsc_query_metrics_site_date on public.gsc_query_metrics (site, date);
create index if not exists idx_gsc_query_metrics_site_page on public.gsc_query_metrics (site, page);

-- Service-role-only access.
alter table public.gsc_page_metrics enable row level security;
alter table public.gsc_query_metrics enable row level security;

comment on table public.gsc_page_metrics is 'Daily Google Search Console page-level metrics (clicks/impressions/ctr/position) per site.';
comment on table public.gsc_query_metrics is 'Daily Google Search Console query×page metrics per site.';
