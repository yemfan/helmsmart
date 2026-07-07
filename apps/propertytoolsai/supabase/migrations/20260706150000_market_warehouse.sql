-- Data Center — Phase B: structured market-metrics warehouse.
--
-- A shared datastore of real housing + rate time-series by geography, ingested
-- on a schedule from authoritative public sources (FRED / St. Louis Fed,
-- Zillow Research, Redfin Data Center). This is the foundation Phase C's
-- metro/state data pages read from.
--
-- Two tables:
--   market_geographies — the geography dimension (national / 50 states / top metros)
--   market_metrics     — long-format facts (one row per geo × metric × period)
--
-- Both are RLS-enabled with NO policies: they are written and read exclusively
-- via the service-role client (never the session/anon client).

-- ---------------------------------------------------------------------------
-- Dimension: geographies covered by the warehouse.
-- ---------------------------------------------------------------------------
create table if not exists public.market_geographies (
  geo_level   text        not null,                 -- 'national' | 'state' | 'metro'
  geo_code    text        not null,                 -- 'US' (national), 2-letter (state), Zillow RegionID (metro)
  geo_name    text        not null,                 -- display name ('United States', 'California', 'New York, NY')
  state       text        null,                     -- 2-letter state code for metros; null for national/state rows
  size_rank   int         null,                     -- Zillow SizeRank (0 = national, ascending by size)
  population  bigint      null,                      -- optional; reserved for future enrichment
  active      boolean     not null default true,     -- drives Phase C coverage gating
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (geo_level, geo_code)
);

create index if not exists idx_market_geographies_level_rank
  on public.market_geographies (geo_level, size_rank asc nulls last);

comment on table public.market_geographies is
  'Data Center warehouse dimension: the geographies (national + states + top metros) the warehouse covers. Drives Phase C data-page coverage. Service-role only.';
comment on column public.market_geographies.geo_level is 'national | state | metro';
comment on column public.market_geographies.geo_code is 'Stable id: US for national, 2-letter for state, Zillow RegionID for metro.';
comment on column public.market_geographies.size_rank is 'Zillow SizeRank; 0 = national, lower = larger. Used to cap metros to the top N.';
comment on column public.market_geographies.active is 'Whether Phase C should surface this geography.';

-- ---------------------------------------------------------------------------
-- Facts: long-format metric observations.
-- ---------------------------------------------------------------------------
create table if not exists public.market_metrics (
  id          uuid        primary key default gen_random_uuid(),
  geo_level   text        not null,                 -- 'national' | 'state' | 'metro'
  geo_code    text        not null,                 -- matches market_geographies.geo_code
  metric      text        not null,                 -- 'zhvi' | 'median_sale_price' | 'inventory' | 'median_dom' | 'months_supply' | 'mortgage_30yr' | ...
  period      date        not null,                 -- observation period end (month)
  value       numeric     null,                     -- the value (null when a source publishes a gap)
  unit        text        null,                     -- 'usd' | 'count' | 'days' | 'percent' | 'index'
  source      text        null,                     -- provenance ('FRED / St. Louis Fed', 'Zillow Research', 'Redfin Data Center')
  created_at  timestamptz not null default now(),
  unique (geo_level, geo_code, metric, period)
);

create index if not exists idx_market_metrics_geo_metric_period
  on public.market_metrics (geo_level, geo_code, metric, period desc);
create index if not exists idx_market_metrics_metric_period
  on public.market_metrics (metric, period desc);

comment on table public.market_metrics is
  'Data Center warehouse facts: long-format housing + rate time-series (one row per geo × metric × period). Service-role only. Upserted on (geo_level, geo_code, metric, period).';
comment on column public.market_metrics.metric is 'Metric key, e.g. zhvi, median_sale_price, inventory, median_dom, months_supply, mortgage_30yr, mortgage_15yr, treasury_10yr, homes_sold, sale_to_list.';
comment on column public.market_metrics.unit is 'usd | count | days | percent | index';
comment on column public.market_metrics.period is 'Observation period end (month boundary).';

-- ---------------------------------------------------------------------------
-- RLS: enabled with NO policies → deny all except the service-role key,
-- which bypasses RLS. This warehouse is internal (ingestion + read helpers).
-- ---------------------------------------------------------------------------
alter table public.market_geographies enable row level security;
alter table public.market_metrics    enable row level security;
