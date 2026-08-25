-- MarketingBoss 3.0 Phase 1 — Owned click tracking.
--
-- Per-platform click data is real but too patchy to build on: Pinterest reports
-- PIN_CLICK, Facebook reports post_clicks with read_insights, LinkedIn only for
-- organisation shares, and YouTube / Instagram / Threads / TikTok report nothing
-- usable. Owning the redirect is the only click source that behaves identically
-- everywhere links are clickable at all.
--
-- We count the click. We do NOT claim to see conversions — that stays with the
-- owner's own analytics, which is what the UTM columns on brand_kits are for.
--
-- Privacy: no IP addresses, no cookies, no identifiers. A click row is a
-- timestamp plus coarse provenance, which is all an attribution count needs.

create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,               -- the /r/<token> slug
  destination_url text not null,
  mission_id uuid references public.missions (id) on delete set null,
  post_id uuid references public.campaign_posts (id) on delete set null,
  platform text,                            -- which platform this particular link was published to
  created_at timestamptz not null default now()
);

create index if not exists tracked_links_user_idx
  on public.tracked_links (user_id, created_at desc);
create index if not exists tracked_links_post_idx
  on public.tracked_links (post_id);

create table if not exists public.link_clicks (
  id bigserial primary key,
  link_id uuid not null references public.tracked_links (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer text,
  user_agent text
);

create index if not exists link_clicks_link_idx
  on public.link_clicks (link_id, clicked_at desc);

alter table public.tracked_links enable row level security;
alter table public.link_clicks enable row level security;

-- Owners read their own links. The redirect route resolves tokens through the
-- service-role client, since the visitor clicking is not signed in.
drop policy if exists "tracked_links_owner_all" on public.tracked_links;
create policy "tracked_links_owner_all" on public.tracked_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Clicks are readable by the link's owner; writes only ever come from the
-- service-role redirect handler (no insert policy on purpose).
drop policy if exists "link_clicks_owner_read" on public.link_clicks;
create policy "link_clicks_owner_read" on public.link_clicks
  for select using (
    exists (
      select 1 from public.tracked_links t
      where t.id = link_clicks.link_id and t.user_id = auth.uid()
    )
  );
