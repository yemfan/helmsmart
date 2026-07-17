-- SwipenDone Phase 1 schema (SD-HANDOFF-001 §4).
-- Phase 2 tables (diagnoses, registrations) are created now so no migration pain later.
-- RLS: sellers own their rows; anon can read published guides + steps and insert
-- scans/events/registrations/waitlist. Analytics reads go through the service role.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists sellers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  brand_name text,
  preferred_lang text default 'en' check (preferred_lang in ('en','zh')),
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  name_en text not null,
  name_zh text,
  model_no text,
  created_at timestamptz default now()
);

create table if not exists guides (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  slug text unique,                         -- short, url-safe, immutable once published
  status text default 'draft' check (status in ('draft','published','archived')),
  version int default 1,
  meta_en jsonb default '{}'::jsonb,        -- {time_estimate, people, tools}
  meta_zh jsonb default '{}'::jsonb,
  parts jsonb default '[]'::jsonb,          -- [{code,name_en,name_zh,qty}]
  published_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists steps (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  position int not null,
  title_en text, title_zh text,
  body_en text, body_zh text,
  tip_en text, tip_zh text,
  image_url text,
  unique (guide_id, position)
);

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  lang text, user_agent text, referrer text,
  created_at timestamptz default now()
);

create table if not exists step_events (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id) on delete cascade,
  guide_id uuid not null,
  step_position int,
  action text check (action in ('view','complete','parts_checked','finished','register_clicked')),
  created_at timestamptz default now()
);

-- Rate limiting: one row per generation attempt; count last hour per seller.
create table if not exists generation_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  created_at timestamptz default now()
);

-- Phase 2 tables (create now, unused until diagnosis ships)
create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  scan_id uuid references scans(id) on delete set null,
  step_ref int, input_text text, photo_url text,
  ai_response text, resolved boolean, escalated boolean default false,
  created_at timestamptz default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  buyer_email text not null,
  consent boolean default true,
  created_at timestamptz default now()
);

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_products_seller on products(seller_id);
create index if not exists idx_guides_product on guides(product_id);
create index if not exists idx_guides_status on guides(status);
create index if not exists idx_steps_guide on steps(guide_id, position);
create index if not exists idx_scans_guide on scans(guide_id, created_at desc);
create index if not exists idx_step_events_guide on step_events(guide_id);
create index if not exists idx_gen_events_seller on generation_events(seller_id, created_at desc);
create index if not exists idx_registrations_guide on registrations(guide_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table sellers enable row level security;
alter table products enable row level security;
alter table guides enable row level security;
alter table steps enable row level security;
alter table scans enable row level security;
alter table step_events enable row level security;
alter table generation_events enable row level security;
alter table diagnoses enable row level security;
alter table registrations enable row level security;
alter table waitlist enable row level security;

-- sellers: a signed-in user manages only their own row
create policy sellers_self_select on sellers for select using (id = auth.uid());
create policy sellers_self_insert on sellers for insert with check (id = auth.uid());
create policy sellers_self_update on sellers for update using (id = auth.uid());

-- products: owned via seller_id
create policy products_owner_all on products for all
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- guides: owner full CRUD; anon/authenticated may SELECT published only
create policy guides_owner_all on guides for all
  using (product_id in (select id from products where seller_id = auth.uid()))
  with check (product_id in (select id from products where seller_id = auth.uid()));
create policy guides_public_read on guides for select
  to anon, authenticated using (status = 'published');

-- steps: owner full CRUD; public SELECT only for steps of published guides
create policy steps_owner_all on steps for all
  using (guide_id in (
    select g.id from guides g join products p on p.id = g.product_id
    where p.seller_id = auth.uid()))
  with check (guide_id in (
    select g.id from guides g join products p on p.id = g.product_id
    where p.seller_id = auth.uid()));
create policy steps_public_read on steps for select
  to anon, authenticated
  using (guide_id in (select id from guides where status = 'published'));

-- scans: anon may INSERT; owner may read their guides' scans
create policy scans_public_insert on scans for insert to anon, authenticated with check (true);
create policy scans_owner_read on scans for select
  using (guide_id in (
    select g.id from guides g join products p on p.id = g.product_id
    where p.seller_id = auth.uid()));

-- step_events: anon may INSERT; owner may read
create policy step_events_public_insert on step_events for insert to anon, authenticated with check (true);
create policy step_events_owner_read on step_events for select
  using (guide_id in (
    select g.id from guides g join products p on p.id = g.product_id
    where p.seller_id = auth.uid()));

-- registrations: anon may INSERT (warranty capture); owner may read
create policy registrations_public_insert on registrations for insert to anon, authenticated with check (true);
create policy registrations_owner_read on registrations for select
  using (guide_id in (
    select g.id from guides g join products p on p.id = g.product_id
    where p.seller_id = auth.uid()));

-- generation_events: owner only
create policy gen_events_owner_all on generation_events for all
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- diagnoses (Phase 2): anon may INSERT; owner may read
create policy diagnoses_public_insert on diagnoses for insert to anon, authenticated with check (true);
create policy diagnoses_owner_read on diagnoses for select
  using (guide_id in (
    select g.id from guides g join products p on p.id = g.product_id
    where p.seller_id = auth.uid()));

-- waitlist: anon may INSERT; no public read
create policy waitlist_public_insert on waitlist for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket for guide images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('guide-images', 'guide-images', true)
on conflict (id) do nothing;

-- Public read of guide images (superseded by 20260717151000_tighten_security.sql,
-- which drops this since public buckets serve via the public URL endpoint).
create policy "guide_images_public_read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'guide-images');

-- Authenticated sellers may upload/manage within their own {uid}/ prefix
create policy "guide_images_owner_write" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'guide-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "guide_images_owner_update" on storage.objects for update
  to authenticated using (
    bucket_id = 'guide-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "guide_images_owner_delete" on storage.objects for delete
  to authenticated using (
    bucket_id = 'guide-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Auto-provision a sellers row when a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_seller()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.sellers (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_seller();
