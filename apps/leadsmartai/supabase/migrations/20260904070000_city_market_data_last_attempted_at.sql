-- Record when a market was last TRIED, not just when it last succeeded.
--
-- #1502 stopped a failed lookup writing itself back as fresh, which was right:
-- `last_fetched_at` now means "when we last measured this market" and nothing
-- else. But the refresh plan orders by that same column, so a market that
-- cannot be measured never moves.
--
-- Athens and Bluewater are the live case. Both failed in the first successful
-- run -- "no median or price/sqft in response", which is the correct answer for
-- an unincorporated community with no published market data -- so their rows
-- kept their 2026-04-03 stamp and stayed at the front of the queue. Nothing
-- records that we tried, so they are retried every run, forever, and every
-- no-data market discovered later joins them.
--
-- One column separates the two questions. `last_fetched_at` keeps answering
-- "how current is this figure" for the freshness gate; `last_attempted_at`
-- answers "have we been here recently" for the ordering, and is stamped
-- whether the lookup succeeds or fails.
--
-- Backfilled from last_fetched_at so the first run after this orders exactly
-- as it does today rather than treating all 373 rows as never-attempted.

alter table public.city_market_data
  add column if not exists last_attempted_at timestamptz;

update public.city_market_data
set last_attempted_at = last_fetched_at
where last_attempted_at is null;

alter table public.city_market_data
  alter column last_attempted_at set default now();

alter table public.city_market_data
  alter column last_attempted_at set not null;

-- The refresh reads the whole table and sorts by this every run.
create index if not exists city_market_data_last_attempted_at_idx
  on public.city_market_data (last_attempted_at);

comment on column public.city_market_data.last_attempted_at is
  'When a refresh last TRIED this market, success or not. Drives queue order; last_fetched_at drives freshness.';
