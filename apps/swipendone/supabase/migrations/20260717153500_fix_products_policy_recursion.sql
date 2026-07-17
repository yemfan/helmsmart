-- 20260717153000 introduced infinite RLS recursion: products_public_read queries
-- guides, and guides_owner_all queries products, so evaluating either recurses.
-- Break the loop with a SECURITY DEFINER helper that checks published status
-- bypassing RLS, and rebuild the products read policy on top of it.
create or replace function public.product_has_published_guide(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from guides where product_id = pid and status = 'published'
  );
$$;
-- anon/authenticated must keep EXECUTE: this function is invoked *inside* the
-- products RLS policy below, so revoking it would break public guide reads. It
-- only returns whether a product backs a published guide (buyer-safe).

drop policy if exists products_public_read on products;
create policy products_public_read on products for select
  to anon, authenticated
  using (public.product_has_published_guide(id));
