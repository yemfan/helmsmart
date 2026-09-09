-- ============================================================
-- daily_briefings: cache the briefing per LANGUAGE, not just per day.
-- ============================================================
-- Tim's briefing is written by Claude in the owner's language and cached once
-- per org per day. The cache key did not include the language, so the first
-- read of the day froze it: an owner who switched to 简体中文 kept an English
-- briefing at the top of an otherwise fully translated dashboard until
-- tomorrow. That is exactly the half-translated page the i18n guards exist to
-- prevent, on the most-read line of the app.
--
-- `locale` defaults to 'en', which is also the right value for every row that
-- already exists — they were all written in English.
--
-- The unique constraint is REPLACED rather than supplemented, and it is a
-- full constraint rather than a partial index: PostgREST's `onConflict` throws
-- 42P10 against a partial index, so an upsert naming these three columns needs
-- a real constraint covering exactly them.
-- Idempotent.
-- ============================================================

alter table daily_briefings
  add column if not exists locale text not null default 'en';

alter table daily_briefings
  drop constraint if exists daily_briefings_organization_id_briefing_date_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_briefings_org_date_locale_key'
  ) then
    alter table daily_briefings
      add constraint daily_briefings_org_date_locale_key
      unique (organization_id, briefing_date, locale);
  end if;
end $$;
