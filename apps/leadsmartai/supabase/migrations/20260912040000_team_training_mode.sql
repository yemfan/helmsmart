-- How a class is delivered, so the board can say what an agent has to do:
--
--   classroom  in person, at a room or an address
--   online     a live session people join by link (the link lives in `location`,
--              which the panel already renders as "Join link" when it is a URL)
--   virtual    a self-paced course an agent takes on their own time; the course
--              link lives in `materials_url`
--
-- Until now this was inferred: a URL in `location` meant online, a self-paced
-- class with materials meant virtual. That inference is fine for reading a row
-- and useless for writing one, because the form could not ask. Making it an
-- explicit column lets the form show the right fields and lets the list say,
-- at a glance, whether someone has to drive somewhere.

alter table public.team_trainings
  add column if not exists mode text not null default 'classroom';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_trainings_mode_check' and conrelid = 'public.team_trainings'::regclass
  ) then
    alter table public.team_trainings
      add constraint team_trainings_mode_check check (mode in ('classroom', 'online', 'virtual'));
  end if;
end $$;

-- Backfill from what each existing row already implies, rather than calling
-- everything a classroom: a self-paced class with a link is virtual, and a
-- class whose "location" is a URL is a live online session.
update public.team_trainings
   set mode = 'virtual'
 where mode = 'classroom'
   and starts_at is null
   and materials_url is not null;

update public.team_trainings
   set mode = 'online'
 where mode = 'classroom'
   and location is not null
   and location ~* '^https?://';

comment on column public.team_trainings.mode is
  'classroom = in person; online = live session joined by the link in location; virtual = self-paced course at materials_url (starts_at is always null).';
