-- Brokerage branding, set once by the team owner and shown on every member's
-- public hub: the brokerage name and logo in the header, and its license,
-- website and required disclosure in the footer. Kept as one document so a
-- field can be added without a migration; lib/teams/brand.ts owns the shape.

alter table public.teams
  add column if not exists brand jsonb;

comment on column public.teams.brand is 'Brokerage brand shown on member hubs: {name, logoUrl, website, license, disclosure}. Null = no brokerage branding.';
