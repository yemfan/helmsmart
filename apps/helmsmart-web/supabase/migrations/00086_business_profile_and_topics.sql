-- 00086: richer business profile at onboarding (category, description, location)
-- + a first-class social_topics pool that AI generation writes into and post
-- scheduling reads from.
--
-- All ADDITIVE and safe to apply anytime (even before the app code ships): the
-- org columns are nullable, and the onboarding action writes them best-effort,
-- so applying this late only delays persistence — it never breaks a signup.

-- 1) Business-profile fields on the org. These also get mirrored into
--    knowledge_base at onboarding so the existing content generator uses them.
alter table organizations add column if not exists business_category    text;
alter table organizations add column if not exists business_description text;
alter table organizations add column if not exists business_location    text;

-- 2) First-class social-topic pool. Unlike org_social_autopilot.day_topics
--    (inline strings, overwritten each schedule), these are records: reviewable,
--    editable, reusable across weeks, with a status and a used-count.
create table if not exists social_topics (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references organizations(id) on delete cascade,
  topic            text        not null,
  theme            text,                       -- optional grouping, e.g. 'local market'
  source           text        not null default 'ai'
                     check (source in ('ai', 'manual')),
  status           text        not null default 'suggested'
                     check (status in ('suggested', 'approved', 'archived')),
  used_count       integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists social_topics_org_status_idx
  on social_topics(organization_id, status);

alter table social_topics enable row level security;
create policy "org_members_social_topics" on social_topics
  for all
  using  (organization_id in (select get_user_org_ids()))
  with check (organization_id in (select get_user_org_ids()));

create trigger set_updated_at_social_topics
  before update on social_topics
  for each row execute function set_updated_at();
