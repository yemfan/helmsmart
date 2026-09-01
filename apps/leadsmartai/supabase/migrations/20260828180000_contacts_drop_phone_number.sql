-- contacts: one phone column.
--
-- The table carried the same fact in `phone` and `phone_number` with nothing
-- keeping them in step, so which one a row had filled in depended on which
-- screen or import created it. Code reading one column decided some contacts
-- had no number at all: the draft sender failed messages for "no phone number"
-- while a good +1626555xxxx sat in the column it did not read, and the sphere
-- drip skipped the same rows as "missing_field".
--
-- 20260828170000 made the pair agree with a sync trigger. That stopped the
-- bleeding but left the trap in place — two columns, one fact, and the next
-- person to read only one of them hits the same wall. `phone` wins because it
-- is the original, and because the code says so: 2,188 references against 201.
--
-- The application no longer mentions `contacts.phone_number` anywhere. This
-- must therefore be applied only AFTER that code is deployed: a select naming a
-- dropped column fails with 42703 and takes the whole query down with it, which
-- is exactly the failure this whole effort has been chasing.
--
-- `leads` and `sphere_contacts` are plain views over `contacts` and both listed
-- the column, so they are rebuilt without it. A view cannot lose a column via
-- CREATE OR REPLACE, hence the drop and recreate — grants and the sphere insert
-- redirect are restored below exactly as they were. Neither view sets
-- security_invoker today; that is left unchanged so RLS behaviour does not move
-- as a side effect of this migration.

-- 1. Take down the dependents.
drop trigger if exists sphere_contacts_insert_redirect on public.sphere_contacts;
drop view if exists public.sphere_contacts;
drop view if exists public.leads;

-- 2. The sync trigger has nothing left to sync.
drop trigger if exists trg_contacts_sync_phone on public.contacts;
drop function if exists public.sync_contacts_phone_fields();

-- 3. The column itself. Every row already carries the same value in `phone`,
--    backfilled both directions by 20260828170000.
alter table public.contacts drop column if exists phone_number;

-- 4. Rebuild the views, minus the column.
create view public.leads as
select
  id,
  agent_id,
  lifecycle_stage,
  name,
  first_name,
  last_name,
  email,
  phone,
  address,
  property_address,
  closing_address,
  city,
  state,
  source,
  rating,
  notes,
  lead_status,
  engagement_score,
  nurture_score,
  intent,
  last_activity_at,
  last_contacted_at,
  next_contact_at,
  contact_frequency,
  contact_method,
  lead_type,
  stage,
  search_location,
  search_radius,
  price_min,
  price_max,
  beds,
  baths,
  prediction_score,
  prediction_label,
  prediction_factors,
  prediction_computed_at,
  automation_disabled,
  report_id,
  property_id,
  closing_date,
  closing_price,
  avm_current,
  avm_updated_at,
  relationship_type,
  relationship_tag,
  anniversary_opt_in,
  preferred_language,
  do_not_contact_sms,
  do_not_contact_email,
  tcpa_consent_at,
  tcpa_consent_source,
  tcpa_consent_ip,
  sms_opt_in,
  sms_ai_enabled,
  sms_agent_takeover,
  sms_followup_stage,
  sms_last_outbound_at,
  sms_last_inbound_at,
  pipeline_stage_id,
  avatar_color,
  created_at,
  updated_at,
  full_address,
  zip_code,
  estimated_home_value,
  source_session_id,
  estimate_high,
  estimate_low,
  confidence,
  confidence_score,
  email_domain,
  lead_quality,
  source_detail,
  buying_or_selling,
  timeline,
  traffic_source,
  tool_used,
  status
from public.contacts;

create view public.sphere_contacts as
select
  id,
  agent_id,
  lifecycle_stage,
  name,
  first_name,
  last_name,
  email,
  phone,
  address,
  property_address,
  closing_address,
  city,
  state,
  source,
  rating,
  notes,
  lead_status,
  engagement_score,
  nurture_score,
  intent,
  last_activity_at,
  last_contacted_at,
  next_contact_at,
  contact_frequency,
  contact_method,
  lead_type,
  stage,
  search_location,
  search_radius,
  price_min,
  price_max,
  beds,
  baths,
  prediction_score,
  prediction_label,
  prediction_factors,
  prediction_computed_at,
  automation_disabled,
  report_id,
  property_id,
  closing_date,
  closing_price,
  avm_current,
  avm_updated_at,
  relationship_type,
  relationship_tag,
  anniversary_opt_in,
  preferred_language,
  do_not_contact_sms,
  do_not_contact_email,
  tcpa_consent_at,
  tcpa_consent_source,
  tcpa_consent_ip,
  sms_opt_in,
  sms_ai_enabled,
  sms_agent_takeover,
  sms_followup_stage,
  sms_last_outbound_at,
  sms_last_inbound_at,
  pipeline_stage_id,
  avatar_color,
  created_at,
  updated_at,
  full_address,
  zip_code,
  estimated_home_value,
  source_session_id,
  estimate_high,
  estimate_low,
  confidence,
  confidence_score,
  email_domain,
  lead_quality,
  source_detail,
  buying_or_selling,
  timeline,
  traffic_source,
  tool_used,
  status
from public.contacts
where lifecycle_stage = any (array['past_client'::text, 'sphere'::text, 'referral_source'::text]);

-- 5. Restore the grants the dropped views had.
grant select, insert, update, delete, truncate, references, trigger
  on public.leads to anon, authenticated, service_role, postgres;
grant select, insert, update, delete, truncate, references, trigger
  on public.sphere_contacts to anon, authenticated, service_role, postgres;

-- 6. Restore the sphere insert redirect, minus the column.
create or replace function public.sphere_contacts_insert_redirect()
returns trigger
language plpgsql
as $function$
declare
  resolved_stage text;
begin
  resolved_stage := case
    when new.lifecycle_stage is not null then new.lifecycle_stage
    when new.relationship_type in ('past_buyer','past_seller','past_both') then 'past_client'
    when new.relationship_type = 'referral_source' then 'referral_source'
    else 'sphere'
  end;

  insert into public.contacts (
    agent_id, lifecycle_stage,
    name, first_name, last_name, email, phone,
    address, property_address, closing_address, city, state, zip_code,
    source, rating, notes, lead_status, status,
    engagement_score, nurture_score, intent,
    last_activity_at, last_contacted_at, next_contact_at,
    contact_frequency, contact_method, lead_type, stage,
    search_location, price_min, price_max, beds, baths,
    closing_date, closing_price, avm_current, avm_updated_at,
    relationship_type, relationship_tag, anniversary_opt_in,
    preferred_language, do_not_contact_sms, do_not_contact_email,
    tcpa_consent_at, tcpa_consent_source, tcpa_consent_ip,
    sms_opt_in, sms_ai_enabled, sms_agent_takeover,
    full_address, estimated_home_value, source_session_id,
    avatar_color
  ) values (
    new.agent_id, resolved_stage,
    new.name, new.first_name, new.last_name, new.email, new.phone,
    new.address, new.property_address, new.closing_address, new.city, new.state, new.zip_code,
    new.source, new.rating, new.notes, new.lead_status, new.status,
    coalesce(new.engagement_score, 0), new.nurture_score, new.intent,
    new.last_activity_at, new.last_contacted_at, new.next_contact_at,
    new.contact_frequency, new.contact_method, new.lead_type, new.stage,
    new.search_location, new.price_min, new.price_max, new.beds, new.baths,
    new.closing_date, new.closing_price, new.avm_current, new.avm_updated_at,
    new.relationship_type, new.relationship_tag, coalesce(new.anniversary_opt_in, false),
    coalesce(new.preferred_language, 'en'),
    coalesce(new.do_not_contact_sms, false), coalesce(new.do_not_contact_email, false),
    new.tcpa_consent_at, new.tcpa_consent_source, new.tcpa_consent_ip,
    coalesce(new.sms_opt_in, false), coalesce(new.sms_ai_enabled, true),
    coalesce(new.sms_agent_takeover, false),
    new.full_address, new.estimated_home_value, new.source_session_id,
    new.avatar_color
  );
  return new;
end
$function$;

create trigger sphere_contacts_insert_redirect
  instead of insert on public.sphere_contacts
  for each row execute function public.sphere_contacts_insert_redirect();
