-- MarketingBoss 2.0 Phase 2 — the Action lifecycle. Every planned post (an
-- "Action") now carries the WHY (the planner's business case for this post,
-- shown in the review UI — the constitution says every recommendation must
-- explain itself) and the cost the user is approving, up front.
--
-- Additive only; the app degrades gracefully if this hasn't been applied yet
-- (reads select *, writes retry without these columns).

alter table public.campaign_posts
  add column if not exists reasoning text,
  add column if not exists estimated_credits int;
