-- Boss Assistant as the reviewer: mode 'assisted'.
--
-- 'review' makes a human read all ~7 posts a week. 'auto' publishes unread. The
-- Boss reviewing is the middle: it fact-checks every post against what the
-- product actually does, clears the ones it can verify, and HOLDS anything it
-- can't for the human. The agent can still cancel a cleared post any time
-- before its slot — that's the safety net that makes delegating defensible.
--
-- This is only in the tree because it was measured, not assumed. The checker was
-- evaluated against the two real fabrications that reached the prod library
-- ("a live search running on their behalf", "everything is already connected")
-- plus four synthetic ones and seven real clean posts:
--   fabrications caught 6/6, clean posts passed 7/7.
-- If it had missed one, this migration would not exist.
--
-- The verdict is STORED per post, so the queue can show its reasoning and so a
-- bad call is auditable after the fact rather than invisible.

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_settings_mode_check;

alter table public.boss_autopilot_settings
  add constraint boss_autopilot_settings_mode_check
  check (mode in ('ask', 'review', 'assisted', 'auto'));

comment on column public.boss_autopilot_settings.mode is
  'ask = draft only, nothing scheduled. review = queue the week, a human approves every post. assisted = the Boss fact-checks each post, clears what it can verify and holds the rest for a human (agent can still cancel before the slot). auto = publish with no check at all.';

alter table public.scheduled_posts
  add column if not exists review_verdict text,
  add column if not exists review_issues jsonb,
  add column if not exists reviewed_at timestamptz;

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_review_verdict_check;

alter table public.scheduled_posts
  add constraint scheduled_posts_review_verdict_check
  check (review_verdict is null or review_verdict in ('clean', 'flagged'));

comment on column public.scheduled_posts.review_verdict is
  'The Boss Assistant''s pre-publish fact-check: clean = nothing contradicts the product facts (NOT a guarantee of truth); flagged = held for a human, see review_issues. NULL = never reviewed (queued under review/auto mode).';

comment on column public.scheduled_posts.review_issues is
  'jsonb array of { quote, why } — the exact words the Boss objected to and what the product actually does. Shown on the queue card so a flag is actionable rather than mysterious.';
