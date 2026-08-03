-- Digital twin needs video (intro clip, Phase A) + audio (cloned-voice TTS
-- preview, Phase C) in the private lead-media bucket, which was originally
-- scoped to images/PDFs/CSVs and capped at 20 MB. Widen the allow-list and the
-- size limit. Additive only — existing image/PDF/CSV uploads keep working.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif',
  'application/pdf','text/plain','text/csv','text/markdown','text/x-markdown','text/vcard','text/x-vcard',
  'application/json','application/octet-stream',
  'video/mp4','video/quicktime','video/webm','video/x-m4v',
  'audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/aac','audio/ogg'
],
    file_size_limit = 209715200  -- 200 MB (intro videos)
where id = 'lead-media';
