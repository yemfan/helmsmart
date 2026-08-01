-- MarketingBoss AI — service-role credit spend for the autopilot cron.
-- consume_credits() keys on auth.uid(), so it only works in a user session. The
-- cron runs with no session (service role), so it needs to spend a specific
-- user's credits by id. Same atomic semantics; negative cost refunds.
-- EXECUTE is granted to service_role ONLY (never anon/authenticated) so a normal
-- client can't spend someone else's credits.
create or replace function public.deduct_credits(p_user uuid, p_cost int)
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
    where user_id = p_user and credits >= p_cost
    returning credits into remaining;
  if not found then
    return -1;
  end if;
  return remaining;
end;
$$;

revoke execute on function public.deduct_credits(uuid, int) from public;
revoke execute on function public.deduct_credits(uuid, int) from anon;
revoke execute on function public.deduct_credits(uuid, int) from authenticated;
grant execute on function public.deduct_credits(uuid, int) to service_role;
