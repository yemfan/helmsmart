-- lead-media is now the direct-upload target for document intake (contact-import
-- PDFs/text, and the listing/offer/contract PDF parsers) in addition to lead
-- images. Its allowed_mime_types only permitted images, so Storage rejected PDFs
-- ("mime type application/pdf is not supported"). Widen it to the doc types the
-- uploaders accept. Bucket stays private; files are transient (removed after
-- processing).

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif',
  'application/pdf',
  'text/plain','text/csv','text/markdown','text/x-markdown',
  'text/vcard','text/x-vcard',
  'application/json','application/octet-stream'
]
where id = 'lead-media';
