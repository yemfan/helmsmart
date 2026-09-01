-- The agent's own Meta Pixel and Google Analytics, per hub.
--
-- One row per agent. Deliberately NOT columns on `agents`: that table is
-- already 48 columns of unrelated concerns, and these are read on every public
-- hub render while most agents will never set them.
--
-- NEVER A SHARED PIXEL. Each agent's tracking is isolated — one CloseBoss
-- pixel across every hub would pool one agent's visitors into another's
-- retargeting audience, which is both useless to them and a disclosure we
-- have made to nobody.
--
-- The Conversions API token is a CREDENTIAL, unlike the two ids. A Pixel id
-- and a GA measurement id are public by design — they ship in the page source
-- of every site that uses them, so storing them in the clear matches what they
-- already are. The CAPI token is not: it can post events on the agent's behalf
-- and belongs in Vault. Left null here until the CAPI work lands, rather than
-- adding a plaintext column now that would be wrong to fill.
--
-- Plan gating is NOT enforced here. A row may exist for an agent who has since
-- downgraded, and deleting their configuration on a failed payment would mean
-- they have to find their Pixel id again to come back. The gate lives at the
-- render, which is the moment the entitlement actually matters.

create table if not exists public.agent_tracking_config (
  agent_id bigint primary key references public.agents(id) on delete cascade,
  meta_pixel_id text null,
  ga_measurement_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_tracking_config is
  'Per-agent analytics ids for their marketing hub. One row per agent, both fields optional. Never a shared CloseBoss pixel — pooling agents into one audience would be useless to them and undisclosed.';

comment on column public.agent_tracking_config.meta_pixel_id is
  'Meta Pixel id, 15-16 digits. Public by design — it ships in the page source of every site using it. Rendered only for agents on Premium or above.';

comment on column public.agent_tracking_config.ga_measurement_id is
  'GA4 measurement id, G-XXXXXXXXXX. Public by design. Available on every tier: an agent who never buys an ad still wants to see their own traffic, and gating it reads as stingy beside every website builder.';

-- Format enforced here as well as in lib/marketing-hub/tracking.ts. A wrong id
-- fails silently in the browser — the tag loads, reports nothing, and the
-- agent concludes the feature is broken rather than the value mistyped.
alter table if exists public.agent_tracking_config
  drop constraint if exists agent_tracking_meta_pixel_format;
alter table if exists public.agent_tracking_config
  add constraint agent_tracking_meta_pixel_format
  check (meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{15,16}$');

alter table if exists public.agent_tracking_config
  drop constraint if exists agent_tracking_ga_format;
alter table if exists public.agent_tracking_config
  add constraint agent_tracking_ga_format
  check (ga_measurement_id is null or ga_measurement_id ~ '^G-[A-Z0-9]{6,12}$');

alter table if exists public.agent_tracking_config enable row level security;

-- No policies. Reads and writes both go through the service-role client with
-- an explicit agent filter: the public hub renders these server-side, and the
-- dashboard route checks ownership before writing. RLS policies are OR'd, so
-- adding a permissive one here would widen every other query against this
-- table rather than narrowing anything.
