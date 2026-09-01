-- One source of truth for "what plan is this account on": billing_subscriptions.
--
-- Four columns recorded a plan and they disagreed. On agent 26 — the only
-- paying account — they read `pro`, `premium`, `premium`, and `crm_signature`.
-- Each was written by a different generation of the billing code and none was
-- retired, so a feature gate got a different answer depending which column it
-- happened to reach for.
--
-- `billing_subscriptions` wins because it is the only one written from Stripe
-- with the provider ids, amount and period attached — it is the money. The rest
-- become caches or go away:
--
--   agents.subscription_plan   DROPPED. No code has written it in a year; the
--                              only reader was the containment layer added to
--                              cope with this mess.
--   agents.plan_type           kept as a 3-value display cache, backfilled from
--                              the billing row. No longer gates anything.
--   leadsmart_users.plan       same.
--
-- Three separate defects also let one user hold two `active` rows at once, and
-- all three are addressed here and in the write path:
--
--   1. Stripe TEST-mode events land in this production table alongside live
--      ones and nothing recorded which was which. Fixed by `livemode`.
--   2. Nothing supersedes a prior row when a new subscription starts. Fixed in
--      `stripeSubscriptionSync.reconcileSiblingSubscriptions`, which re-reads
--      each sibling FROM STRIPE rather than guessing.
--   3. `public.subscriptions` has a PARTIAL unique index on
--      `stripe_subscription_id`, which Postgres will not accept as an
--      `ON CONFLICT` target (42P10). Every write to that table since it was
--      created has thrown, which is why it is empty, why the entitlement sync
--      that runs after it never ran, and why gating fell through to
--      `agents.plan_type`. Fixed below.
--
-- NOTHING HERE CHANGES WHAT ANYONE PAYS. No Stripe object is touched and no
-- `billing_subscriptions.status` is altered; only the derived caches are
-- brought into line with the billing rows that already exist.

-- ── 1. Record which Stripe ledger a row came from ────────────────────────────

alter table if exists public.billing_subscriptions
  add column if not exists livemode boolean;

comment on column public.billing_subscriptions.livemode is
  'Stripe''s own livemode flag for this subscription. NULL on rows written before the column existed; readers treat NULL as unknown and keep the row, and false as test-mode and exclude it. See lib/billing/currentPlan.ts.';

-- Backfill from the Stripe object id prefix. Test and live objects come from
-- different Stripe accounts here, and the account is encoded in the id suffix,
-- so this is a fact about the row rather than an inference about the customer.
-- Left NULL where the id shape is unrecognised — better unknown than wrong.
update public.billing_subscriptions
   set livemode = false
 where livemode is null
   and provider_subscription_id like 'sub_%GWsoUMK2vI';

update public.billing_subscriptions
   set livemode = true
 where livemode is null
   and provider_subscription_id is not null
   and provider_subscription_id not like 'sub_%GWsoUMK2vI';

create index if not exists idx_billing_subscriptions_user_livemode_status
  on public.billing_subscriptions (user_id, livemode, status);

-- ── 2. Make public.subscriptions writable again ──────────────────────────────
-- A partial unique index cannot serve as an ON CONFLICT target unless the
-- statement repeats its predicate, which PostgREST's upsert does not do. Swap
-- it for a plain unique index: NULLs are still distinct in Postgres, so the
-- rows the partial predicate was protecting are unaffected.

drop index if exists public.idx_subscriptions_stripe_subscription_id;

create unique index if not exists idx_subscriptions_stripe_subscription_id
  on public.subscriptions (stripe_subscription_id);

-- ── 3. Retire the fossil column ──────────────────────────────────────────────

alter table if exists public.agents
  drop column if exists subscription_plan;

-- ── 4. Bring the caches into line with the billing rows ──────────────────────
-- Derived, not decided: each account's plan_type / plan is recomputed from its
-- own highest-ranked entitling billing row. An account with no such row becomes
-- 'free', which is what it already was entitled to — the caches simply said
-- otherwise.

with ranked as (
  select
    bs.user_id,
    bs.plan,
    row_number() over (
      partition by bs.user_id
      order by
        case bs.plan
          when 'crm_team'       then 5
          when 'crm_signature'  then 4
          when 'crm_premium'    then 3
          when 'agent_pro'      then 3
          when 'crm_pro'        then 2
          when 'agent_starter'  then 2
          when 'loan_broker_pro' then 2
          when 'crm_starter'    then 1
          else 0
        end desc,
        bs.current_period_start desc nulls last
    ) as rn
  from public.billing_subscriptions bs
  where bs.status in ('active', 'trialing')
    and coalesce(bs.livemode, true) is true
    and (bs.current_period_end is null or bs.current_period_end > now())
),
winner as (
  select user_id, plan from ranked where rn = 1
),
cache as (
  select
    w.user_id,
    case
      when w.plan in ('crm_team', 'crm_signature', 'crm_premium', 'agent_pro') then 'premium'
      when w.plan in ('crm_pro', 'agent_starter', 'loan_broker_pro')           then 'pro'
      else 'free'
    end as plan_cache
  from winner w
)
update public.agents a
   set plan_type = coalesce(c.plan_cache, 'free')
  from (select a2.id, a2.auth_user_id from public.agents a2) src
  left join cache c on c.user_id = src.auth_user_id
 where a.id = src.id
   and a.plan_type is distinct from coalesce(c.plan_cache, 'free');

with ranked as (
  select
    bs.user_id,
    bs.plan,
    row_number() over (
      partition by bs.user_id
      order by
        case bs.plan
          when 'crm_team'       then 5
          when 'crm_signature'  then 4
          when 'crm_premium'    then 3
          when 'agent_pro'      then 3
          when 'crm_pro'        then 2
          when 'agent_starter'  then 2
          when 'loan_broker_pro' then 2
          when 'crm_starter'    then 1
          else 0
        end desc,
        bs.current_period_start desc nulls last
    ) as rn
  from public.billing_subscriptions bs
  where bs.status in ('active', 'trialing')
    and coalesce(bs.livemode, true) is true
    and (bs.current_period_end is null or bs.current_period_end > now())
),
winner as (
  select user_id, plan from ranked where rn = 1
),
cache as (
  select
    w.user_id,
    case
      when w.plan in ('crm_team', 'crm_signature', 'crm_premium', 'agent_pro') then 'premium'
      when w.plan in ('crm_pro', 'agent_starter', 'loan_broker_pro')           then 'pro'
      else 'free'
    end as plan_cache
  from winner w
)
update public.leadsmart_users lu
   set plan = coalesce(c.plan_cache, 'free'),
       updated_at = now()
  from (select lu2.user_id from public.leadsmart_users lu2) src
  left join cache c on c.user_id = src.user_id
 where lu.user_id = src.user_id
   and lu.plan is distinct from coalesce(c.plan_cache, 'free');

comment on column public.agents.plan_type is
  'DERIVED display cache (free/pro/premium) of the account''s billing_subscriptions row. Not authoritative — gate on getActiveCrmSubscription().';

comment on column public.leadsmart_users.plan is
  'DERIVED display cache (free/pro/premium) of the account''s billing_subscriptions row. Not authoritative — gate on getActiveCrmSubscription().';
