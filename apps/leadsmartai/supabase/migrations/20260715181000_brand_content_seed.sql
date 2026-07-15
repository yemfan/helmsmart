-- Move the RealtyBoss brand onto the agent social engine.
--
-- The brand poster used to be a hardcoded TypeScript array (BRAND_POSTS) walked
-- by two bespoke crons. That design had a terminal flaw: it published the first
-- unposted entry and, once the array ran out, no-op'd forever with no signal.
-- The brand is really just "an agent that happens to be us", so this seeds it as
-- exactly that — owned content + autopilot — and the generic weekly engine
-- (social-weekly -> scheduled_posts -> publish-scheduled) takes it from here.
--
-- Guarded: agent 26 is the brand's agent id in PRODUCTION only. Everywhere else
-- (local, preview, a fresh restore) this whole block is a clean no-op rather than
-- an FK violation. NOTE the guard is load-bearing for a second reason: inserting
-- with a NULL agent_id would silently make the brand's founder-voice copy SHARED,
-- i.e. recommend it to every real agent. Fail closed instead.

do $$
declare
  v_agent bigint := 26;
  v_seeded int := 0;
begin
  if not exists (select 1 from public.agents where id = v_agent) then
    raise notice 'brand seed: agent % not present — skipping (expected outside prod)', v_agent;
    return;
  end if;

  -- Titles are 'brand:<key>', preserving the BRAND_POSTS key as the stable
  -- identity so brand_social_log history can be joined back to a library row
  -- (see the anti-repeat backfill at the bottom).
  --
  -- hook / body / cta split so that composeEvergreenCaption()
  -- (hook + '\n\n' + body + '\n\n' + cta) reproduces the original caption byte
  -- for byte. cta is the trailing URL line.
  insert into public.social_content_library
    (agent_id, category, title, hook, body, cta, hashtags, status)
  values
    -- ── Founder voice (first person) ────────────────────────────────────────
    (v_agent, 'brand', 'brand:founder_origin',
     $t$I'm a realtor. Before RealtyBoss, I tried everything to automate my business.$t$,
     $t$ChatGPT, Claude, DeepSeek, Grok. I even built my own AI agent.

And it still broke. Automations failed silently. I'd miss a call in the middle of a showing. I was hand-translating messages between my English- and Chinese-speaking clients. I was spending hours on the work that was supposed to save me hours.

Then it hit me: every realtor is fighting this exact battle — and none of us should have to build the tools ourselves.

So I built the thing I wished existed. An AI team that just works, made for real estate.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','AI'], 'active'),

    (v_agent, 'brand', 'brand:founder_broker_crm',
     $t$I talked to a broker with over 1,000 agents.$t$,
     $t$The brokerage had bought every single one of them a CRM license. Six figures a year.

Almost nobody logged in.

That's the real problem in real estate tech: the tools exist, but they make YOU do the work. A CRM reminds you to follow up. It doesn't actually follow up.

That's the whole idea behind RealtyBoss — an AI team that does the work, not another dashboard you'll ignore.$t$,
     $t$realtybossai.com$t$, array['RealEstate','CRM','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:founder_missed_call',
     $t$The deal I lost that changed everything:$t$,
     $t$I was in a showing. My phone rang — a new lead. I couldn't pick up. By the time I called back that evening, they'd already signed with someone else.

A missed call is a missed commission. I never wanted that to happen again.

Now an AI receptionist answers every one of my calls, 24/7 — and texts back the ones it can't get to. That alone paid for itself.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:founder_bilingual',
     $t$A lot of my clients speak Chinese. A lot speak English. I speak both — so I became the translator in every transaction.$t$,
     $t$Rewriting texts. Re-explaining disclosures. Twice the work on every deal.

So I made sure RealtyBoss works natively in English AND Chinese — calls, texts, listings, disclosures. Not google-translated. Actually localized.

If you serve immigrant buyers and sellers, you know how much this matters.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:founder_ai_team',
     $t$I couldn't afford to hire an ISA, a transaction coordinator, and a marketing person.$t$,
     $t$Most agents can't. So we end up doing all three jobs ourselves, badly, at 10pm.

I built RealtyBoss so I'd have a team without the payroll — a receptionist, a sales assistant, a marketing assistant, a transaction coordinator, and an accountant. All AI. All working while I sleep.$t$,
     $t$realtybossai.com$t$, array['RealEstate','PropTech','AI'], 'active'),

    (v_agent, 'brand', 'brand:founder_followup',
     $t$Confession: I was terrible at follow-up.$t$,
     $t$Everyone says the fortune's in the follow-up. But after a full day of showings and paperwork, the last thing I wanted to do was call 20 leads.

So I stopped relying on willpower and handed the job to AI. Real calls, real texts, every lead, on cadence — while I focus on the ones ready to move.

My pipeline stopped leaking.$t$,
     $t$realtybossai.com$t$, array['RealEstate','LeadGeneration','AI'], 'active'),

    (v_agent, 'brand', 'brand:founder_build_vs_use',
     $t$I spent months tuning prompts and stitching together AI tools to run my real estate business.$t$,
     $t$Then I realized: no realtor should have to do this. You should be selling homes, not debugging automations.

So everything I figured out the hard way is now just… built in. You talk to it like a person, and the work gets done.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','AI'], 'active'),

    (v_agent, 'brand', 'brand:founder_speed',
     $t$I used to think I was fast at responding to leads. Then I looked at the data.$t$,
     $t$Respond in 5 minutes and your odds of connecting multiply. Respond in an hour and the lead is basically gone.

No human is glued to their phone 24/7. That's the one thing AI is genuinely better at — so I let it answer and qualify every lead the second it comes in.$t$,
     $t$realtybossai.com$t$, array['RealEstate','LeadGeneration','AI'], 'active'),

    (v_agent, 'brand', 'brand:founder_compliance',
     $t$The scariest part of marketing at scale as a realtor? One wrong phrase in a listing and you've got a Fair Housing problem.$t$,
     $t$I didn't want to hand my clients AI-written content that could get them in trouble. So everything RealtyBoss writes for the public runs through a compliance check first.

Market aggressively. Sleep at night.$t$,
     $t$realtybossai.com$t$, array['RealEstate','FairHousing','Realtor'], 'active'),

    (v_agent, 'brand', 'brand:founder_free_skills',
     $t$I just made our entire 59-skill Realtor AI library free. No signup.$t$,
     $t$Why give it away? Because I remember spending nights figuring out the right prompt to write a decent listing description or a CMA. Every realtor is reinventing the same wheel.

Here's the wheel — listing copy, CMAs, objection scripts, farm campaigns, each with a Fair-Housing-safe prompt built in.$t$,
     $t$realtybossai.com/skills-library$t$, array['RealEstate','Realtor','AI'], 'active'),

    -- ── Brand voice (third person) ──────────────────────────────────────────
    (v_agent, 'brand', 'brand:skills_library',
     $t$We made our entire 59-skill Realtor AI Skills Library free. 🎁$t$,
     $t$Listing descriptions, CMAs, farm campaigns, objection scripts, buyer consults — each with a Fair-Housing-safe prompt built in. No signup.$t$,
     $t$Grab it → realtybossai.com/skills-library$t$, array['RealEstateMarketing','Realtor','AI'], 'active'),

    (v_agent, 'brand', 'brand:missed_call',
     $t$📞 A missed call is a missed commission.$t$,
     $t$RealtyBoss's AI Receptionist answers every call 24/7 — and the ones it can't, it texts back and keeps calling until it connects. You never lose a lead to voicemail again.$t$,
     $t$See it → realtybossai.com$t$, array['RealEstate','Realtor','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:playbooks',
     $t$What if your listing marketed itself?$t$,
     $t$Sign a listing → RealtyBoss builds the marketing plan, writes the ads, launches, and optimizes weekly. Buyers too: consult → search plan → matches on autopilot. Your AI team runs the whole engagement.$t$,
     $t$realtybossai.com$t$, array['RealEstate','PropTech','AI'], 'active'),

    (v_agent, 'brand', 'brand:hire_ai_team',
     $t$You don't need to hire an ISA, a TC, and a marketing coordinator.$t$,
     $t$RealtyBoss is an AI real estate team — Receptionist, Sales, Marketing, Transaction, and Accounting assistants — for a fraction of one salary. Close more without growing payroll.$t$,
     $t$realtybossai.com$t$, array['RealEstate','PropTech','AI'], 'active'),

    (v_agent, 'brand', 'brand:follow_up',
     $t$The fortune's in the follow-up — but who has time to call and text every lead?$t$,
     $t$RealtyBoss's AI Sales Assistant does it for you: real voice calls + texts to every lead, on cadence, until they book. You just take the appointments.$t$,
     $t$realtybossai.com$t$, array['RealEstate','LeadGeneration','AI'], 'active'),

    (v_agent, 'brand', 'brand:compliance_gate',
     $t$Fair Housing violations start with one bad phrase in a listing.$t$,
     $t$Everything RealtyBoss writes for the public passes a built-in compliance gate — Fair Housing + advertising — before it reaches a client. Market at scale, without the license risk.$t$,
     $t$realtybossai.com$t$, array['RealEstate','FairHousing','Realtor'], 'active'),

    (v_agent, 'brand', 'brand:bilingual',
     $t$Serving Chinese-speaking buyers and sellers?$t$,
     $t$RealtyBoss works in English AND Chinese — calls, texts, listings, and disclosures, localized (not just translated). A moat most tools can't match.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:crm_dead',
     $t$Your CRM reminds you to follow up. RealtyBoss actually does it.$t$,
     $t$Real calls. Real texts. Every lead. That's the difference between a database and a team.$t$,
     $t$realtybossai.com$t$, array['RealEstate','CRM','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:cma',
     $t$Winning the listing starts with the price conversation.$t$,
     $t$RealtyBoss builds a data-backed CMA with real comps — a defensible value range that makes you the expert before you walk in the door.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','CMA'], 'active'),

    (v_agent, 'brand', 'brand:deadlines',
     $t$Missed deadlines kill deals — and create liability.$t$,
     $t$RealtyBoss's Transaction Assistant tracks every contingency and closing milestone, and flags what's due before it's late. Nothing falls through the cracks.$t$,
     $t$realtybossai.com$t$, array['RealEstate','TransactionCoordinator','PropTech'], 'active'),

    (v_agent, 'brand', 'brand:speed_to_lead',
     $t$Respond in 5 minutes and contact rates multiply. Respond in an hour and the lead's gone.$t$,
     $t$RealtyBoss answers portal leads instantly — day or night — and qualifies them on the spot.$t$,
     $t$realtybossai.com$t$, array['RealEstate','LeadGeneration','AI'], 'active'),

    (v_agent, 'brand', 'brand:net_sheet',
     $t$The #1 seller question: "What do I actually walk away with?"$t$,
     $t$RealtyBoss builds a clear net sheet in seconds — gross to net, reconciled to the dollar. Trust, built on transparency.$t$,
     $t$realtybossai.com$t$, array['RealEstate','Realtor','HomeSelling'], 'active')
  on conflict (agent_id, title) do nothing;

  get diagnostics v_seeded = row_count;
  raise notice 'brand seed: % library rows for agent %', v_seeded, v_agent;

  -- Opt the brand into the weekly engine on autopilot. Presence of this row is
  -- what makes runWeeklyRecommendationsForOptedInAgents() pick the agent up at
  -- all; mode='auto' is what auto-schedules instead of leaving drafts to approve.
  insert into public.boss_autopilot_settings (agent_id, assignee, channel, mode)
  values (v_agent, 'marketing_assistant', 'social', 'auto')
  on conflict (agent_id, assignee, channel) do update
    set mode = 'auto', updated_at = now();

  -- Anti-repeat backfill. Two brand posts already went out on LinkedIn under the
  -- old poster (brand_social_log). The engine's anti-repeat works off the agent's
  -- recent social_post_recommendations rows, which don't exist yet — so without
  -- this, week one could re-post something published days ago. Recording them as
  -- already-used recs teaches the engine the history using its own mechanism
  -- rather than bolting on a new one.
  --
  -- Joins on 'brand:' || post_key, which naturally ignores the ptai-prefixed keys
  -- PropertyTools AI writes to this shared table.
  insert into public.social_post_recommendations
    (agent_id, week_of, source_type, library_id, caption, hashtags, status)
  select
    v_agent,
    (date_trunc('week', b.posted_at))::date,
    'evergreen',
    l.id,
    concat_ws(E'\n\n', l.hook, l.body, l.cta),
    l.hashtags,
    'copied'
  from (
    select distinct on (post_key) post_key, posted_at
    from public.brand_social_log
    order by post_key, posted_at desc
  ) b
  join public.social_content_library l
    on l.agent_id = v_agent
   and l.title = 'brand:' || b.post_key;

  get diagnostics v_seeded = row_count;
  raise notice 'brand seed: % already-posted recs backfilled for anti-repeat', v_seeded;
end $$;
