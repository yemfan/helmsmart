-- ============================================================
-- user_preferences: the language a PERSON reads the app in.
-- ============================================================
-- The language picker writes a cookie, which is the fast path for rendering
-- and works signed out. But a cookie exists in one browser only. Anything
-- that runs WITHOUT a request — the weekly digest cron, the insights cron,
-- Tim's briefing when it is generated ahead of time — has no cookie to read,
-- and would write English to a Chinese owner. This is the durable copy those
-- readers consult (see lib/i18n/userLocale.ts).
--
-- Per USER, not per organization or membership: language belongs to the
-- person. Two owners of one business can read it in different languages, and
-- one person in two businesses reads both the same way.
--
-- ui_locale is one of the ids the shared @leadsmart/i18n contract knows
-- (ALL_LOCALES). NULL means "never chose" — callers treat it as English.
-- Idempotent.
-- ============================================================

create table if not exists user_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ui_locale  text check (ui_locale in ('en', 'zh-Hans', 'es')),
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;

drop policy if exists "own preferences" on user_preferences;
create policy "own preferences" on user_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Crons read every recipient's preference through the service role, which
-- bypasses RLS; nothing else needs a cross-user read.
