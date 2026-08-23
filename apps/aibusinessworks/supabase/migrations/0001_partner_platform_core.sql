-- =============================================================================
-- AI Business Works Partner Platform - core schema
--
-- Every table is prefixed `abw_` and lives in `public`, so the platform can be
-- installed either in its own Supabase project or alongside the existing
-- PropertyToolsAI schemas without collision.
--
-- Money is stored as integer cents. Rates are stored as integer basis points
-- (2500 = 25.00%). No floating point ever touches a payable amount.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type abw_partner_status as enum ('pending', 'active', 'suspended', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_customer_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_revenue_event_type as enum
    ('new_subscription', 'renewal', 'upgrade', 'add_on', 'expansion', 'one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_commission_kind as enum ('direct', 'leadership_override');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_commission_status as enum
    ('PENDING', 'APPROVED', 'PAID', 'REVERSED', 'REFUNDED', 'CHARGEBACK');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_plan_version_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_payout_status as enum ('draft', 'approved', 'processing', 'paid', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abw_admin_role as enum ('super_admin', 'admin', 'finance', 'support');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Administrators
-- -----------------------------------------------------------------------------
create table if not exists abw_admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         abw_admin_role not null default 'admin',
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id)
);

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table if not exists abw_products (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  tagline      text,
  description  text,
  audience     text,
  site_url     text,
  learn_more_url text,
  accent       text,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Partner levels (recognition tiers, driven by active customer counts)
-- -----------------------------------------------------------------------------
create table if not exists abw_partner_levels (
  key                  text primary key,
  name                 text not null,
  description          text,
  min_active_customers int not null default 0,
  max_active_customers int,
  requires_leader_qualification boolean not null default false,
  sort_order           int not null default 0
);

-- -----------------------------------------------------------------------------
-- Partners
-- -----------------------------------------------------------------------------
create table if not exists abw_partners (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid unique references auth.users (id) on delete set null,
  partner_code          text not null unique,
  slug                  text not null unique,
  first_name            text not null,
  last_name             text not null,
  email                 text not null,
  phone                 text,
  country               text,
  state_province        text,
  business_name         text,
  industry              text,
  website               text,
  primary_market        text,
  heard_about           text,
  product_interests     text[] not null default '{}',
  status                abw_partner_status not null default 'pending',
  level_key             text references abw_partner_levels (key),
  sponsor_partner_id    uuid references abw_partners (id) on delete set null,
  sponsored_at          timestamptz,
  good_standing         boolean not null default true,
  academy_leadership_completed_at timestamptz,
  leader_qualified_at   timestamptz,
  applied_at            timestamptz not null default now(),
  approved_at           timestamptz,
  suspended_at          timestamptz,
  terminated_at         timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists abw_partners_email_idx on abw_partners (lower(email));
create index if not exists abw_partners_sponsor_idx on abw_partners (sponsor_partner_id);
create index if not exists abw_partners_status_idx on abw_partners (status);

-- -----------------------------------------------------------------------------
-- Sponsor history. The current row has effective_until = null. Sponsorship is
-- only ever changed by an explicit administrative action, which closes the open
-- row and opens a new one - the trail is never overwritten.
-- -----------------------------------------------------------------------------
create table if not exists abw_partner_relationships (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references abw_partners (id) on delete cascade,
  sponsor_partner_id uuid references abw_partners (id) on delete set null,
  generation_level   int not null default 1,
  effective_from     timestamptz not null default now(),
  effective_until    timestamptz,
  changed_by         uuid references auth.users (id),
  reason             text,
  created_at         timestamptz not null default now()
);

create index if not exists abw_partner_rel_partner_idx on abw_partner_relationships (partner_id);
create index if not exists abw_partner_rel_sponsor_idx on abw_partner_relationships (sponsor_partner_id);
create unique index if not exists abw_partner_rel_one_open_idx
  on abw_partner_relationships (partner_id) where effective_until is null;

-- -----------------------------------------------------------------------------
-- Public partner profile (the only partner data ever readable by the public,
-- and only when the partner publishes it)
-- -----------------------------------------------------------------------------
create table if not exists abw_partner_profiles (
  partner_id     uuid primary key references abw_partners (id) on delete cascade,
  headline       text,
  bio            text,
  photo_url      text,
  location       text,
  industries     text[] not null default '{}',
  product_keys   text[] not null default '{}',
  languages      text[] not null default '{}',
  website_url    text,
  booking_url    text,
  contact_email  text,
  social_links   jsonb not null default '{}'::jsonb,
  is_public      boolean not null default false,
  published_at   timestamptz,
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Referral codes and discount codes
-- -----------------------------------------------------------------------------
create table if not exists abw_referral_codes (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references abw_partners (id) on delete cascade,
  code             text not null unique,
  kind             text not null default 'referral' check (kind in ('referral', 'discount')),
  product_id       uuid references abw_products (id) on delete cascade,
  discount_bps     int check (discount_bps between 0 and 10000),
  duration_months  int,
  is_active        boolean not null default true,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists abw_referral_codes_partner_idx on abw_referral_codes (partner_id);

create table if not exists abw_referral_clicks (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  partner_id     uuid references abw_partners (id) on delete set null,
  product_key    text,
  landing_path   text,
  utm            jsonb not null default '{}'::jsonb,
  referrer       text,
  visitor_id     text,
  ip_hash        text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists abw_referral_clicks_partner_idx on abw_referral_clicks (partner_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Customers and subscriptions
-- -----------------------------------------------------------------------------
create table if not exists abw_customers (
  id                   uuid primary key default gen_random_uuid(),
  partner_id           uuid references abw_partners (id) on delete set null,
  product_id           uuid references abw_products (id) on delete set null,
  external_customer_id text,
  display_name         text not null,
  company              text,
  email                text,
  country              text,
  status               abw_customer_status not null default 'trialing',
  -- The commission clock. Set once, on first qualifying subscription.
  started_at           timestamptz not null default now(),
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists abw_customers_partner_idx on abw_customers (partner_id);
create unique index if not exists abw_customers_external_idx
  on abw_customers (product_id, external_customer_id) where external_customer_id is not null;

create table if not exists abw_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null references abw_customers (id) on delete cascade,
  product_id               uuid not null references abw_products (id),
  external_subscription_id text,
  plan_name                text,
  monthly_cents            int not null default 0,
  currency                 text not null default 'USD',
  status                   abw_subscription_status not null default 'active',
  started_at               timestamptz not null default now(),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists abw_subscriptions_customer_idx on abw_subscriptions (customer_id);
create unique index if not exists abw_subscriptions_external_idx
  on abw_subscriptions (product_id, external_subscription_id) where external_subscription_id is not null;

-- -----------------------------------------------------------------------------
-- Referral attribution. One row per attributed relationship, auditable end to
-- end: which code, which click, which customer, which subscription.
-- -----------------------------------------------------------------------------
create table if not exists abw_referrals (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references abw_partners (id) on delete cascade,
  referral_code_id  uuid references abw_referral_codes (id) on delete set null,
  customer_id       uuid references abw_customers (id) on delete set null,
  product_id        uuid references abw_products (id) on delete set null,
  subscription_id   uuid references abw_subscriptions (id) on delete set null,
  visitor_id        text,
  status            text not null default 'signed_up'
                    check (status in ('signed_up', 'converted', 'rejected', 'expired')),
  attribution_source jsonb not null default '{}'::jsonb,
  attributed_at     timestamptz not null default now(),
  converted_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists abw_referrals_partner_idx on abw_referrals (partner_id);
create unique index if not exists abw_referrals_customer_idx
  on abw_referrals (customer_id) where customer_id is not null;

-- -----------------------------------------------------------------------------
-- Compensation plans, versions and transitions
-- -----------------------------------------------------------------------------
create table if not exists abw_compensation_plans (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  description  text,
  product_id   uuid references abw_products (id) on delete cascade,
  is_default   boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id)
);

-- At most one default plan.
create unique index if not exists abw_comp_plans_single_default_idx
  on abw_compensation_plans ((is_default)) where is_default and archived_at is null;
-- At most one live plan per product.
create unique index if not exists abw_comp_plans_product_idx
  on abw_compensation_plans (product_id) where product_id is not null and archived_at is null;

create table if not exists abw_compensation_plan_versions (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references abw_compensation_plans (id) on delete cascade,
  version          int not null,
  label            text not null,
  status           abw_plan_version_status not null default 'draft',
  effective_from   date not null,
  effective_until  date,
  -- The complete rule set. Shape is validated in TypeScript (lib/compensation).
  rules            jsonb not null,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id),
  activated_at     timestamptz,
  unique (plan_id, version),
  constraint abw_plan_version_window check (effective_until is null or effective_until > effective_from)
);

create index if not exists abw_plan_versions_plan_idx
  on abw_compensation_plan_versions (plan_id, effective_from desc);

-- How customers move (or do not move) between versions.
create table if not exists abw_compensation_plan_transitions (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references abw_compensation_plans (id) on delete cascade,
  from_version_id   uuid references abw_compensation_plan_versions (id) on delete cascade,
  to_version_id     uuid not null references abw_compensation_plan_versions (id) on delete cascade,
  policy            text not null check (policy in ('grandfather', 'migrate_on_renewal', 'migrate_immediately')),
  applies_to        text not null default 'new_customers'
                    check (applies_to in ('new_customers', 'all_customers', 'selected_customers')),
  effective_on      date not null,
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id)
);

-- -----------------------------------------------------------------------------
-- Revenue events - the immutable billing facts the engine reads
-- -----------------------------------------------------------------------------
create table if not exists abw_revenue_events (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references abw_subscriptions (id) on delete cascade,
  customer_id       uuid not null references abw_customers (id) on delete cascade,
  product_id        uuid not null references abw_products (id),
  source            text not null default 'manual',
  source_event_id   text not null,
  event_type        abw_revenue_event_type not null,
  occurred_at       timestamptz not null,
  gross_cents       int not null default 0,
  tax_cents         int not null default 0,
  discount_cents    int not null default 0,
  credit_cents      int not null default 0,
  refunded_cents    int not null default 0,
  chargeback_cents  int not null default 0,
  currency          text not null default 'USD',
  raw               jsonb not null default '{}'::jsonb,
  processed_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (source, source_event_id)
);

create index if not exists abw_revenue_events_sub_idx on abw_revenue_events (subscription_id, occurred_at);
create index if not exists abw_revenue_events_unprocessed_idx
  on abw_revenue_events (created_at) where processed_at is null;

-- -----------------------------------------------------------------------------
-- Commission ledger. Append-only: amounts are never edited. A correction is a
-- new row that reverses an old one.
-- -----------------------------------------------------------------------------
create table if not exists abw_commission_transactions (
  id                        uuid primary key default gen_random_uuid(),
  partner_id                uuid not null references abw_partners (id) on delete restrict,
  kind                      abw_commission_kind not null,
  generation                int not null default 0,
  -- The partner whose customer generated this revenue (equals partner_id for direct).
  source_partner_id         uuid references abw_partners (id) on delete set null,
  customer_id               uuid references abw_customers (id) on delete set null,
  subscription_id           uuid references abw_subscriptions (id) on delete set null,
  revenue_event_id          uuid references abw_revenue_events (id) on delete set null,
  product_id                uuid references abw_products (id),
  plan_id                   uuid not null references abw_compensation_plans (id),
  plan_version_id           uuid not null references abw_compensation_plan_versions (id),
  plan_version              int not null,
  plan_effective_from       date not null,
  commission_year           int not null,
  rate_bps                  int not null,
  qualifying_revenue_cents  int not null,
  amount_cents              int not null,
  currency                  text not null default 'USD',
  status                    abw_commission_status not null default 'PENDING',
  -- Full reproduction record: explanation lines plus the exact engine inputs.
  calculation               jsonb not null default '{}'::jsonb,
  reverses_transaction_id   uuid references abw_commission_transactions (id) on delete set null,
  payout_id                 uuid,
  calculated_at             timestamptz not null default now(),
  approved_at               timestamptz,
  approved_by               uuid references auth.users (id),
  paid_at                   timestamptz,
  created_at                timestamptz not null default now()
);

create index if not exists abw_commissions_partner_idx
  on abw_commission_transactions (partner_id, status, created_at desc);
create index if not exists abw_commissions_customer_idx on abw_commission_transactions (customer_id);
create index if not exists abw_commissions_event_idx on abw_commission_transactions (revenue_event_id);
-- One commission per (event, partner, kind, generation) - the engine is idempotent.
create unique index if not exists abw_commissions_idempotency_idx
  on abw_commission_transactions (revenue_event_id, partner_id, kind, generation)
  where revenue_event_id is not null and reverses_transaction_id is null;

create table if not exists abw_commission_adjustments (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references abw_commission_transactions (id) on delete restrict,
  kind            text not null check (kind in ('reversal', 'correction', 'manual_credit', 'clawback')),
  amount_cents    int not null,
  reason          text not null,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Payouts
-- -----------------------------------------------------------------------------
create table if not exists abw_payout_batches (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  period_start  date not null,
  period_end    date not null,
  status        abw_payout_status not null default 'draft',
  total_cents   int not null default 0,
  currency      text not null default 'USD',
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create table if not exists abw_payouts (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid references abw_payout_batches (id) on delete set null,
  partner_id    uuid not null references abw_partners (id) on delete restrict,
  period_start  date not null,
  period_end    date not null,
  amount_cents  int not null,
  currency      text not null default 'USD',
  method        text,
  status        abw_payout_status not null default 'draft',
  external_reference text,
  failure_reason text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists abw_payouts_partner_idx on abw_payouts (partner_id, created_at desc);

create table if not exists abw_payout_settings (
  partner_id        uuid primary key references abw_partners (id) on delete cascade,
  method            text,
  threshold_cents   int not null default 5000,
  schedule          text not null default 'monthly',
  -- Payment details are never stored in the clear here; this holds a provider
  -- account reference only.
  provider_account_ref text,
  tax_form_status   text not null default 'not_started',
  tax_form_type     text,
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Academy
-- -----------------------------------------------------------------------------
create table if not exists abw_academy_courses (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,
  title          text not null,
  summary        text,
  track          text not null default 'foundation',
  product_key    text,
  duration_minutes int not null default 0,
  lesson_count   int not null default 0,
  is_required_for_leadership boolean not null default false,
  is_published   boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists abw_academy_lessons (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references abw_academy_courses (id) on delete cascade,
  key            text not null,
  title          text not null,
  summary        text,
  content_url    text,
  duration_minutes int not null default 0,
  sort_order     int not null default 0,
  unique (course_id, key)
);

create table if not exists abw_academy_progress (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references abw_partners (id) on delete cascade,
  course_id     uuid not null references abw_academy_courses (id) on delete cascade,
  lesson_id     uuid references abw_academy_lessons (id) on delete cascade,
  status        text not null default 'in_progress'
                check (status in ('not_started', 'in_progress', 'completed')),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);

-- NULLs are distinct in a plain unique index, so course-level progress (no
-- lesson) needs its own partial index or a partner could accumulate duplicates.
create unique index if not exists abw_academy_progress_lesson_idx
  on abw_academy_progress (partner_id, course_id, lesson_id) where lesson_id is not null;
create unique index if not exists abw_academy_progress_course_idx
  on abw_academy_progress (partner_id, course_id) where lesson_id is null;

create table if not exists abw_academy_certificates (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references abw_partners (id) on delete cascade,
  course_id     uuid not null references abw_academy_courses (id) on delete cascade,
  code          text not null unique,
  issued_at     timestamptz not null default now(),
  unique (partner_id, course_id)
);

-- -----------------------------------------------------------------------------
-- Resource library
-- -----------------------------------------------------------------------------
create table if not exists abw_resources (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,
  title          text not null,
  description    text,
  category       text not null default 'sales',
  format         text not null default 'document',
  product_key    text,
  url            text,
  is_partner_only boolean not null default true,
  is_published   boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
create table if not exists abw_announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  audience      text not null default 'all_partners',
  published_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Legal documents - editable without a rebuild, versioned, acceptance tracked
-- -----------------------------------------------------------------------------
create table if not exists abw_legal_documents (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,
  title          text not null,
  body_markdown  text not null,
  version        int not null default 1,
  effective_from date not null default current_date,
  published_at   timestamptz,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  unique (key, version)
);

create table if not exists abw_partner_agreements (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references abw_partners (id) on delete cascade,
  document_key     text not null,
  document_version int not null,
  accepted_at      timestamptz not null default now(),
  ip_hash          text,
  user_agent       text,
  unique (partner_id, document_key, document_version)
);

-- -----------------------------------------------------------------------------
-- Audit trails
-- -----------------------------------------------------------------------------
create table if not exists abw_audit_logs (
  id            bigserial primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_email   text,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before_state  jsonb,
  after_state   jsonb,
  reason        text,
  ip_hash       text,
  created_at    timestamptz not null default now()
);

create index if not exists abw_audit_logs_entity_idx on abw_audit_logs (entity_type, entity_id, created_at desc);

-- Dedicated, human-readable history of compensation changes. Deliberately
-- separate from the generic audit log: this is the record a partner-facing
-- dispute or a regulator will ask for.
create table if not exists abw_compensation_audit_log (
  id                bigserial primary key,
  admin_user_id     uuid references auth.users (id) on delete set null,
  admin_email       text,
  plan_id           uuid references abw_compensation_plans (id) on delete set null,
  plan_version_id   uuid references abw_compensation_plan_versions (id) on delete set null,
  setting_path      text not null,
  previous_value    text,
  new_value         text,
  summary           text not null,
  reason            text,
  created_at        timestamptz not null default now()
);

create index if not exists abw_comp_audit_created_idx on abw_compensation_audit_log (created_at desc);

-- -----------------------------------------------------------------------------
-- Ledger immutability. Amounts, rates and plan pointers can never be edited;
-- only workflow columns move.
-- -----------------------------------------------------------------------------
create or replace function abw_commission_transactions_guard()
returns trigger
language plpgsql
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

drop trigger if exists abw_commission_transactions_guard_trg on abw_commission_transactions;
create trigger abw_commission_transactions_guard_trg
  before update or delete on abw_commission_transactions
  for each row execute function abw_commission_transactions_guard();

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function abw_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'abw_partners', 'abw_customers', 'abw_subscriptions', 'abw_partner_profiles',
    'abw_academy_progress', 'abw_payout_settings'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function abw_touch_updated_at()',
      t, t);
  end loop;
end $$;
