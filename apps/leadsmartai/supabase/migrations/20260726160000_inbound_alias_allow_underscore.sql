-- Inbound-alias local_part now derives from the agent's NAME in
-- lastname_firstname_MI order (e.g. "Michael Ye" -> ye_michael), which uses
-- an underscore separator. The old format check only allowed [a-z0-9.-], so
-- widen it to also permit '_'. Endpoints stay [a-z0-9] and length stays 4-64.

alter table public.agent_inbound_aliases
  drop constraint if exists agent_inbound_aliases_local_part_format;

alter table public.agent_inbound_aliases
  add constraint agent_inbound_aliases_local_part_format
    check (local_part ~ '^[a-z0-9][a-z0-9._\-]{2,62}[a-z0-9]$');
