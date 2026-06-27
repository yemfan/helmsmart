-- Public SMS opt-in log (proof of consent for A2P 10DLC / TCPA).
--
-- Backs the public /sms opt-in page — a carrier-reviewable URL that shows the
-- unchecked-by-default consent checkbox + full program disclosures. Each
-- submission records the exact consent text the user agreed to, plus IP/UA and
-- timestamp, so we can evidence prior express written consent on request.
--
-- Service-role only (RLS on, no policies) — written by the /api/sms/opt-in
-- route via supabaseAdmin; never read by the anon/session client.

create table if not exists public.sms_opt_ins (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  email text,
  consent_text text not null,
  source text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists sms_opt_ins_phone_idx on public.sms_opt_ins (phone);
create index if not exists sms_opt_ins_created_at_idx on public.sms_opt_ins (created_at);

alter table public.sms_opt_ins enable row level security;
