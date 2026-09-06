-- The first ten minutes (UX audit §28: "instrument time-to-first-proposal
-- and time-to-first-approval; they are the metrics onboarding should move").
--
-- One row per agent: when they signed up, when Max first put a proposal in
-- front of them, and when they first approved one. Everything else (medians,
-- share within ten minutes) is arithmetic in lib/analytics/firstTenMinutes.ts.
--
--   first_proposal_at  the earliest boss_recommendations row — the "Today's
--                      priorities" cards on Ask Max — or the earliest run step
--                      parked for approval, whichever came first.
--   first_approval_at  the earliest run step the realtor approved, or the
--                      earliest recommendation they accepted/completed.
--
-- SECURITY DEFINER so the service role can call it in one round trip instead
-- of paging three tables; execute is granted to service_role only.

create or replace function public.agent_first_moments()
returns table (
  agent_id bigint,
  signed_up_at timestamptz,
  first_proposal_at timestamptz,
  first_approval_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with recs as (
    select r.agent_id,
           min(r.created_at) as first_rec,
           min(r.updated_at) filter (where r.status in ('accepted', 'completed')) as first_accept
    from public.boss_recommendations r
    group by r.agent_id
  ),
  steps as (
    select b.agent_id,
           min(s.created_at) filter (where s.approval_state in ('pending', 'approved', 'rejected')) as first_parked,
           min(coalesce(s.finished_at, s.created_at)) filter (where s.approval_state = 'approved') as first_approved
    from public.boss_run_steps s
    join public.boss_runs b on b.id = s.run_id
    group by b.agent_id
  )
  select a.id,
         a.created_at,
         least(recs.first_rec, steps.first_parked),
         least(recs.first_accept, steps.first_approved)
  from public.agents a
  left join recs on recs.agent_id = a.id
  left join steps on steps.agent_id = a.id;
$$;

revoke all on function public.agent_first_moments() from public;
revoke all on function public.agent_first_moments() from anon;
revoke all on function public.agent_first_moments() from authenticated;
grant execute on function public.agent_first_moments() to service_role;
