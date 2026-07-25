-- CloseBoss AI team personas — backfill existing ai_assistants rows.
--
-- The roster now ships persona names (Max, Emma, Jake, Ruby, Grace, Oliver)
-- and refreshed default portraits. New agents seed correctly from the roster;
-- this backfills EXISTING rows that were seeded with the old role-label names
-- and old default avatars — but ONLY where the agent never customized them
-- (name still equals the old default, avatar_id still equals the old default
-- and no custom photo was uploaded). Customized rows are left untouched.

-- ── Names: old role label -> persona ────────────────────────────────────────
update public.ai_assistants set name = 'Max'    where type = 'boss_assistant'        and name = 'Boss Assistant';
update public.ai_assistants set name = 'Emma'   where type = 'receptionist'           and name = 'AI Receptionist';
update public.ai_assistants set name = 'Jake'   where type = 'sales_assistant'         and name = 'AI Sales Assistant';
update public.ai_assistants set name = 'Ruby'   where type = 'marketing_assistant'     and name = 'AI Marketing Assistant';
update public.ai_assistants set name = 'Grace'  where type = 'transaction_assistant'   and name = 'AI Transaction Assistant';
update public.ai_assistants set name = 'Oliver' where type = 'accountant'              and name = 'AI Accountant';

-- ── Avatars: old default -> new default (skip custom uploads) ────────────────
-- Scoped by type so a reused avatar id can't cascade across roles.
update public.ai_assistants set avatar_id = 'avatar-13'
  where type = 'boss_assistant'      and avatar_id = 'avatar-01' and avatar_url is null;
update public.ai_assistants set avatar_id = 'avatar-09'
  where type = 'receptionist'        and avatar_id = 'avatar-02' and avatar_url is null;
update public.ai_assistants set avatar_id = 'avatar-14'
  where type = 'sales_assistant'     and avatar_id = 'avatar-03' and avatar_url is null;
update public.ai_assistants set avatar_id = 'avatar-03'
  where type = 'marketing_assistant' and avatar_id = 'avatar-04' and avatar_url is null;
-- transaction_assistant default is unchanged (avatar-05).
update public.ai_assistants set avatar_id = 'avatar-04'
  where type = 'accountant'          and avatar_id = 'avatar-06' and avatar_url is null;
