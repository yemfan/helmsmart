-- Move from hardcoded bilingual (_en/_zh columns) to locale-keyed JSONB so the
-- product supports N languages (launch set: en, zh, es, fr, de, ja).
-- Text is stored as a JSON object keyed by locale, e.g. {"en":"…","zh":"…"}.
-- Tables are empty at migration time, so this is a clean drop/add (no backfill).

-- products.name_en/name_zh → name jsonb (model_no stays language-neutral)
alter table products drop column if exists name_en;
alter table products drop column if exists name_zh;
alter table products add column if not exists name jsonb not null default '{}'::jsonb;

-- guides: meta_en/meta_zh → meta jsonb ({locale: {time_estimate,people,tools}});
-- parts jsonb keeps [{code, qty, name:{locale:…}}]; add enabled languages list.
alter table guides drop column if exists meta_en;
alter table guides drop column if exists meta_zh;
alter table guides add column if not exists meta jsonb not null default '{}'::jsonb;
alter table guides add column if not exists languages text[] not null default array['en','zh'];

-- steps: title/body/tip per-locale jsonb (image_url + position stay as-is)
alter table steps drop column if exists title_en;
alter table steps drop column if exists title_zh;
alter table steps drop column if exists body_en;
alter table steps drop column if exists body_zh;
alter table steps drop column if exists tip_en;
alter table steps drop column if exists tip_zh;
alter table steps add column if not exists title jsonb not null default '{}'::jsonb;
alter table steps add column if not exists body  jsonb not null default '{}'::jsonb;
alter table steps add column if not exists tip   jsonb not null default '{}'::jsonb;
