-- contacts.phone / contacts.phone_number: make the pair behave as one column.
--
-- The table carries the same fact twice and nothing kept the two in step, so
-- which column a row has filled in depends on which screen or import created
-- it. Today: 96 rows have both, 19 have only `phone`, 8 have only
-- `phone_number`, 2 have neither.
--
-- Any code that reads one column therefore decides that some contacts have no
-- number at all. That is not hypothetical — the draft sender failed messages to
-- two contacts for "no phone number" while a perfectly good +1626555xxxx sat in
-- the column it did not read, and the sphere drip skipped the same rows as
-- "missing_field".
--
-- Consolidating to a single column would be the tidiest answer, but
-- `phone_number` is referenced by 78 files across four apps that share this
-- database. Dropping it is a large, coordinated change and a separate decision.
--
-- This table already solves exactly this problem twice — `trg_contacts_sync_name`
-- keeps name/first_name/last_name in step, and `trg_contacts_sync_status` does
-- the same for the status pair. Following that established pattern makes the
-- two phone columns agree from every caller's point of view, whichever one they
-- read or write, without touching a single one of those 78 files.

create or replace function public.sync_contacts_phone_fields()
returns trigger
language plpgsql
as $function$
begin
  -- Mirror whichever side the caller actually set. On an UPDATE we only copy
  -- when one column changed and the other did not, so a caller that writes both
  -- (most of them now do) is left exactly as it asked.
  if (
    (tg_op = 'INSERT' and new.phone is null and new.phone_number is not null)
    or
    (tg_op = 'UPDATE' and new.phone_number is distinct from old.phone_number
      and new.phone is not distinct from old.phone)
  ) then
    new.phone := new.phone_number;
  end if;

  if (
    (tg_op = 'INSERT' and new.phone_number is null and new.phone is not null)
    or
    (tg_op = 'UPDATE' and new.phone is distinct from old.phone
      and new.phone_number is not distinct from old.phone_number)
  ) then
    new.phone_number := new.phone;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_contacts_sync_phone on public.contacts;
create trigger trg_contacts_sync_phone
  before insert or update on public.contacts
  for each row execute function public.sync_contacts_phone_fields();

-- Bring the rows that predate the trigger into line. Copy the value verbatim
-- rather than reformatting it: the two columns then hold the same string, and
-- normalising a stored number is a separate concern from keeping them in step.
update public.contacts
   set phone_number = phone
 where phone_number is null and phone is not null;

update public.contacts
   set phone = phone_number
 where phone is null and phone_number is not null;
