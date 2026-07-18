-- Somewhere for a provider to keep its own identifiers.
--
-- org_oauth_tokens has exactly one spare text column (`account_email`), and
-- LinkedIn already borrowed it to hold the member URN. Meta needs THREE things
-- alongside the token — the Page id, the Page name, and the linked Instagram
-- Business user id — so there is nothing left to overload, and overloading is
-- how `account_email` ended up holding something that isn't an email.
--
-- `metadata` is deliberately provider-agnostic rather than a meta_* column set:
-- the next provider will want its own handful of ids too, and this table is the
-- generic one. Nothing here is secret — the TOKEN stays in access_token,
-- encrypted (lib/crypto.ts). Ids are public identifiers.

alter table org_oauth_tokens
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column org_oauth_tokens.metadata is
  'Provider-specific NON-SECRET identifiers. Meta: { page_id, page_name, ig_user_id }. Secrets belong in access_token (encrypted), never here.';
