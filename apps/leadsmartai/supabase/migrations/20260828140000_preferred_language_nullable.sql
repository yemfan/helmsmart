-- contacts.preferred_language: allow "not stated".
--
-- The column was text NOT NULL DEFAULT 'en'. Editing a contact and choosing
-- "Lang: default" writes null, which the constraint rejected — the save failed
-- with:
--
--   null value in column "preferred_language" of relation "contacts"
--   violates not-null constraint
--
-- That failure was invisible until the contact PATCH started reporting its
-- errors, so the row simply never changed while the screen said it had.
--
-- The deeper problem is that NOT NULL DEFAULT 'en' cannot express "we have not
-- asked yet". Every contact reads as an explicit English preference from the
-- moment it is created, which is wrong twice over:
--
--   - the receptionist's memory patch only fills a language when the field is
--     BLANK, so it could never record that a caller speaks Chinese — the field
--     was already 'en' before they said a word;
--   - a Chinese-speaking caller and a caller nobody has asked are stored
--     identically, so nothing downstream can tell them apart.
--
-- Null now means "not stated". Readers already cope: they coalesce to "" and
-- test with startsWith("zh"), so a null behaves exactly as an unset preference
-- should. The default stays for inserts that do not mention the column, so
-- nothing that relied on getting 'en' changes.

alter table public.contacts
  alter column preferred_language drop not null;

-- Existing rows keep whatever they have. Backfilling 'en' → null would be a
-- guess: some of those rows are genuinely English speakers and some were never
-- asked, and after the fact there is no way to tell which. New and edited
-- contacts record the distinction properly from here.
