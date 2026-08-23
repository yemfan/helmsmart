-- =============================================================================
-- AI Business Works Partner Platform - reference data seed
--
-- Idempotent. Seeds the product catalogue, recognition levels, compensation
-- plan version 1 (25 / 10 / 10 direct, 5% single-generation override), the
-- Academy curriculum, the resource library and the legal document set.
--
-- The rules JSON below is the same shape as `CompensationRules` in
-- lib/compensation/types.ts. After this seed runs, the DATABASE is the source
-- of truth and administrators change the numbers there.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
insert into abw_products (key, name, tagline, description, audience, site_url, accent, sort_order)
values
  ('closeboss', 'CloseBoss AI', 'The AI Sales Team for Real Estate.',
   'Capture leads, follow up instantly, qualify prospects and automate client communication so real estate professionals spend their time with people who are ready to transact.',
   'Real estate professionals, teams and brokerages', 'https://www.closeboss.ai', 'cyan', 1),
  ('marketingboss', 'MarketingBoss AI', 'The AI Marketing Team for Business.',
   'Plan campaigns, create and distribute content across channels, and keep optimising - the work of a marketing department, run by an AI team.',
   'Small and mid-sized businesses that need marketing output', 'https://www.marketingbossai.com', 'gold', 2),
  ('helmsmart', 'HelmSmart AI', 'The AI Business Operating Platform.',
   'Communication, workflows, business knowledge and an AI Workforce in one operating layer for the whole company.',
   'Operators running multi-function businesses', 'https://www.helmsmart.ai', 'navy', 3)
on conflict (key) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      description = excluded.description,
      audience = excluded.audience,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Recognition levels
-- -----------------------------------------------------------------------------
insert into abw_partner_levels (key, name, description, min_active_customers, max_active_customers, requires_leader_qualification, sort_order)
values
  ('partner', 'Partner', 'Working with your first customers.', 1, 4, false, 1),
  ('builder', 'Builder', 'A working book of active customers.', 5, 9, false, 2),
  ('pro_partner', 'Pro Partner', 'An established customer base across products.', 10, 24, false, 3),
  ('elite', 'Elite', 'A substantial, retained customer base.', 25, null, false, 4),
  ('leader', 'Leader', 'Meets the full Leadership qualification.', 10, null, true, 5)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      min_active_customers = excluded.min_active_customers,
      max_active_customers = excluded.max_active_customers,
      requires_leader_qualification = excluded.requires_leader_qualification,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Compensation plan V1
-- -----------------------------------------------------------------------------
insert into abw_compensation_plans (key, name, description, product_id, is_default)
values ('default', 'AI Business Works Partner Plan',
        'The default plan. Applies to every product that does not carry a plan of its own.',
        null, true)
on conflict (key) do nothing;

insert into abw_compensation_plan_versions
  (plan_id, version, label, status, effective_from, effective_until, rules, notes, activated_at)
select
  -- current_date, not a fixed future date: a seeded plan that is not yet in
  -- effect would make the engine refuse to calculate any commission.
  p.id, 1, 'Plan V1', 'active', current_date, null,
  jsonb_build_object(
    'direct', jsonb_build_object(
      'yearRatesBps', jsonb_build_array(2500, 1000, 1000),
      'durationMonths', 36
    ),
    'leadership', jsonb_build_object(
      'generationRatesBps', jsonb_build_array(500),
      'maxGenerations', 1,
      'durationMonths', 36
    ),
    'leaderQualification', jsonb_build_object(
      'minPersonalActiveCustomers', 10,
      'minActiveDirectPartners', 1,
      'requireAcademyTraining', true,
      'requireGoodStanding', true
    ),
    'qualifyingRevenue', jsonb_build_object(
      'eligibleEventTypes', jsonb_build_array('new_subscription', 'renewal', 'upgrade', 'add_on', 'expansion'),
      'excludeTaxes', true,
      'commissionOnNetOfDiscount', true,
      'excludeCredits', true,
      'reverseOnRefund', true,
      'reverseOnChargeback', true,
      'minimumQualifyingRevenueCents', 0
    ),
    'customerDiscount', jsonb_build_object(
      'defaultDiscountBps', 1000,
      'maxDiscountBps', 2000,
      'discountDurationMonths', 12
    ),
    'versionAnchor', 'customer_start'
  ),
  'Seeded default plan. Subject to legal review before public launch.',
  now()
from abw_compensation_plans p
where p.key = 'default'
on conflict (plan_id, version) do nothing;

insert into abw_compensation_audit_log (setting_path, previous_value, new_value, summary, reason, plan_id, plan_version_id)
select 'plan', null, 'Plan V1',
       'Compensation plan V1 seeded: 25% / 10% / 10% direct over 36 months, 5% single-generation Leadership Override over 36 months.',
       'Initial platform seed.',
       v.plan_id, v.id
from abw_compensation_plan_versions v
join abw_compensation_plans p on p.id = v.plan_id
where p.key = 'default' and v.version = 1
  and not exists (
    select 1 from abw_compensation_audit_log l where l.plan_version_id = v.id and l.setting_path = 'plan'
  );

-- -----------------------------------------------------------------------------
-- Academy curriculum
-- -----------------------------------------------------------------------------
insert into abw_academy_courses (key, title, summary, track, product_key, duration_minutes, lesson_count, is_required_for_leadership, sort_order)
values
  ('ai-business-fundamentals', 'AI Business Fundamentals',
   'What AI actually does well in a business today, where it fails, and how to talk about it without overselling.',
   'foundation', null, 90, 6, false, 1),
  ('ai-workforce', 'AI Workforce',
   'How AI employees are structured, what they can own end to end, and where a human stays in the loop.',
   'foundation', null, 75, 5, false, 2),
  ('closeboss-ai', 'CloseBoss AI',
   'The AI sales team for real estate: lead capture, instant follow-up, qualification and the handoff to the agent.',
   'product', 'closeboss', 120, 8, false, 3),
  ('marketingboss-ai', 'MarketingBoss AI',
   'Planning, producing and distributing marketing with an AI marketing team.',
   'product', 'marketingboss', 120, 8, false, 4),
  ('helmsmart-ai', 'HelmSmart AI',
   'Running communication, workflows and business knowledge on one AI operating platform.',
   'product', 'helmsmart', 120, 8, false, 5),
  ('customer-discovery', 'Customer Discovery',
   'Finding the real operational pain before you recommend anything.',
   'sales', null, 60, 5, false, 6),
  ('product-demonstration', 'Product Demonstration',
   'Running a demo that shows the customer their own workflow, not a feature tour.',
   'sales', null, 75, 6, false, 7),
  ('sales-skills', 'Sales Skills',
   'Structuring a conversation, handling objections honestly, and knowing when the answer is no.',
   'sales', null, 90, 7, false, 8),
  ('content-marketing', 'Content Marketing',
   'Building professional visibility so businesses come to you.',
   'growth', null, 60, 5, false, 9),
  ('customer-success', 'Customer Success',
   'Onboarding, adoption and retention - the work that makes recurring commissions recur.',
   'growth', null, 75, 6, false, 10),
  ('partner-leadership', 'Partner Leadership',
   'Developing Direct Partners, and the responsibilities that come with the Leadership Override.',
   'leadership', null, 120, 8, true, 11),
  ('compliance', 'Compliance',
   'What you may and may not say about the products, the program and potential earnings.',
   'leadership', null, 60, 5, true, 12)
on conflict (key) do update
  set title = excluded.title,
      summary = excluded.summary,
      track = excluded.track,
      product_key = excluded.product_key,
      duration_minutes = excluded.duration_minutes,
      lesson_count = excluded.lesson_count,
      is_required_for_leadership = excluded.is_required_for_leadership,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Resource library
-- -----------------------------------------------------------------------------
insert into abw_resources (key, title, description, category, format, product_key, is_partner_only, sort_order)
values
  ('overview-deck', 'AI Business Works Overview Deck', 'The ecosystem, the three products, and where each one fits.', 'sales', 'deck', null, true, 1),
  ('closeboss-deck', 'CloseBoss AI Sales Deck', 'Positioning and proof points for real estate professionals.', 'sales', 'deck', 'closeboss', true, 2),
  ('marketingboss-deck', 'MarketingBoss AI Sales Deck', 'Positioning for owners carrying marketing themselves.', 'sales', 'deck', 'marketingboss', true, 3),
  ('helmsmart-deck', 'HelmSmart AI Sales Deck', 'Positioning for operators running multi-function businesses.', 'sales', 'deck', 'helmsmart', true, 4),
  ('product-comparison', 'Product Comparison Sheet', 'Which product for which business, side by side.', 'sales', 'document', null, true, 5),
  ('demo-scripts', 'Product Demo Scripts', 'A demo structure per product, with the questions to ask first.', 'sales', 'document', null, true, 6),
  ('discovery-questions', 'Customer Discovery Questions', 'The questions that surface real operational pain.', 'sales', 'document', null, true, 7),
  ('email-templates', 'Email Templates', 'Introduction, follow-up, demo recap and re-engagement.', 'marketing', 'template', null, true, 8),
  ('sms-templates', 'SMS Templates', 'Short, compliant follow-up messages.', 'marketing', 'template', null, true, 9),
  ('social-posts', 'Social Media Post Library', 'Professional posts about AI adoption you can publish as yourself.', 'marketing', 'template', null, true, 10),
  ('video-scripts', 'Video Scripts', 'Short explainer scripts for each product.', 'marketing', 'template', null, true, 11),
  ('promotional-graphics', 'Promotional Graphics', 'Brand-correct graphics sized for each channel.', 'marketing', 'graphics', null, true, 12),
  ('product-brochures', 'Product Brochures', 'Print and PDF one-pagers per product.', 'marketing', 'document', null, true, 13),
  ('case-studies', 'Customer Case Studies', 'What businesses changed, and what happened after.', 'proof', 'document', null, true, 14),
  ('brand-kit', 'Brand Kit', 'Logos, colours and correct usage for AI Business Works and each product.', 'brand', 'graphics', null, true, 15),
  ('marketing-guidelines-doc', 'Partner Marketing Guidelines', 'What you may and may not claim. Read before you publish anything.', 'compliance', 'document', null, false, 16)
on conflict (key) do update
  set title = excluded.title,
      description = excluded.description,
      category = excluded.category,
      format = excluded.format,
      product_key = excluded.product_key,
      is_partner_only = excluded.is_partner_only,
      sort_order = excluded.sort_order;
