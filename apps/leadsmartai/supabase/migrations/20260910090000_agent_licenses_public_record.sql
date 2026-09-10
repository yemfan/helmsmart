-- The public record behind an agent's license, read free from the
-- regulator's own lookup (California DRE today): who the license belongs
-- to, its type, whether it is current, when it expires, and the broker it
-- hangs with. Replaces the paid-verification plan: the record IS the
-- confirmation, and it fills in the agent's details as a bonus.

alter table public.agent_licenses
  add column if not exists holder_name text,
  add column if not exists license_type text,
  add column if not exists status_raw text,
  add column if not exists expires_on date,
  add column if not exists issued_on date,
  add column if not exists responsible_broker_id text,
  add column if not exists responsible_broker_name text,
  add column if not exists looked_up_at timestamptz,
  add column if not exists record jsonb;

comment on column public.agent_licenses.record is 'The parsed public record (lib/licenses/ca-dre.ts DreRecord); the columns beside it are its useful parts.';

-- 'arello' was never written; the public record is the source now.
alter table public.agent_licenses drop constraint if exists agent_licenses_verified_by_check;
alter table public.agent_licenses add constraint agent_licenses_verified_by_check
  check (verified_by in ('record', 'manager'));
