-- Clear legacy subscription records.
--
-- CloseBoss moved to usage-based pricing (credits are the only gate), so the
-- old tier bookkeeping is now both meaningless and misleading: accounts still
-- carried `plan = 'premium'` / `subscription_status = 'active'` from the old
-- system despite having no Stripe subscription behind them, which made the app
-- (and us) report a paid plan that doesn't exist.
--
-- No real subscribers exist at this point — the `subscriptions` and
-- `subscription_events` tables are empty and every Stripe subscription in the
-- account is canceled — so this only removes stale state.
--
-- `stripe_customer_id` is deliberately KEPT: a customer is not a subscription,
-- and it's what lets an existing user reach the Stripe billing portal.

update public.leadsmart_users
   set plan = 'free',
       subscription_status = null,
       stripe_subscription_id = null,
       subscription_current_period_start = null,
       subscription_current_period_end = null,
       -- NOT NULL column: reset to false rather than null.
       subscription_cancel_at_period_end = false,
       updated_at = now()
 where subscription_status is not null
    or stripe_subscription_id is not null
    or plan <> 'free';

-- agents.plan_type drove the old feature gates; everything is included now.
update public.agents
   set plan_type = 'free'
 where plan_type is distinct from 'free';
