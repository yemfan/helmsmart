-- Follow-up to init: address security advisors.
-- 1. Public buckets serve objects via the public URL endpoint, so the broad SELECT
--    policy on storage.objects only enabled bucket listing — drop it.
-- 2. handle_new_seller is a trigger-only SECURITY DEFINER function; it must not be
--    callable via the REST RPC endpoint.
drop policy if exists "guide_images_public_read" on storage.objects;
revoke execute on function public.handle_new_seller() from anon, authenticated, public;
