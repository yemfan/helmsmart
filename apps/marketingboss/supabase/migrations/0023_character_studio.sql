-- Character Studio (MVP) — a persistent cast per business. Create a character
-- once (DNA + stable prompt profile + canonical portrait reference) and reuse
-- it across everything the workforce generates. See docs/marketing/character-studio.md.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.characters (id) on delete set null,  -- duplicated-from lineage
  version int not null default 1,
  name text not null,
  type text not null check (type in ('human', 'animal', 'robot', 'creature', 'mascot')),
  role text,                      -- profession / role (Realtor, Mortgage broker, AI Assistant…)
  collection text,                -- lightweight grouping ("My Real Estate Team")
  dna jsonb not null,             -- { appearance, style, personality, voice, professional } sections
  prompt_profile text,            -- STABLE generation descriptor derived from DNA — the consistency text
  reference_images text[],        -- media-bucket URLs; [0] = canonical portrait (the identity reference)
  brand_linked boolean not null default false,  -- follow the user's Brand Kit in generations
  -- Responsible design: fictional by default; real-person references require consent context.
  identity_type text not null default 'fictional'
    check (identity_type in ('fictional', 'real_person', 'brand_owned')),
  consent_note text,
  status text not null default 'active' check (status in ('active', 'archived')),
  usage_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_user_idx on public.characters (user_id, status, created_at desc);

alter table public.characters enable row level security;

create policy "characters_owner_all" on public.characters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Asset traceability: which character (if any) a render belongs to.
alter table public.generations
  add column if not exists character_id uuid references public.characters (id) on delete set null;
