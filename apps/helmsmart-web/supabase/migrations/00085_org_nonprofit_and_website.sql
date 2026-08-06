-- 00085: allow Non-profit organizations + capture a company website at onboarding.
--
-- Both changes are ADDITIVE and safe to apply to production BEFORE the app code
-- ships: widening a CHECK never rejects an existing row, and `website` is a new
-- nullable column. The onboarding action also writes these values best-effort,
-- so applying this migration late only delays persistence — it never breaks a
-- signup.

-- 1) Add 'nonprofit' to the allowed business structures.
alter table organizations
  drop constraint if exists organizations_entity_type_check;

alter table organizations
  add constraint organizations_entity_type_check
  check (entity_type in ('sole_prop', 'llc', 's_corp', 'c_corp', 'partnership', 'nonprofit'));

-- 2) Optional company website captured during onboarding.
alter table organizations
  add column if not exists website text;
