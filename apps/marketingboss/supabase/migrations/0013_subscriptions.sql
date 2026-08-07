-- Subscriptions — recurring monthly credit plans on top of the one-time packs.
-- Credits are granted per PAID INVOICE, deduped by invoice id so a webhook
-- retry (or overlapping delivery) can never double-grant.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text,                       -- creator | pro | studio
  status text,                     -- active | canceled | past_due | ...
  credits_per_month int,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
-- Read-only for the owner; the webhook (service role) is the only writer.
create policy "own subscription read" on public.subscriptions
  for select using (user_id = auth.uid());

-- Idempotency ledger: one row per paid invoice we've already credited.
create table if not exists public.subscription_grants (
  invoice_id text primary key,
  user_id uuid not null,
  credits int not null,
  granted_at timestamptz not null default now()
);
alter table public.subscription_grants enable row level security;  -- no policies → service-role only

-- Grant a subscription's monthly credits exactly once per invoice. Returns the
-- resulting balance. Safe to call repeatedly for the same invoice.
create or replace function public.grant_subscription_credits(p_user uuid, p_credits int, p_invoice text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_balance int;
begin
  insert into public.subscription_grants (invoice_id, user_id, credits)
    values (p_invoice, p_user, p_credits)
    on conflict (invoice_id) do nothing;
  if not found then
    -- Already granted for this invoice — return the current balance, no change.
    select credits into v_balance from public.profiles where user_id = p_user;
    return v_balance;
  end if;
  update public.profiles set credits = credits + p_credits, updated_at = now()
    where user_id = p_user
    returning credits into v_balance;
  return v_balance;
end;
$$;

revoke all on function public.grant_subscription_credits(uuid, int, text) from public, anon, authenticated;
grant execute on function public.grant_subscription_credits(uuid, int, text) to service_role;
