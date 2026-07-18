-- Record WHY a social post failed.
--
-- `social_posts` could go to status='failed' with no reason attached anywhere,
-- so a failure was as opaque as the silent stall it replaced: the UI showed a
-- red chip and the person who wrote the post had no idea whether the token had
-- expired, the platform rejected the text, or we simply can't publish there.
--
-- Paired with the fix that makes unsupported platforms fail LOUDLY rather than
-- sitting at 'scheduled' forever — that fix is only an improvement if the
-- resulting failure explains itself.

alter table social_posts
  add column if not exists last_error text;

comment on column social_posts.last_error is
  'Why the last publish attempt failed, in words meant for the post author. Null when never attempted or succeeded.';
