-- ============================================================================
-- Seed: AVASC as a HelmSmart marketing tenant (draft/review only)
-- ----------------------------------------------------------------------------
-- Target: HelmSmart Core Supabase project `vpmwsnoosuiknyzdxgtk`.
--
-- PREREQUISITE: the AVASC organization must already exist. Create it through the
-- normal HelmSmart onboarding flow (so it is owned by the founder's account and
-- gets all onboarding side effects — chart of accounts, membership, etc.). This
-- seed only adds the *marketing context*; it never creates the org or mints
-- membership.
--
-- What it does (idempotent — safe to re-run):
--   1. Resolves the AVASC org by slug (slug is `avasc-<timestamp>` from onboarding).
--   2. Seeds the brand DNA into `knowledge_base` (what the generator reads).
--   3. Configures `org_social_autopilot` in REVIEW mode — generated posts land as
--      drafts for a human to approve; nothing auto-publishes. A per-weekday topic
--      map routes each of AVASC's 5 core programs to a day.
--
-- SAFETY NOTE: AVASC is a fraud-victim nonprofit; its credibility depends on
-- accuracy. HelmSmart does not yet fact-check AI copy (only review|auto modes,
-- no claim-gate). Keep this org in `review` until the claim-gate + 'assisted'
-- mode are wired into HelmSmart. Do NOT set mode='auto' here.
-- ============================================================================

do $$
declare
  org uuid;
begin
  -- Resolve the AVASC org. If onboarding used a different name/slug, set `org`
  -- to the explicit id instead of this lookup.
  select id into org
  from organizations
  where slug ilike 'avasc%' or name ilike 'AVASC%'
  order by created_at
  limit 1;

  if org is null then
    raise exception
      'AVASC org not found. Create it via HelmSmart onboarding first, then re-run.';
  end if;
  raise notice 'Seeding AVASC marketing context for org %', org;

  -- ---- 1. Brand DNA -> knowledge_base -------------------------------------
  -- Clear any prior AVASC-seeded rows so re-runs don't duplicate.
  delete from knowledge_base
  where organization_id = org and title like 'AVASC —%';

  insert into knowledge_base (organization_id, title, content, active, sort) values
    (org, 'AVASC — Mission & voice',
     'AVASC = Association of Victims Against Cyber-Scams. Tagline: "Uniting Victims. Fighting Scams. Building a Safer Future." Mission: AVASC empowers victims, raises awareness, and drives action against cyber-scams through education, community, advocacy, and real-time intelligence. Promise: We stand with victims. We raise our voices. We take action. Together, we can end cyber-scams. VOICE: accurate, cited, non-sensational, victim-centered, hopeful. Share public-safe guidance only — never operational detail that could help a scammer. Never shame victims. Do not invent statistics; if a number is used it must be attributable to a public source (FTC, FBI IC3, CISA, CFPB).',
     true, 0),
    (org, 'AVASC — Program 1: Real-Time Scam Alerts',
     'Deliver real-time scam alerts and updates to help people spot, avoid, and stop scams before they happen.',
     true, 1),
    (org, 'AVASC — Program 2: Education & Awareness',
     'Educate the public through easy-to-understand resources, videos, and guides to build strong digital awareness and scam-resistant habits.',
     true, 2),
    (org, 'AVASC — Program 3: Victim Support & Community',
     'Provide a safe community for victims to connect, share experiences, get support, and heal together.',
     true, 3),
    (org, 'AVASC — Program 4: Advocacy & Policy Reform',
     'Advocate for stronger laws, better enforcement, and fairer policies to protect victims and hold scammers accountable.',
     true, 4),
    (org, 'AVASC — Program 5: Data, Research & Intelligence',
     'Collect, analyze, and share scam data and trends to inform the public, support research, and drive prevention.',
     true, 5);

  -- ---- 2. Autopilot: REVIEW mode (drafts only) ----------------------------
  -- day_topics keys are 0=Sun..6=Sat; Mon–Fri each carry one program's theme.
  -- ad_template='scam_decision_tree' → each post is a branded "Could this be a
  -- scam?" decision-tree image + its caption (see lib/social/renderAd.tsx),
  -- rotating scam types. Requires migration 00084_autopilot_ad_template.
  insert into org_social_autopilot
    (organization_id, enabled, mode, posts_per_week, tone, ad_template, day_topics)
  values
    (org, true, 'review', 5, 'educational', 'scam_decision_tree',
     jsonb_build_object(
       '1', 'Real-time scam alert: one current scam and the concrete red flags that give it away, so people can spot and stop it.',
       '2', 'Education: one practical, easy habit that makes readers more scam-resistant this week.',
       '3', 'Victim support: a compassionate, non-judgmental reminder that recovery help and community exist — it was not your fault.',
       '4', 'Advocacy: why stronger consumer protections and enforcement matter, framed non-partisanly around protecting people.',
       '5', 'Data & research: one scam trend or statistic (attributable to a public source like FTC/IC3/CFPB), framed for prevention.'
     ))
  on conflict (organization_id) do update set
     enabled        = excluded.enabled,
     mode           = excluded.mode,
     posts_per_week = excluded.posts_per_week,
     tone           = excluded.tone,
     ad_template    = excluded.ad_template,
     day_topics     = excluded.day_topics,
     updated_at     = now();

  raise notice 'AVASC marketing context seeded (review mode, 5 draft topics/week).';
end $$;
