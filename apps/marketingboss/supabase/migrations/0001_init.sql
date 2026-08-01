-- MarketingBoss AI — Slice 2 schema: generations history + media storage.

-- One row per generated asset, owned by the user who made it.
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('image', 'video')),
  prompt text not null,
  model text,
  aspect text,
  media_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);

alter table public.generations enable row level security;

create policy "own generations select" on public.generations
  for select using (auth.uid() = user_id);
create policy "own generations insert" on public.generations
  for insert with check (auth.uid() = user_id);
create policy "own generations delete" on public.generations
  for delete using (auth.uid() = user_id);

-- Public-read bucket for the rendered media (so <img>/<video> can load it).
-- Writes are still gated: a user may only write under a folder named for their uid.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media read" on storage.objects
  for select using (bucket_id = 'media');
create policy "media insert own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
