-- Weekly digest, once per language.
--
-- The digest is NATIONAL: one AI generation per week, sent to every confirmed
-- subscriber of every agent. That made it the one newsletter surface whose
-- language could not follow a reader — there is no single reader. So it is
-- generated once per supported language instead, and the send picks the
-- variant that matches the subscriber.
--
-- `week_of` was UNIQUE, which is exactly the constraint that made one-per-week
-- the only possible shape. The key is (week_of, language) now.
--
-- Existing rows were written before any of this and are English by
-- construction, so the backfill is a straight default rather than a guess:
-- three rows at the time of writing.

alter table if exists public.newsletter_digests
  add column if not exists language text not null default 'en';

comment on column public.newsletter_digests.language is
  'BCP-47 id of the language this variant is written in (''en'', ''zh-Hans''). '
  'One row per (week_of, language). The send path resolves a subscriber''s '
  'language and falls back to ''en'' when that variant does not exist, so a '
  'week that only generated English still goes out.';

-- Swap the single-column uniqueness for the pair. Named constraints are not
-- guaranteed here (the original was an inline `unique`), so find it by shape
-- rather than by name.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'newsletter_digests'
    and con.contype = 'u'
    and con.conkey = array[
      (select attnum from pg_attribute
        where attrelid = rel.oid and attname = 'week_of')
    ]::smallint[];

  if v_name is not null then
    execute format('alter table public.newsletter_digests drop constraint %I', v_name);
  end if;
end $$;

create unique index if not exists idx_newsletter_digests_week_language
  on public.newsletter_digests (week_of, language);

-- The archive still scans newest-first, but only ever wants one language at a
-- time, so the language leads the ordering key.
create index if not exists idx_newsletter_digests_language_week
  on public.newsletter_digests (language, week_of desc);
