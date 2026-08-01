-- MarketingBoss AI — Slice 4: Stripe billing. Users buy credit packs; a paid
-- Stripe Checkout session credits their balance (idempotently, so webhook
-- retries + the success-page fallback can never double-credit).

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The Checkout Session id is the idempotency key: one credit per session, ever.
  stripe_session_id text unique not null,
  pack text,
  credits int not null,
  amount_cents int,
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;
-- Users may read their own purchase history; only the SECURITY DEFINER function
-- below (called with the service role) ever writes it.
create policy "own purchases select" on public.purchases
  for select using (auth.uid() = user_id);

-- Record a paid session and add its credits to the buyer — exactly once. If the
-- session was already recorded, this is a no-op and just returns the balance, so
-- the webhook and the checkout-success page can both call it safely.
create or replace function public.credit_purchase(
  p_user_id uuid,
  p_credits int,
  p_session_id text,
  p_pack text,
  p_amount_cents int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
  v_balance int;
begin
  insert into public.purchases (user_id, stripe_session_id, pack, credits, amount_cents)
  values (p_user_id, p_session_id, p_pack, p_credits, p_amount_cents)
  on conflict (stripe_session_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    update public.profiles
      set credits = credits + p_credits, updated_at = now()
      where user_id = p_user_id
      returning credits into v_balance;
  else
    select credits into v_balance from public.profiles where user_id = p_user_id;
  end if;

  return coalesce(v_balance, 0);
end;
$$;

-- Only the service role (used by the webhook / server fulfillment) may credit an
-- account — never anon or a signed-in user, so no one can credit themselves.
revoke execute on function public.credit_purchase(uuid, int, text, text, int) from public, anon, authenticated;
grant execute on function public.credit_purchase(uuid, int, text, text, int) to service_role;
