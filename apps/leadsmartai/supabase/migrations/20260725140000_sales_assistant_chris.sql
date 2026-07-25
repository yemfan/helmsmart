-- Sales Assistant persona renamed Jake -> Chris.
--
-- The display name comes from the roster (now "Chris"), so no name column to
-- change. The default portrait id was renamed jake -> chris (same blue mascot,
-- file renamed to /avatars/personas/chris.png). Repoint existing un-customized
-- rows so their avatar still resolves; custom uploads are left untouched.

update public.ai_assistants set avatar_id = 'chris'
  where type = 'sales_assistant' and avatar_id = 'jake' and avatar_url is null;
