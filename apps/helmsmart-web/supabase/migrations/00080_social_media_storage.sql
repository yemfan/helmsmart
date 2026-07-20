-- 00080_social_media_storage.sql
-- Images attached to social posts: a public "social-media" storage bucket. Each user
-- may write only inside their own {user_id}/ folder; anyone may read — the URL has to
-- be publicly fetchable because Instagram/Facebook pull the image server-side when
-- publishing (an Instagram image post REQUIRES a public image_url). Mirrors 00060.
-- Idempotent — safe to re-run.

insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do update set public = true;

-- Public read (so Meta can fetch the image at publish time).
drop policy if exists "social_media_read_all" on storage.objects;
create policy "social_media_read_all" on storage.objects
  for select to public
  using (bucket_id = 'social-media');

-- Write only within your own folder ({user_id}/...).
drop policy if exists "social_media_insert_own" on storage.objects;
create policy "social_media_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "social_media_update_own" on storage.objects;
create policy "social_media_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "social_media_delete_own" on storage.objects;
create policy "social_media_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);
