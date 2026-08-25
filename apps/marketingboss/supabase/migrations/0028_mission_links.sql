-- MarketingBoss 3.0 Phase 1 — wire missions to the work they produce, and give
-- the business profile the fields the workforce needs.
--
-- Column additions only: campaigns and campaign_posts keep every existing row
-- and every existing meaning. A null mission_id is simply work created the way
-- it always was — by hand, by a playbook, or by the weekly schedule.

alter table public.campaigns
  add column if not exists mission_id uuid references public.missions (id) on delete set null;

alter table public.campaign_posts
  add column if not exists mission_id uuid references public.missions (id) on delete set null,
  add column if not exists run_step_id uuid references public.agent_run_steps (id) on delete set null;

create index if not exists campaign_posts_mission_idx
  on public.campaign_posts (mission_id, created_at desc);

-- Business profile grows (3.0 §D6).
--
--   destinations — the owner supplies where traffic goes; we never build landing
--     pages. More than one, because "book a consult", "shop the sale" and "join
--     the list" are different missions pointing at different places, and a
--     strategist that can't tell them apart writes generic CTAs.
--     Shape: [{ label, url, offer, use_for }]
--
--   utm — optional tagging so the owner's OWN analytics can attribute the
--     traffic we send. Off by default. Shape: { enabled, source, medium,
--     campaign_template, redirect }  (redirect toggles the owned /r/ hop)
--
--   preferences — stated instructions and approval/publishing preferences that
--     accumulate over time. This plus learnings plus opportunities IS the
--     "marketing DNA"; no separate memory store is needed yet.
alter table public.brand_kits
  add column if not exists destinations jsonb,
  add column if not exists utm jsonb,
  add column if not exists preferences jsonb;
