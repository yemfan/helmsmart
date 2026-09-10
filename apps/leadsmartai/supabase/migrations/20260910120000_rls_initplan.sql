-- Evaluate auth.uid() once per query instead of once per row.
--
-- A policy written `USING (user_id = auth.uid())` makes Postgres call
-- auth.uid() for EVERY row it scans. Wrapping it in a scalar subquery —
-- `(select auth.uid())` — turns it into an InitPlan that runs once and is
-- reused, which is Supabase's own documented fix for its `auth_rls_initplan`
-- lint. 137 of this database's 182 policies were written the first way.
--
-- It costs nothing today: the biggest per-agent table holds a few hundred
-- rows. It is the difference between a scan and a scan plus N function calls
-- once any of them holds tens of thousands, which is the point of doing it
-- while the tables are small and the change is boring.
--
-- SEMANTICS ARE UNCHANGED. `(select auth.uid())` returns exactly what
-- `auth.uid()` returns; only the number of evaluations differs. Every policy
-- keeps its name, table, command, roles and permissive/restrictive flag, and
-- the expression is rewritten by a deterministic textual substitution rather
-- than re-authored — nothing here decides who may see what.
--
-- The rewrite is idempotent, but only because the patterns below match the
-- form Postgres STORES rather than the form you write. `(select auth.uid())`
-- is deparsed back out as `( SELECT auth.uid() AS uid)` — upper case, and
-- with an alias. A lower-case pattern silently fails to recognise its own
-- output, so a second run would wrap the wrapper. Hence `~*` and the
-- optional ` AS <alias>` throughout.
--
-- Failure direction is safe. This runs in one transaction, so a mistake rolls
-- back entirely; and if a policy ever failed to be recreated, a table with RLS
-- enabled and no matching policy DENIES access. The failure mode is a locked
-- door, not an open one.
do $$
declare
  p record;
  new_qual text;
  new_check text;
  role_list text;
  clauses text;
  rewritten int := 0;
begin
  for p in
    select schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and ( (qual       ~* 'auth\.(uid|role|jwt)\(\)' and qual       !~* 'SELECT\s+auth\.(uid|role|jwt)\(\)')
          or (with_check ~* 'auth\.(uid|role|jwt)\(\)' and with_check !~* 'SELECT\s+auth\.(uid|role|jwt)\(\)') )
     order by tablename, policyname
  loop
    -- unwrap first, then wrap everything: idempotent, and it normalises a
    -- policy that had one call wrapped and another not.
    new_qual := regexp_replace(
                  regexp_replace(coalesce(p.qual, ''), '\(\s*SELECT\s+auth\.(uid|role|jwt)\(\)(\s+AS\s+\w+)?\s*\)', 'auth.\1()', 'gi'),
                  'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(
                  regexp_replace(coalesce(p.with_check, ''), '\(\s*SELECT\s+auth\.(uid|role|jwt)\(\)(\s+AS\s+\w+)?\s*\)', 'auth.\1()', 'gi'),
                  'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');

    select string_agg(quote_ident(r), ', ') into role_list from unnest(p.roles) as r;

    clauses := '';
    if p.qual is not null then
      clauses := clauses || format(' USING (%s)', new_qual);
    end if;
    if p.with_check is not null then
      clauses := clauses || format(' WITH CHECK (%s)', new_check);
    end if;

    execute format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s',
                   p.policyname, p.schemaname, p.tablename,
                   p.permissive, p.cmd, role_list, clauses);
    rewritten := rewritten + 1;
  end loop;

  raise notice 'rls initplan: rewrote % policies', rewritten;
end
$$;
