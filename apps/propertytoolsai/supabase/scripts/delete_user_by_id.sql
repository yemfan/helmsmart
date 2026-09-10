-- =============================================================================
-- PropertyTools — delete ONE auth user safely
--
-- Same Supabase project as CloseBoss; this script mirrors
-- `apps/leadsmartai/supabase/scripts/delete_user_by_id.sql`. If you change one,
-- update the other so they stay in sync.
--
-- What this does:
--   • Removes avatar objects under `avatars/{user_id}/…` (see profileAvatarClient).
--   • Clears `public.agents.auth_user_id` for that login (no FK to auth — avoids
--     orphan UUIDs after auth delete). CRM rows under that agent stay; see
--     optional block below to remove the agent subtree instead.
--   • Nulls `referral_codes` / `referral_events` auth_user_id (no FK to auth).
--   • Optionally deletes analytics rows that would otherwise become anonymous
--     (`ON DELETE SET NULL` targets), for stricter data removal.
--   • Deletes `auth.users` — cascades `user_profiles`, `leadsmart_users`,
--     `propertytools_users`, `profiles`, token tables, `ai_usage`, etc., per
--     your migrations.
--
-- What it does NOT do:
--   • Cancel Stripe subscriptions or delete Stripe customers — do that in
--     Stripe Dashboard (or your billing flow) before/after if needed.
--
-- Run in: Supabase Dashboard → SQL Editor (role must DELETE on auth.users).
-- Or: from `apps/leadsmartai`, after replacing UUIDs in a local copy only:
--   node ./scripts/apply-supabase-sql-remote.mjs ../propertytoolsai/supabase/scripts/delete_user_by_id.sql
--     (do not commit files with real UUIDs).
--
-- 1) PREVIEW — run alone first; confirm id + email.
-- =============================================================================

-- select id, email, created_at
-- from auth.users
-- where id = 'REPLACE_WITH_USER_UUID'::uuid;

-- =============================================================================
-- 2) DELETE — set UUID, then run the whole block once.
-- =============================================================================

begin;

do $body$
declare
  v_user_id uuid := 'REPLACE_WITH_USER_UUID'::uuid;
  n int;
begin
  if v_user_id is null or v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set v_user_id to the real auth user UUID before running.';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_user_id) then
    raise exception 'No row in auth.users for id %', v_user_id;
  end if;

  -- Profile photos (upload path `{user.id}/profile-…`).
  delete from storage.objects o
  where o.bucket_id = 'avatars'
    and o.name like (v_user_id::text || '/%');

  -- Agents are not FK-linked to auth in this schema; detach login only.
  update public.agents a
  set auth_user_id = null
  where a.auth_user_id = v_user_id;

  update public.referral_codes rc
  set auth_user_id = null
  where rc.auth_user_id = v_user_id;

  update public.referral_events re
  set auth_user_id = null
  where re.auth_user_id = v_user_id;

  -- ---------------------------------------------------------------------------
  -- OPTIONAL — stricter purge: remove rows tied to this user instead of leaving
  -- them with user_id = NULL after auth delete (GDPR-style). Safe to omit.
  -- ---------------------------------------------------------------------------
  -- delete from public.events where user_id = v_user_id;
  -- delete from public.home_value_sessions where user_id = v_user_id;
  -- delete from public.tool_events where user_id = v_user_id;
  -- delete from public.tool_usage_logs where user_id = v_user_id;
  -- delete from public.usage_events where user_id = v_user_id;
  -- delete from public.subscription_events where user_id = v_user_id;
  -- delete from public.opportunities where user_id = v_user_id;
  -- delete from public.home_value_leads where user_id = v_user_id;

  delete from auth.users u where u.id = v_user_id;

  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Expected exactly one auth user deleted, got %', n;
  end if;
end;
$body$;

commit;

-- =============================================================================
-- OPTIONAL — destroy CRM agent + dependents for this login (dangerous).
-- Run *before* the block above, only if you intend to wipe that agent’s data.
-- `public.agents` has dependent tables; truncating one agent usually means
-- targeted deletes — prefer manual review or a dedicated admin tool.
-- =============================================================================

-- delete from public.agents where auth_user_id = 'REPLACE_WITH_USER_UUID'::uuid;
