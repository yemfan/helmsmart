-- Remove policies that say what another policy on the same table already says.
--
-- Postgres OR's every permissive policy that applies to a command, and
-- evaluates each one. Where two policies express the SAME rule, the second is
-- pure cost, and it is a second place for the rule to drift.
--
-- SCOPE IS DELIBERATELY NARROW. Supabase's `multiple_permissive_policies`
-- lint fires on 13 (table, command) combinations here, but 9 of them are an
-- "admin may do everything" policy sitting beside an "owner may read" policy.
-- Those are two different rules that happen to overlap on SELECT. Collapsing
-- them would mean expanding each `FOR ALL` policy into four command-specific
-- ones and OR-ing unrelated intent into a single expression — more policies,
-- less legible, for a saving that does not justify making an access rule
-- harder to read. They are left alone on purpose.
--
-- What follows is only the cases proven redundant.

-- 1. agent_sphere_drip_prefs — one rule, written five times.
--
-- Two migrations added the same "the owning agent" rule, once as three
-- command-specific policies and once as a FOR ALL pair. Normalising the table
-- alias (`agents a` vs `agents`) collapses all five predicates to a single
-- distinct rule, verified against pg_policies before this ran. `asdp_modify_own`
-- is FOR ALL with that predicate as both USING and WITH CHECK, so it already
-- covers everything the other four grant — including DELETE, which only it
-- ever granted.
drop policy if exists agent_sphere_drip_prefs_insert_own on public.agent_sphere_drip_prefs;
drop policy if exists agent_sphere_drip_prefs_select_own on public.agent_sphere_drip_prefs;
drop policy if exists agent_sphere_drip_prefs_update_own on public.agent_sphere_drip_prefs;
drop policy if exists asdp_select_own                    on public.agent_sphere_drip_prefs;

-- 2. client_saved_homes — a SELECT policy whose predicate is byte-identical to
-- the FOR ALL policy beside it. Nothing is lost.
drop policy if exists client_saved_homes_select_own on public.client_saved_homes;

-- 3. testimonials — two genuinely different SELECT rules, OR'd by Postgres
-- anyway: you may read a testimonial you own, or one that is published. Stated
-- once, the reader sees the whole rule in one place instead of inferring the
-- union of two.
drop policy if exists testimonials_select_own       on public.testimonials;
drop policy if exists testimonials_select_published on public.testimonials;

create policy testimonials_select_visible on public.testimonials
  as permissive for select to public
  using (
    is_published = true
    or exists (
      select 1 from agents
       where agents.id = testimonials.agent_id
         and agents.auth_user_id = (select auth.uid())
    )
  );
