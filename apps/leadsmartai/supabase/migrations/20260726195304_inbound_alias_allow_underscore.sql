-- Allow underscores in inbound email alias local parts.
-- Follow-up to 20260618000000_alias_local_part_allow_dots.sql: widens the
-- local_part format check to also permit "_" alongside "." and "-".
--
-- NOTE: This migration was originally applied directly to the production
-- database (version 20260726195304) without a committed .sql file. This file
-- reconciles the repo with production (repo-first record-keeping); the DDL is
-- reproduced verbatim from the applied migration.

alter table public.agent_inbound_aliases
  drop constraint if exists agent_inbound_aliases_local_part_format;

alter table public.agent_inbound_aliases
  add constraint agent_inbound_aliases_local_part_format
    check (local_part ~ '^[a-z0-9][a-z0-9._\-]{2,62}[a-z0-9]$');
