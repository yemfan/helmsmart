-- MarketingBoss AI — engagement metrics on published posts. The cron refreshes
-- these from each platform (where the API + our scopes allow: Facebook,
-- Instagram, YouTube) so the planner can favor what's working.
alter table public.campaign_posts add column if not exists metrics jsonb;
alter table public.campaign_posts add column if not exists metrics_at timestamptz;
