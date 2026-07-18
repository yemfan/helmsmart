-- Data Center: original-research publishing engine.
--
-- Stores dated, cited market reports (weekly mortgage-rate + monthly housing-
-- market). Each row carries the SHARED data (title/dek/key_stats/data_table/
-- sources) plus TWO analysis framings over the same numbers:
--   analysis_consumer -> PropertyTools.ai (buyers/sellers/investors)
--   analysis_agent    -> RealtyBoss / leadsmartai (agents)
-- This avoids duplicate-content across the two domains: same facts, different
-- narrative lens rendered per site.
--
-- Written repo-first; NOT applied here (the main agent applies migrations).

create table if not exists public.research_reports (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,                 -- 'weekly_rates' | 'monthly_market'
  slug                text not null unique,
  title               text not null,
  dek                 text,
  period_label        text,
  key_stats           jsonb,                         -- [{label, value, sourceIndex}]
  data_table          jsonb,                         -- {caption, columns[], rows[][]} | null
  sources             jsonb,                         -- [{title, url, publisher}]
  analysis_consumer   jsonb not null,                -- {sections[], faqs[]} consumer/investor lens
  analysis_agent      jsonb not null,                -- {sections[], faqs[]} agent lens
  published_date      date not null,
  status              text not null default 'published',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Hub/listing queries pull newest-first within a kind.
create index if not exists research_reports_kind_published_idx
  on public.research_reports (kind, published_date desc);

-- RLS on, NO policies: service-role only (reports are read server-side via the
-- service-role client and rendered by RSC; the public reaches them only through
-- our own pages, never a session-scoped client).
alter table public.research_reports enable row level security;
