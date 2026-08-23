-- =============================================================================
-- AI Business Works Partner Platform - hardening, and the plan effective date
--
-- Four corrections found by verifying the first three migrations against a live
-- database and the Supabase security advisor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan V1 was seeded with a fixed effective date of 2027-01-01, taken from
--    the worked example in the specification. A plan whose effective window has
--    not opened is invisible to `resolvePlanVersion`, so the engine would have
--    refused to calculate any commission at all until that date. Backdate it to
--    the day the platform was installed.
--
--    This is safe to run only because no commission has been calculated yet;
--    once a ledger exists, an effective date is history and is changed by
--    issuing a NEW version, never by editing one in place.
-- -----------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_plan uuid;
  v_old date;
begin
  select v.id, v.plan_id, v.effective_from
    into v_id, v_plan, v_old
  from abw_compensation_plan_versions v
  join abw_compensation_plans p on p.id = v.plan_id
  where p.key = 'default' and v.version = 1;

  if v_id is null then
    return;
  end if;

  -- Refuse to touch it if anything has already been priced under this version.
  if exists (select 1 from abw_commission_transactions where plan_version_id = v_id) then
    raise notice 'Plan version % already has commissions; leaving effective_from at %', v_id, v_old;
    return;
  end if;

  if v_old <= current_date then
    return;
  end if;

  update abw_compensation_plan_versions
     set effective_from = current_date
   where id = v_id;

  insert into abw_compensation_audit_log
    (plan_id, plan_version_id, setting_path, previous_value, new_value, summary, reason)
  values
    (v_plan, v_id, 'version.effective_from', v_old::text, current_date::text,
     format('Plan V1 effective date moved from %s to %s.', v_old, current_date),
     'The seeded date was in the future, which left the commission engine with no active plan version. No commissions existed under this version.');
end $$;

-- -----------------------------------------------------------------------------
-- 2. RLS was forced on abw_compensation_plan_transitions but no policy was
--    written, so it was readable by nobody. Transition rules are administrative.
-- -----------------------------------------------------------------------------
drop policy if exists abw_plan_transitions_admin on abw_compensation_plan_transitions;
create policy abw_plan_transitions_admin on abw_compensation_plan_transitions
  for all using (abw_is_admin()) with check (abw_is_admin());

-- -----------------------------------------------------------------------------
-- 3. Pin search_path on the trigger functions. Without it the resolution order
--    follows the caller's search_path, which is a (small) hijack surface on
--    functions that guard the commission ledger.
-- -----------------------------------------------------------------------------
create or replace function abw_commission_transactions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Commission transactions are append-only; create a reversal instead of deleting %', old.id;
  end if;

  if old.amount_cents is distinct from new.amount_cents
     or old.rate_bps is distinct from new.rate_bps
     or old.qualifying_revenue_cents is distinct from new.qualifying_revenue_cents
     or old.plan_version_id is distinct from new.plan_version_id
     or old.commission_year is distinct from new.commission_year
     or old.partner_id is distinct from new.partner_id
     or old.revenue_event_id is distinct from new.revenue_event_id
     or old.calculation is distinct from new.calculation then
    raise exception 'Commission % is immutable; post an adjustment or reversal instead', old.id;
  end if;

  return new;
end;
$$;

create or replace function abw_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Drop abw_can_see_partner. It was written as a helper, never referenced by
--    any policy or by the application, and an unused SECURITY DEFINER function
--    reachable over /rest/v1/rpc is surface for nothing.
--
--    abw_is_admin() and abw_current_partner_id() deliberately KEEP their grant
--    to anon: policies on the publicly readable tables (products, plan versions,
--    legal documents, academy courses, resources) reference them, so an
--    anonymous visitor must be able to evaluate them or every public page
--    breaks. Verified against a live database - as anon they return false and
--    null respectively and expose nothing.
-- -----------------------------------------------------------------------------
drop function if exists abw_can_see_partner(uuid);
