-- MarketingBoss AI — scheduling. A campaign_posts row can now be a standalone,
-- scheduled one-off post (from the AI Social Post composer) with no campaign —
-- so the posting hub's Scheduled + History lists unify one-off and campaign posts.
alter table public.campaign_posts alter column campaign_id drop not null;

create index if not exists campaign_posts_scheduled_idx
  on public.campaign_posts (scheduled_for)
  where status = 'scheduled';
