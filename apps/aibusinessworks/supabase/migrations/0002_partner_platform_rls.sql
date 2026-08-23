-- =============================================================================
-- AI Business Works Partner Platform - row level security
--
-- Principle: a partner sees their own customers, their own commissions, the
-- roster of partners they personally sponsor, and nothing else. No partner can
-- read another partner's financial data through any path.
--
-- Note on policy composition: PostgreSQL ORs permissive policies together, so
-- every public-read policy below is scoped to data that is public by design
-- (products, levels, the published compensation plan, opted-in profiles). No
-- table that carries money or personal data gets an anon policy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers (security definer so they can read the mapping tables under RLS)
-- -----------------------------------------------------------------------------
create or replace function abw_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from abw_admin_users a where a.user_id = auth.uid());
$$;

create or replace function abw_current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from abw_partners p where p.user_id = auth.uid() limit 1;
$$;

/** True when `target` is the caller, or a partner the caller personally sponsors. */
create or replace function abw_can_see_partner(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = abw_current_partner_id()
      or exists (
        select 1 from abw_partners p
        where p.id = target and p.sponsor_partner_id = abw_current_partner_id()
      );
$$;

grant execute on function abw_is_admin() to authenticated;
grant execute on function abw_current_partner_id() to authenticated;
grant execute on function abw_can_see_partner(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere. Nothing is readable until a policy says so.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'abw_admin_users', 'abw_products', 'abw_partner_levels', 'abw_partners',
    'abw_partner_relationships', 'abw_partner_profiles', 'abw_referral_codes',
    'abw_referral_clicks', 'abw_customers', 'abw_subscriptions', 'abw_referrals',
    'abw_compensation_plans', 'abw_compensation_plan_versions',
    'abw_compensation_plan_transitions', 'abw_revenue_events',
    'abw_commission_transactions', 'abw_commission_adjustments',
    'abw_payout_batches', 'abw_payouts', 'abw_payout_settings',
    'abw_academy_courses', 'abw_academy_lessons', 'abw_academy_progress',
    'abw_academy_certificates', 'abw_resources', 'abw_announcements',
    'abw_legal_documents', 'abw_partner_agreements', 'abw_audit_logs',
    'abw_compensation_audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Public reference data (safe for anonymous visitors)
-- -----------------------------------------------------------------------------
drop policy if exists abw_products_read on abw_products;
create policy abw_products_read on abw_products
  for select using (is_active or abw_is_admin());

drop policy if exists abw_levels_read on abw_partner_levels;
create policy abw_levels_read on abw_partner_levels
  for select using (true);

-- The compensation plan is published marketing content; drafts are not.
drop policy if exists abw_plans_read on abw_compensation_plans;
create policy abw_plans_read on abw_compensation_plans
  for select using (archived_at is null or abw_is_admin());

drop policy if exists abw_plan_versions_read on abw_compensation_plan_versions;
create policy abw_plan_versions_read on abw_compensation_plan_versions
  for select using (status = 'active' or abw_is_admin());

drop policy if exists abw_legal_read on abw_legal_documents;
create policy abw_legal_read on abw_legal_documents
  for select using (published_at is not null or abw_is_admin());

drop policy if exists abw_courses_read on abw_academy_courses;
create policy abw_courses_read on abw_academy_courses
  for select using (is_published or abw_is_admin());

drop policy if exists abw_lessons_read on abw_academy_lessons;
create policy abw_lessons_read on abw_academy_lessons
  for select using (
    exists (select 1 from abw_academy_courses c where c.id = course_id and c.is_published)
    or abw_is_admin()
  );

-- Public resources are readable by anyone; partner-only resources require an
-- active partner account.
drop policy if exists abw_resources_read on abw_resources;
create policy abw_resources_read on abw_resources
  for select using (
    (is_published and not is_partner_only)
    or (
      is_published
      and exists (
        select 1 from abw_partners p
        where p.user_id = auth.uid() and p.status = 'active'
      )
    )
    or abw_is_admin()
  );

-- Published partner profiles are the directory. They carry no financial data.
drop policy if exists abw_profiles_public_read on abw_partner_profiles;
create policy abw_profiles_public_read on abw_partner_profiles
  for select using (
    (is_public and exists (
      select 1 from abw_partners p where p.id = partner_id and p.status = 'active'
    ))
    or partner_id = abw_current_partner_id()
    or abw_is_admin()
  );

drop policy if exists abw_profiles_self_write on abw_partner_profiles;
create policy abw_profiles_self_write on abw_partner_profiles
  for all
  using (partner_id = abw_current_partner_id() or abw_is_admin())
  with check (partner_id = abw_current_partner_id() or abw_is_admin());

-- -----------------------------------------------------------------------------
-- Partners
--
-- A partner reads their own row. A partner also reads the rows of partners they
-- personally sponsor - the Direct Partner roster - but the columns that matter
-- financially live on other tables, which stay closed.
-- -----------------------------------------------------------------------------
drop policy if exists abw_partners_read on abw_partners;
create policy abw_partners_read on abw_partners
  for select using (
    user_id = auth.uid()
    or sponsor_partner_id = abw_current_partner_id()
    or abw_is_admin()
  );

-- NOTE: there is deliberately NO public policy on abw_partners. Permissive
-- policies are OR'd together, so a "readable when they published a profile"
-- clause here would expose the whole row - email, phone, partner code - to
-- anyone. The public directory reads the view below instead, which exposes only
-- the columns a partner chose to publish.

-- Partners may edit contact details on their own row. Status, sponsor, level and
-- standing are administrative and are written with the service role only.
drop policy if exists abw_partners_self_update on abw_partners;
create policy abw_partners_self_update on abw_partners
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists abw_partners_admin_all on abw_partners;
create policy abw_partners_admin_all on abw_partners
  for all using (abw_is_admin()) with check (abw_is_admin());

drop policy if exists abw_partner_rel_read on abw_partner_relationships;
create policy abw_partner_rel_read on abw_partner_relationships
  for select using (
    partner_id = abw_current_partner_id()
    or sponsor_partner_id = abw_current_partner_id()
    or abw_is_admin()
  );

-- -----------------------------------------------------------------------------
-- Referral codes and clicks
-- -----------------------------------------------------------------------------
drop policy if exists abw_referral_codes_own on abw_referral_codes;
create policy abw_referral_codes_own on abw_referral_codes
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

drop policy if exists abw_referral_codes_admin on abw_referral_codes;
create policy abw_referral_codes_admin on abw_referral_codes
  for all using (abw_is_admin()) with check (abw_is_admin());

drop policy if exists abw_referral_clicks_own on abw_referral_clicks;
create policy abw_referral_clicks_own on abw_referral_clicks
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

drop policy if exists abw_referrals_own on abw_referrals;
create policy abw_referrals_own on abw_referrals
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

-- -----------------------------------------------------------------------------
-- Customers and subscriptions - own customers only
-- -----------------------------------------------------------------------------
drop policy if exists abw_customers_own on abw_customers;
create policy abw_customers_own on abw_customers
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

drop policy if exists abw_customers_admin on abw_customers;
create policy abw_customers_admin on abw_customers
  for all using (abw_is_admin()) with check (abw_is_admin());

drop policy if exists abw_subscriptions_own on abw_subscriptions;
create policy abw_subscriptions_own on abw_subscriptions
  for select using (
    exists (
      select 1 from abw_customers c
      where c.id = customer_id and c.partner_id = abw_current_partner_id()
    )
    or abw_is_admin()
  );

-- Raw billing events are administrative. Partners see the commission, not the
-- customer's invoice.
drop policy if exists abw_revenue_events_admin on abw_revenue_events;
create policy abw_revenue_events_admin on abw_revenue_events
  for all using (abw_is_admin()) with check (abw_is_admin());

-- -----------------------------------------------------------------------------
-- Commission ledger - strictly own rows
-- -----------------------------------------------------------------------------
drop policy if exists abw_commissions_own on abw_commission_transactions;
create policy abw_commissions_own on abw_commission_transactions
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

-- Writes are service-role only (the engine) or admin. No partner-writable path
-- to the ledger exists.
drop policy if exists abw_commissions_admin on abw_commission_transactions;
create policy abw_commissions_admin on abw_commission_transactions
  for all using (abw_is_admin()) with check (abw_is_admin());

drop policy if exists abw_commission_adj_read on abw_commission_adjustments;
create policy abw_commission_adj_read on abw_commission_adjustments
  for select using (
    exists (
      select 1 from abw_commission_transactions t
      where t.id = transaction_id and t.partner_id = abw_current_partner_id()
    )
    or abw_is_admin()
  );

drop policy if exists abw_commission_adj_admin on abw_commission_adjustments;
create policy abw_commission_adj_admin on abw_commission_adjustments
  for all using (abw_is_admin()) with check (abw_is_admin());

-- -----------------------------------------------------------------------------
-- Payouts
-- -----------------------------------------------------------------------------
drop policy if exists abw_payouts_own on abw_payouts;
create policy abw_payouts_own on abw_payouts
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

drop policy if exists abw_payouts_admin on abw_payouts;
create policy abw_payouts_admin on abw_payouts
  for all using (abw_is_admin()) with check (abw_is_admin());

drop policy if exists abw_payout_batches_admin on abw_payout_batches;
create policy abw_payout_batches_admin on abw_payout_batches
  for all using (abw_is_admin()) with check (abw_is_admin());

drop policy if exists abw_payout_settings_own on abw_payout_settings;
create policy abw_payout_settings_own on abw_payout_settings
  for all
  using (partner_id = abw_current_partner_id() or abw_is_admin())
  with check (partner_id = abw_current_partner_id() or abw_is_admin());

-- -----------------------------------------------------------------------------
-- Academy progress and certificates
-- -----------------------------------------------------------------------------
drop policy if exists abw_progress_own on abw_academy_progress;
create policy abw_progress_own on abw_academy_progress
  for all
  using (partner_id = abw_current_partner_id() or abw_is_admin())
  with check (partner_id = abw_current_partner_id() or abw_is_admin());

drop policy if exists abw_certificates_own on abw_academy_certificates;
create policy abw_certificates_own on abw_academy_certificates
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

-- -----------------------------------------------------------------------------
-- Announcements, agreements, audit
-- -----------------------------------------------------------------------------
drop policy if exists abw_announcements_read on abw_announcements;
create policy abw_announcements_read on abw_announcements
  for select using (
    (published_at is not null and (expires_at is null or expires_at > now())
      and abw_current_partner_id() is not null)
    or abw_is_admin()
  );

drop policy if exists abw_agreements_own on abw_partner_agreements;
create policy abw_agreements_own on abw_partner_agreements
  for select using (partner_id = abw_current_partner_id() or abw_is_admin());

drop policy if exists abw_audit_admin on abw_audit_logs;
create policy abw_audit_admin on abw_audit_logs
  for select using (abw_is_admin());

-- The compensation change history is deliberately visible to every partner:
-- transparency about the plan they are compensated under.
drop policy if exists abw_comp_audit_read on abw_compensation_audit_log;
create policy abw_comp_audit_read on abw_compensation_audit_log
  for select using (abw_current_partner_id() is not null or abw_is_admin());

drop policy if exists abw_admin_users_self on abw_admin_users;
create policy abw_admin_users_self on abw_admin_users
  for select using (user_id = auth.uid() or abw_is_admin());

-- -----------------------------------------------------------------------------
-- Public partner directory
--
-- A definer-rights view is the whole security boundary for the directory: it
-- selects the safe columns only, and its WHERE clause decides which partners
-- appear. Nothing here can leak a partner's email, phone, partner code,
-- sponsor, standing or any financial field, because those columns are not in
-- the projection at all.
-- -----------------------------------------------------------------------------
drop view if exists abw_public_partners;
create view abw_public_partners
with (security_barrier = true) as
select
  p.id            as partner_id,
  p.slug,
  p.first_name,
  p.last_name,
  p.level_key,
  pr.headline,
  pr.bio,
  pr.photo_url,
  pr.location,
  pr.industries,
  pr.product_keys,
  pr.languages,
  pr.website_url,
  pr.booking_url,
  pr.contact_email,
  pr.social_links,
  pr.published_at
from abw_partner_profiles pr
join abw_partners p on p.id = pr.partner_id
where pr.is_public
  and p.status = 'active';

grant select on abw_public_partners to anon, authenticated;
