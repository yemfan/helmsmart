-- `slug` becomes `username`, because it turned out to be an identity.
--
-- Shipped hours ago (20260829120000) as a hub URL segment. The intent has since
-- widened: one handle that serves the public page (/@michaelye), a forwarding
-- mailbox (michaelye@closebossai.com), and whatever is built next. Renaming now
-- costs one row — exactly one agent has set a value, and no code reads it yet.
-- Renaming after agents have printed it on business cards costs a great deal
-- more, so this is the last cheap moment.
--
-- The rules tighten with the name, because the strictest consumer wins:
--
--   3..30 rather than 3..48   short enough to say aloud
--   no dots                   Gmail folds them, so m.ichaelye and michaelye
--                             reach one inbox — two agents, one mailbox
--   underscores allowed       harmless in both a URL and an email local part
--   starts/ends alphanumeric  leading or trailing hyphens break mail tooling
--
-- The rules live in lib/identity/username.ts as well. Duplicated on purpose:
-- the form needs them without a round-trip, and the database needs them because
-- a form is not a guarantee. They must be changed together.
--
-- Nothing in the list is shorter than 3 characters: the format CHECK already
-- makes two-letter names unreachable, and listing 'ai' or 'mx' would imply a
-- protection this table is not providing.
--
-- A username is close to irreversible. Someone prints it, a client emails it,
-- Google indexes it. Worse, if mail is live and a name is freed, the next
-- person to claim it starts receiving the previous owner's messages. So the
-- reserved list below is deliberately generous — it is far cheaper to release
-- a name later than to reclaim one.

alter table if exists public.agents rename column slug to username;

alter table if exists public.agents drop constraint if exists agents_slug_format;
alter index if exists idx_agents_slug_unique rename to idx_agents_username_unique;

comment on column public.agents.username is
  'Public handle. Stored WITHOUT the "@" — the sigil is display only. Serves /@<username>, a future <username>@closebossai.com mailbox, and the display handle. Lowercase, unique, 3..30.';

alter table if exists public.agents
  add constraint agents_username_format
  check (
    username is null
    or (
      username ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
      and char_length(username) between 3 and 30
    )
  );

-- ── reserved names ───────────────────────────────────────────────────────
--
-- A table rather than a CHECK list, so the set can grow without a migration —
-- new routes and new AI staff will need adding, and that should not require a
-- deploy. Enforced by trigger because a CHECK cannot reference another table.

create table if not exists public.reserved_usernames (
  username text primary key,
  reason   text not null,
  created_at timestamptz not null default now()
);

comment on table public.reserved_usernames is
  'Handles no agent may claim. Three kinds: mail infrastructure (postmaster, abuse — required to reach a human at the domain), the company and its AI staff (an @support or @max that is not us is a phishing surface), and structural words that keep the URL space open.';

insert into public.reserved_usernames (username, reason) values
  -- mail infrastructure
  ('postmaster','mail'), ('abuse','mail'), ('hostmaster','mail'), ('webmaster','mail'),
  ('mailer-daemon','mail'), ('daemon','mail'), ('noreply','mail'), ('no-reply','mail'),
  ('donotreply','mail'), ('do-not-reply','mail'), ('bounce','mail'), ('bounces','mail'),
  ('mail','mail'), ('email','mail'), ('smtp','mail'), ('imap','mail'),
  ('root','mail'), ('ssl-admin','mail'),
  -- the company and its AI staff
  ('closeboss','brand'), ('closebossai','brand'), ('close-boss','brand'),
  ('leadsmart','brand'), ('leadsmartai','brand'), ('helmsmart','brand'),
  ('propertytools','brand'), ('propertytoolsai','brand'), ('marketingboss','brand'),
  ('realtyboss','brand'),
  ('support','brand'), ('help','brand'), ('billing','brand'), ('sales','brand'),
  ('security','brand'), ('legal','brand'), ('privacy','brand'),
  ('team','brand'), ('staff','brand'), ('official','brand'),
  ('admin','brand'), ('administrator','brand'), ('moderator','brand'), ('mod','brand'),
  ('max','ai-staff'), ('emma','ai-staff'), ('ruby','ai-staff'), ('nina','ai-staff'),
  ('lucy','ai-staff'), ('boss','ai-staff'), ('assistant','ai-staff'),
  -- structural
  ('api','structural'), ('www','structural'), ('app','structural'), ('web','structural'),
  ('cdn','structural'), ('static','structural'), ('assets','structural'),
  ('auth','structural'), ('login','structural'), ('logout','structural'),
  ('signup','structural'), ('signin','structural'), ('register','structural'),
  ('account','structural'), ('accounts','structural'), ('settings','structural'),
  ('dashboard','structural'), ('agent','structural'), ('agents','structural'),
  ('broker','structural'), ('brokers','structural'), ('client','structural'),
  ('clients','structural'), ('blog','structural'), ('about','structural'),
  ('contact','structural'), ('pricing','structural'), ('plans','structural'),
  ('terms','structural'), ('status','structural'), ('docs','structural'),
  ('home','structural'), ('search','structural'), ('new','structural'),
  ('edit','structural'), ('delete','structural'), ('null','structural'),
  ('undefined','structural'), ('true','structural'), ('false','structural')
on conflict (username) do nothing;

create or replace function public.enforce_username_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null
     and exists (select 1 from public.reserved_usernames r where r.username = new.username)
  then
    raise exception 'username % is reserved', new.username
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agents_username_not_reserved on public.agents;
create trigger trg_agents_username_not_reserved
  before insert or update of username on public.agents
  for each row execute function public.enforce_username_not_reserved();

-- The one agent who has a handle wanted it without the hyphen.
update public.agents set username = 'michaelye' where username = 'michael-ye';
