-- Brand Kit — per-user brand memory injected into every AI draft so captions
-- and image/video prompts come out on-brand. One row per user; nothing here is
-- required (an empty/missing kit leaves generation exactly as it was).
create table if not exists public.brand_kits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  brand_name text,
  voice text,          -- brand voice / "about us" description
  audience text,       -- who the marketing is for
  primary_color text,  -- hex, e.g. #7c5cff
  accent_color text,   -- hex
  logo_url text,       -- public URL in the "media" bucket
  updated_at timestamptz not null default now()
);

alter table public.brand_kits enable row level security;

-- Owner-only: a user can read and write only their own brand kit.
create policy "own brand kit" on public.brand_kits
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
