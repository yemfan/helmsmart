-- The public buyer guide reads the product name via the anon client, but products
-- only had an owner policy — so /g/[slug] came back empty. Allow anon to read a
-- product iff it backs a published guide. (Brand name still comes from the seller
-- row via the service role, never anon.)
create policy products_public_read on products for select
  to anon, authenticated
  using (id in (select product_id from guides where status = 'published'));
