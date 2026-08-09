-- MarketingBoss 2.0 — graduated autonomy, gated on COST ONLY.
--
-- Strategy: early-stage marketing is exploration — confidence is structurally
-- low because nothing is proven yet, so confidence must never gate execution
-- (it would block exactly the experiments that generate the data). Credits
-- are prepaid, so cost is the one quantitative constraint the user needs.
--
-- auto_approve_max_credits: in review mode, the cron auto-publishes planned
-- posts whose estimated cost is <= this threshold (still within the playbook
-- budget) and only queues the pricier ones for approval.
--   null = ask for everything (today's review behavior; the default)
--   0    = auto-run free (text) posts
--   1    = + images, 20 = + videos, etc.
-- Full-auto mode keeps ignoring the dial (everything runs, budget-capped).

alter table public.campaigns
  add column if not exists auto_approve_max_credits int;
