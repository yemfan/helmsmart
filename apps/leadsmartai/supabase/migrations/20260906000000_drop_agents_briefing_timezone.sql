-- Retire agents.briefing_timezone.
--
-- The account has one timezone. It decides when briefings arrive, when the
-- overnight run starts, what "tomorrow at 3" means to the AI receptionist and
-- which slots a caller is offered. It was three separate values; #1548 made
-- agents.timezone the one column and backfilled it, and #1554 removed the last
-- code that read or wrote the old name. Nothing selects it any more, so it can
-- go.
--
-- Two things have to happen BEFORE the drop, or this quietly loses data.

-- 1. Catch the stragglers.
--
-- #1548 backfilled the rows that existed when it ran. It did not give
-- agents.timezone the DEFAULT that briefing_timezone had, so every account
-- created since has a NULL timezone and a defaulted briefing_timezone —
-- already one row here. Dropping the old column now would throw away the only
-- copy of their answer. Today they all happen to say America/Los_Angeles, so
-- resolving to the default hid it; that is luck, not correctness.
update agents
   set timezone = briefing_timezone
 where coalesce(timezone, '') = ''
   and coalesce(briefing_timezone, '') <> '';

-- 2. Inherit the guarantee, not just the values.
--
-- briefing_timezone was NOT NULL DEFAULT 'America/Los_Angeles'. If timezone
-- stays nullable and default-less, the same gap reopens with the next signup —
-- and this time there is no second column to recover the value from. The
-- application already resolves NULL to this same zone, so this changes no
-- account's behaviour; it moves the promise out of the code and into the table.
update agents set timezone = 'America/Los_Angeles' where coalesce(timezone, '') = '';

alter table agents alter column timezone set default 'America/Los_Angeles';
alter table agents alter column timezone set not null;

-- 3. Now the old name can go.
alter table agents drop column if exists briefing_timezone;

comment on column agents.timezone is
  'The account''s IANA timezone. One value for briefings, the overnight run, the AI receptionist and every appointment it books. Read it through lib/agent/accountTimezone.ts, never directly.';
