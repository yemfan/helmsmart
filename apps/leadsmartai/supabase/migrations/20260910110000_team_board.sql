-- The office board: the unofficial one, where any member posts a listing,
-- a buyer need, a question, a tip, or anything else, and colleagues reply.
-- The billboard is the brokerage talking to agents; this is agents talking
-- to each other. Managers can take a post down. Service-role only.

create table if not exists public.team_board_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_agent_id bigint not null references public.agents(id) on delete cascade,
  kind text not null default 'other' check (kind in ('listing', 'buyer_need', 'question', 'tip', 'other')),
  title text not null,
  body text,
  link_url text,
  -- Listings and buyer needs: the price, if the poster gave one.
  price numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_board_posts_team on public.team_board_posts (team_id, created_at desc);

create table if not exists public.team_board_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_board_posts(id) on delete cascade,
  author_agent_id bigint not null references public.agents(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_board_replies_post on public.team_board_replies (post_id, created_at);

create table if not exists public.team_board_likes (
  post_id uuid not null references public.team_board_posts(id) on delete cascade,
  agent_id bigint not null references public.agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, agent_id)
);

alter table public.team_board_posts enable row level security;
alter table public.team_board_replies enable row level security;
alter table public.team_board_likes enable row level security;
