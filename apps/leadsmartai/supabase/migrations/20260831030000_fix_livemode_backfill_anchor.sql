-- The livemode backfill matched nothing, so every sandbox row was flagged live.
--
-- 20260829000000 classified rows by the Stripe account marker in the object id:
--
--   update ... set livemode = false where provider_subscription_id like 'sub_%GWsoUMK2vI'
--
-- `like 'sub_%GWsoUMK2vI'` anchors that marker at the END of the string. It
-- does not sit at the end. A Stripe subscription id is
-- `sub_` + timestamp-ish + ACCOUNT MARKER + random tail, so the marker is in
-- the middle and the pattern matched zero rows. Every row then fell through to
-- the second statement and was recorded as live — including three sandbox
-- subscriptions.
--
-- The result after that migration:
--
--   live 4 · test 0 · unknown 0        (correct answer: live 1 · test 3)
--
-- Confirmed against Stripe rather than inferred. Fetching each id from the TEST
-- ledger with the test key:
--
--   sub_1U4Dz1GWsoUMK2vIqGTbGKlt   in test ledger, livemode=false, canceled
--   sub_1U4EYrGWsoUMK2vIt1ZQZOcj   in test ledger, livemode=false, ACTIVE
--   sub_1U4M3mGWsoUMK2vIyfU0DozH   in test ledger, livemode=false, canceled
--   sub_1U6w4nGWYnZnJMBHD4vmmxzn   resource_missing  -> the live one
--
-- The same marker appears in test-mode PRICE ids created against that key
-- (price_1UAAIl**GWsoUMK2vI**ZG9CrUtG), which is what identifies it as the
-- account rather than a coincidence of the id shape.
--
-- No entitlement changes. The one active sandbox row is `consumer_free`, which
-- ranks below every real plan, so the winner for that account was already
-- `crm_signature` and stays so. What this fixes is the FLAG: anything reading
-- livemode to keep sandbox data out of production reporting was being handed
-- three test subscriptions as though they were revenue.

update public.billing_subscriptions
   set livemode = false
 where provider_subscription_id like '%GWsoUMK2vI%';

update public.billing_subscriptions
   set livemode = true
 where provider_subscription_id is not null
   and provider_subscription_id not like '%GWsoUMK2vI%';

comment on column public.billing_subscriptions.livemode is
  'Stripe''s own livemode flag for this subscription. Backfilled from the Stripe ACCOUNT MARKER inside the object id (matched anywhere in the string, not anchored — see 20260831030000). NULL only where the id shape is unrecognised; readers treat NULL as unknown and keep the row, false as test-mode and exclude it.';
