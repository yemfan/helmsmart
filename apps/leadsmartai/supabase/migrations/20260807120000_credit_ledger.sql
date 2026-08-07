-- Credit ledger — the unified usage currency for CloseBoss.
--
-- CloseBoss is moving to a usage-based model ("everything included, pay for
-- what you use"): every real-cost AI action (voice minutes, video/image
-- generation, swap, CTA, twin) spends from ONE credit balance. This is a new
-- wallet, separate from the plan-quota `tokens_remaining` and referral
-- `bonus_tokens`, so those keep their existing meaning while the credit meter
-- becomes the single thing all AI usage draws down.
--
-- Balance lives on `leadsmart_users` (the per-account billing table) alongside
-- the existing wallets; every change is also written to an append-only
-- `credit_ledger` for auditability + idempotent grants (Stripe top-ups, monthly
-- grants). Mutations happen only through the SECURITY DEFINER functions below,
-- called server-side with the service role (mirrors consume_tokens / the
-- adminUsage metering path — CloseBoss resolves the user id server-side and
-- never mutates wallets from a session client).

-- 1. The balance ------------------------------------------------------------
alter table public.leadsmart_users
  add column if not exists credits integer not null default 0;

-- 2. The append-only ledger -------------------------------------------------
create table if not exists public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profiles(user_id) on delete cascade,
  amount        integer not null,            -- signed: +grant/refund, -spend
  reason        text not null,               -- 'signup','topup','monthly_grant','voice','video','image','swap','cta','refund','admin', ...
  ref           text,                        -- idempotency key (e.g. stripe session/invoice id)
  balance_after integer not null,
  created_at    timestamptz not null default now()
);

-- One ledger row per idempotency key (grants dedupe on this).
create unique index if not exists uq_credit_ledger_ref
  on public.credit_ledger (ref) where ref is not null;
create index if not exists idx_credit_ledger_user
  on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

-- Owners may read their own ledger; all writes go through the definer functions
-- (service-role) below — there is deliberately no INSERT/UPDATE policy.
drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select using (user_id = auth.uid());

-- 3. Spend (and refund) -----------------------------------------------------
-- p_cost > 0 spends (returns new balance, or -1 if insufficient / no user).
-- p_cost < 0 refunds (always applied). Row-locked for concurrency safety.
create or replace function public.deduct_credits(
  p_user   uuid,
  p_cost   integer,
  p_reason text default 'usage'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal integer;
begin
  select credits into v_bal from public.leadsmart_users where user_id = p_user for update;
  if v_bal is null then
    return -1; -- no such account
  end if;
  if p_cost > 0 and v_bal < p_cost then
    return -1; -- insufficient credits
  end if;

  update public.leadsmart_users
     set credits = credits - p_cost,
         updated_at = now()
   where user_id = p_user
   returning credits into v_bal;

  insert into public.credit_ledger (user_id, amount, reason, balance_after)
  values (p_user, -p_cost, p_reason, v_bal);

  return v_bal;
end;
$$;

-- 4. Grant (idempotent on p_ref) --------------------------------------------
-- Adds credits (Stripe top-up, monthly grant, admin, signup). When p_ref is
-- supplied and already recorded, this is a no-op that returns the current
-- balance — so a webhook can safely fire more than once.
create or replace function public.grant_credits(
  p_user   uuid,
  p_amount integer,
  p_reason text,
  p_ref    text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal integer;
begin
  if p_ref is not null and exists (select 1 from public.credit_ledger where ref = p_ref) then
    select credits into v_bal from public.leadsmart_users where user_id = p_user;
    return coalesce(v_bal, -1);
  end if;

  update public.leadsmart_users
     set credits = credits + p_amount,
         updated_at = now()
   where user_id = p_user
   returning credits into v_bal;

  if v_bal is null then
    return -1; -- no such account
  end if;

  insert into public.credit_ledger (user_id, amount, reason, ref, balance_after)
  values (p_user, p_amount, p_reason, p_ref, v_bal);

  return v_bal;
end;
$$;

-- 5. Lock these down to server callers only ---------------------------------
revoke all on function public.deduct_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text) to service_role;
grant execute on function public.grant_credits(uuid, integer, text, text) to service_role;
