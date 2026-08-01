-- MarketingBoss AI — Slice 3: per-user credit metering on the platform fal key.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  credits int not null default 40, -- free starter allotment
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
-- Users may read their own balance; they can NEVER write it directly (only the
-- SECURITY DEFINER functions below change credits), so there's no cheating.
create policy "own profile select" on public.profiles
  for select using (auth.uid() = user_id);

-- Auto-provision a profile (with the free allotment) on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically spend credits for the calling user. Returns the remaining balance,
-- or -1 if they don't have enough. Pass a negative cost to refund.
create or replace function public.consume_credits(p_cost int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  update public.profiles
    set credits = credits - p_cost, updated_at = now()
    where user_id = auth.uid() and credits >= p_cost
    returning credits into remaining;
  if not found then
    return -1;
  end if;
  return remaining;
end;
$$;

grant execute on function public.consume_credits(int) to authenticated;

-- Backfill profiles for any users created before this migration.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
