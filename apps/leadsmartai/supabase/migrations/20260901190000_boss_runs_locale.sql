-- Ask Max answered in English no matter what language the app was in.
--
-- The agent could have the entire dashboard in Chinese, type their command in
-- Chinese, and get the mission report back in English. Nothing was broken in
-- the model -- Claude is multilingual and always was -- the system prompt just
-- never said which language the person reading it speaks.
--
-- The prompt is built inside a worker, long after the request that started the
-- run has gone, so `cookies()` is not available there. The locale has to ride
-- along on the run itself.
--
-- Nullable, and null means English: every run that already exists was English,
-- and saying so by omission keeps the backfill honest.
alter table public.boss_runs
  add column if not exists locale text;

comment on column public.boss_runs.locale is
  'UI locale of the agent who started this run (i18next id, e.g. "zh-Hans"). '
  'Null = English. Read by buildSystemPrompt to pick the language Max reports '
  'in. Does NOT govern messages to CONTACTS -- those follow the contact''s own '
  'preferred_language, because the language of a message belongs to whoever '
  'receives it.';

-- Overnight runs carry no request, so they look up the last locale this agent
-- actually used. Without this index that is a seq scan over the agent's whole
-- run history on every nightly kick.
--
-- Ordered by started_at, which is what this table has. `created_at` belongs to
-- boss_run_steps, one table further down the original migration.
create index if not exists boss_runs_agent_locale_idx
  on public.boss_runs (agent_id, started_at desc)
  where locale is not null;
