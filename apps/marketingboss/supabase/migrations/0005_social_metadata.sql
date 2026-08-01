-- MarketingBoss AI — Phase 1: multi-channel publishing.
-- Some platforms need extra ids alongside the token (Facebook Page id, Instagram
-- business user id, Pinterest board id, LinkedIn member urn). Store them in a
-- JSON blob so one table serves every platform.
alter table public.social_connections
  add column if not exists metadata jsonb;
