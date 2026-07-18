-- Approve-before-it-posts, and a real queue to manage.
--
-- The social channel had two modes and neither is what you want for a feed you
-- care about:
--   'ask'  — drafts only. Nothing is ever scheduled, so the cadence is decorative
--            and you hand-schedule every post.
--   'auto' — full autopilot. Content is generated and published with NO human
--            gate. The brand ran this way, which is exactly how two AI-written
--            posts making false product claims got within a cron tick of the
--            company's own feed.
--
-- 'review' is the missing middle, and it's the one most people actually want:
-- the week is planned and queued for you at the right times, and then it WAITS.
-- Nothing leaves until a human approves it.
--
-- Mechanically this is one new scheduled_posts status. The publish cron only
-- ever claims status='scheduled', so 'awaiting_approval' rows simply sit in the
-- queue — no change to the cron, no new gate to forget to enforce. Approving is
-- a status flip to 'scheduled'. Approve after the slot has passed and the cron
-- picks it up on the next tick (scheduled_for is in the past → still claimable),
-- so a late approval publishes promptly instead of being silently dropped.

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_settings_mode_check;

alter table public.boss_autopilot_settings
  add constraint boss_autopilot_settings_mode_check
  check (mode in ('ask', 'auto', 'review'));

comment on column public.boss_autopilot_settings.mode is
  'ask = draft only, nothing scheduled. review = plan + queue the week, hold each post for human approval before publishing. auto = plan, queue and publish with no gate.';

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_status_check;

alter table public.scheduled_posts
  add constraint scheduled_posts_status_check
  check (status in (
    'awaiting_approval', 'scheduled', 'posting', 'posted', 'failed', 'cancelled'
  ));

comment on column public.scheduled_posts.status is
  'awaiting_approval = queued at its slot but held for human approval; the publish cron never claims it. scheduled = cleared to publish at scheduled_for.';

-- Queue reads are "this agent's pending posts, soonest first".
create index if not exists scheduled_posts_awaiting_idx
  on public.scheduled_posts (agent_id, scheduled_for)
  where status = 'awaiting_approval';

-- The brand moves off no-gate autopilot onto review. Its content is
-- AI-generated marketing about our own product — the class of copy where a
-- fabricated claim is most expensive and least visible.
update public.boss_autopilot_settings
   set mode = 'review', updated_at = now()
 where agent_id = 26
   and assignee = 'marketing_assistant'
   and channel = 'social'
   and exists (select 1 from public.agents where id = 26);
