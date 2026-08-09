-- Business profile on the Brand Kit: paste your company URL once and the AI
-- researches the business (same engine as playbook research), stores the
-- brief, and generates topic presets tailored to THAT business — these feed
-- the schedule's Available-topics box instead of only generic presets.

alter table public.brand_kits
  add column if not exists company_url text,
  add column if not exists business jsonb,        -- the researched BrandBrief
  add column if not exists topic_presets text[];  -- AI-generated, business-specific topics
