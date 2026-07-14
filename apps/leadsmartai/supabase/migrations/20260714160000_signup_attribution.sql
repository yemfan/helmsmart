-- Signup attribution — "where did this account come from?"
--
-- Captured first-touch on the client (utm_*, click ids, referrer, landing page)
-- and written onto the account row at signup. Nullable jsonb so direct signups
-- (no marketing params) just carry landing_path + first_seen_at.

alter table public.agents
  add column if not exists signup_attribution jsonb;

alter table public.user_profiles
  add column if not exists signup_attribution jsonb;
