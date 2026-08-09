-- MarketingBoss 2.0 Phase 4 — Playbooks. A campaign grows into a playbook: a
-- long-term strategy with an explicit objective, an optional template it was
-- seeded from, and milestone definitions whose progress is derived live from
-- the campaign's posts. Additive; the app tolerates a pre-migration DB.

alter table public.campaigns
  add column if not exists objective text,      -- "Generate our first 100 customers"
  add column if not exists template text,       -- playbook template key (launch-product, ...)
  add column if not exists milestones jsonb;    -- [{ id, title, metric, target }]
