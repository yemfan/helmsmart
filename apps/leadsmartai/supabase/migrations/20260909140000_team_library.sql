-- The brokerage content library: approved captions, listing-ad wording and
-- shared media (a logo lockup, a brand video, a flyer) that any member can
-- post from. Managers add and remove; every member reads. Each agent still
-- posts from their own account and spends their own credits — the library
-- shares words and files, never billing. Service-role only.

create table if not exists public.team_library_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('caption', 'media', 'link')),
  title text not null,
  body text,
  media_url text,
  created_by_agent_id bigint not null references public.agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.team_library_items is 'Brokerage-approved captions, media and links members post from. kind: caption (body), media (media_url, body optional), link (media_url).';

create index if not exists idx_team_library_items_team
  on public.team_library_items (team_id, created_at desc);

alter table public.team_library_items enable row level security;
