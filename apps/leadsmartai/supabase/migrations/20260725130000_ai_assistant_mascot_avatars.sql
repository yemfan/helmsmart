-- CloseBoss AI team — branded mascot portraits as the default avatars.
--
-- The default avatar per role is now the branded CloseBoss mascot
-- (max/emma/jake/ruby/grace/oliver, served from /avatars/personas/*.png)
-- instead of an illustrated portrait. Promote existing rows that still carry
-- the prior illustrated default (or none) to the mascot — but never touch a
-- row where the agent uploaded a custom photo (avatar_url set) or picked a
-- different avatar.

update public.ai_assistants set avatar_id = 'max'
  where type = 'boss_assistant'      and avatar_url is null and (avatar_id = 'avatar-13' or avatar_id is null);
update public.ai_assistants set avatar_id = 'emma'
  where type = 'receptionist'        and avatar_url is null and (avatar_id = 'avatar-09' or avatar_id is null);
update public.ai_assistants set avatar_id = 'jake'
  where type = 'sales_assistant'     and avatar_url is null and (avatar_id = 'avatar-14' or avatar_id is null);
update public.ai_assistants set avatar_id = 'ruby'
  where type = 'marketing_assistant' and avatar_url is null and (avatar_id = 'avatar-03' or avatar_id is null);
update public.ai_assistants set avatar_id = 'grace'
  where type = 'transaction_assistant' and avatar_url is null and (avatar_id = 'avatar-05' or avatar_id is null);
update public.ai_assistants set avatar_id = 'oliver'
  where type = 'accountant'          and avatar_url is null and (avatar_id = 'avatar-04' or avatar_id is null);
