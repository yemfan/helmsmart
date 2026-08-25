# MarketingBoss 3.0 — AI Marketing Workforce: Implementation Assessment

**Status:** Assessment for approval (2026-08-20). Companion to `marketingboss-2.0-blueprint.md` and `unification-proposal.md`.
**Scope:** `apps/marketingboss`, designed so the workforce core is portable to the shared marketing packages (per the approved unification direction).
**Verdict up front:** this is a **thin orchestration layer over an almost-complete workforce**, not a rebuild. Ten of the eleven requested workers already exist as engines; the eleventh is written one package away. What is missing is the *Boss* — and an honest account of what the workforce cannot yet reach (§D6, Risks).

---

## A. Existing architecture

Next 16.1.6 / React 19 / Tailwind v4, own Vercel project, own Supabase (`vsmeeydxkbrupzbnpcwq`), port 3007. Deliberately dependency-light: raw `fetch` to Anthropic, fal.ai, Stripe, Google/YouTube, TikTok, Meta, Pinterest, LinkedIn.

> **Correction to the unification doc.** MarketingBoss **already consumes `@helm/dna-marketing`** in seven files — `publish-dispatch.ts`, `publishers.ts`, `social.ts`, `oauth.ts`, `metrics.ts`, `metaPages.ts`, `app/api/social/publish/route.ts` — including `publishToAll`. Unification Phases 0–1 are effectively done; `unification-proposal.md` §1 ("does not consume `@helm/dna-marketing`") is stale.
>
> **But the dependency is undeclared.** It appears in no `package.json` and no `tsconfig` path — it resolves only because `pnpm-workspace.yaml` sets `nodeLinker: hoisted`. That works today and breaks the moment hoisting changes or the app is built in isolation. **Adding `"@helm/dna-marketing": "workspace:*"` to `apps/marketingboss/package.json` is a one-line fix and should ship with Phase 0.**

| Layer | Reality |
|---|---|
| **Identity** | Per-user (`user_id`, Supabase auth). RLS owner-scoped on every table; server routes use the service-role client and scope by `user_id` explicitly. |
| **AI** | One helper: `lib/ai.ts → anthropicJson()`. Model `claude-opus-5`, `output_config: { effort: "low", format: json_schema }`. **Every AI feature in the app is a single-shot structured-JSON call.** No tool use, no multi-turn, no conversation. |
| **Scheduler** | A single cron `/api/cron/run` at `*/15`, `maxDuration = 300`. Seven phases in one invocation: drain scheduled → finish approved → advance playbooks → refresh metrics → weekly schedule → viral refresh **or** discovery → learning synthesis. Per-phase batch caps (`DRAIN_LIMIT 8`, `APPROVED_LIMIT 2`, `ADVANCE_LIMIT 5`, `DISCOVER_LIMIT 1`). |
| **Credits** | `consume_credits` (session) / `deduct_credits` (cron) RPCs; reserve → generate → refund on failure. `lib/creditCosts.ts` is the single source of truth (image 1 / edit 2 / video 20 / upscale 5; UGC 35, swap 25). Per-playbook `budget_credits` + `spent_credits` + `auto_approve_max_credits` autonomy dial. |
| **Publishing** | 7 platforms — facebook, instagram, threads, linkedin, pinterest, youtube, tiktok — via `publish-dispatch.ts` → `publishers.ts`, OAuth in `oauth.ts` / `youtube.ts` / `tiktok.ts`, tokens in `social_connections`. |
| **Schema** | 24 migrations, user-applied (MCP can't reach this project). Tables: `profiles`, `purchases`, `subscriptions` + `subscription_grants`, `generations`, `social_connections`, `campaigns`, `campaign_posts`, `weekly_schedules`, `brand_kits` (+ business-profile columns), `opportunities`, `learnings`, `viral_items` + `viral_templates` (global, read-only to users), `characters`, `communities` + `community_saves`. |
| **IA** | The 2.0 navigation already shipped: Home · Opportunities · Actions · Playbooks · Studio · Published · Learning · Settings. |

**Convention that matters:** every new-table module (`opportunities.ts`, `learnings.ts`, `businessProfile.ts`) tolerates a pre-migration database — reads return `[]`, writes no-op. Migrations are repo-first, then user-applied. Anything new must follow this.

---

## B. Existing capabilities → workforce tools

This is the headline finding. The requested roster maps almost one-to-one onto shipped code.

| Requested worker | Already exists as | Gap |
|---|---|---|
| **TrendScout** | `viral.ts` (`findViralAds` web-search scout) + `viralIntelligence.ts` (783 lines: `viral_items`/`viral_templates`, weighted `computeViralScore`, `refreshViralLibrary` cron sweep, `templateHints()` feeding the planner, `remixForUser`) + `communityIntelligence.ts` (scored community discovery) | None of substance. **The "Viral Content Library" the brief asks for is built**, including why-it-worked template extraction. Needs a tool wrapper only. |
| **MarketResearcher** | `research.ts → buildBrandBrief` (two-step Claude web research → `BrandBrief{name, summary, audience, tone, pillars, competitors}`, `deep`/`fast` modes) + `businessProfile.ts` | Tool wrapper. It already separates researched fact from inference reasonably. |
| **StrategyDirector** | `planner.ts → planPosts` (brief + insights + style hints → post batch, each with `reasoning`) + `playbookTemplates.ts` (strategy as config) + `discovery.ts` scouts | Tool wrapper. Objective-level strategy (vs. batch-level) is the one real extension. |
| **CampaignManager** | `campaigns.ts` + cron phase 2 (cadence, autonomy dial, budget ceiling, milestones) | Tool wrapper. Needs a *mission* above the campaign. |
| **CreativeDirector** | `brandKit.ts → brandPromptContext` (brand memory folded into every prompt) + `characters.ts` (Character Studio, persona DNA reused verbatim to stop drift) + `presets.ts` | Tool wrapper. |
| **ContentCreator** | `ai.ts → draftPost` / `draftUgcAd` / `adaptForPlatforms`, with `HOOK_RULE` + `CRAFT_RULES` + `MEDIA_CRAFT` shared craft prompts | Tool wrapper. |
| **VideoProducer** | `fal.ts` / `generation.ts` (Kling, Seedance UGC with native audio, swap, upscale) + `voiceover.ts` + `ctaVideo.ts` + `trimClient.ts` | Tool wrapper. |
| **SocialManager** | `publish-dispatch.ts` + `publishers.ts` + `weeklySchedule.ts` + the scheduled queue | Tool wrapper. |
| **PerformanceAnalyst** | `metrics.ts` (FB/IG/YouTube readable) + `performance.ts → buildPerformanceSummary` + `campaigns.ts → buildInsights` | Tool wrapper. |
| **GrowthStrategist** | `learnings.ts → synthesizeLearnings` (pure-code cohort comparison, `MIN_N 3`, `MIN_MARGIN 1.5`) + `appliedLearningsHint` (feeds the planner — the loop is already closed) | Tool wrapper. |
| **BrandGuardian** | **Does not exist in MarketingBoss** — but it exists in `@helm/dna-marketing`: `social/claim-screen.ts` (pure) + `social/claim-review.ts` (LLM) + `ProductFacts` | The one genuinely missing worker, and it is already written in a package this app doesn't consume yet. |

**What this table does not say** is that the roster is *complete marketing coverage*. It covers create → distribute → measure, on social. Nobody owns the destination, the offer, owned channels, or paid. See §D6 and the first row of §I — that boundary has to be stated by the product, not discovered by the customer.

The learning loop the brief describes (`DISCOVER → … → LEARN → IMPROVE`) also already runs end-to-end: `discovery.ts` writes scored `opportunities`; publishing writes `results`; the cron refreshes `metrics`; `synthesizeLearnings` writes narrative `learnings` with evidence; `appliedLearningsHint` feeds them back into `planPosts`. It is honest by construction — `learnings.ts` refuses to emit a pattern it can't back with cohort evidence.

---

## C. Missing infrastructure

Only four things are actually absent.

1. **An agent loop.** There is no tool-use, no multi-turn reasoning, no plan→act→verify cycle anywhere in the app. Every capability is either a one-shot JSON call behind an HTTP route or a fixed cron phase.
2. **A tool registry.** Capabilities are routes and cron phases, not callable typed contracts a model can select from.
3. **A Mission + run/step ledger.** `campaigns` is a *cadence with a brief*, not an *objective with a plan and traceable delegation*. There is nothing that records "which worker did what, when, at what cost, producing which artifact" — §23's `AgentRun` requirement.
4. **A conversational surface.** "Give Nina a goal" has nowhere to be typed. There is no chat component in the app.

Secondary, but real:

- **BrandGuardian / claim-safety isn't wired** (the code exists, one package away).
- **A long mission will exceed Vercel's 300s function budget** — orchestration needs a continuation pattern.
- **Failure recovery is unimplemented.** §25 asks for retry → alternative → flag → continue. Today a failed publish sets `status = 'failed'` and stops; nothing retries, nothing tells the user *why*. Given this repo's history of token expiry and scope loss across Meta / TikTok / YouTube, this is a routine path, not an edge case. It also has to satisfy the standing rule that users see *"Instagram needs reconnecting"*, never a raw platform error.

---

## D. Recommended architecture

### D1. Don't invent the loop — port the proven one

`apps/leadsmartai/lib/boss/` (Boss v2, PRs #766–771) already solves exactly these four problems in production: durable runs, per-step claiming for idempotency, approval pausing mid-run, risk classes, tool/token budgets, a forced verification turn, and soft-deadline continuation with re-kick. `lib/boss/runs/engine.ts` is ~310 lines and is the shape to copy.

**Reuse the pattern, app-local — do not import it.** It is coupled to `agent_id`, real-estate tools, consent rails, and `zod`. Copying the *shape* into `apps/marketingboss/lib/workforce/` keeps MarketingBoss's zero-dep philosophy (hand-written JSON Schema per tool, exactly like `ai.ts` does today — no `zod`/`zod-to-json-schema`).

**Also do not build on `@helm/ai-workforce`.** It is a real, non-dead package (helmsmart-web consumes it), and its domain model — employee blueprints, runs, memory, metrics, tool dispatch — is philosophically right. But it is `organization_id`-keyed, depends on `@helm/data`, targets `ai_employee_*` tables in a different Supabase project, and deliberately contains **no LLM loop** (it is run-accounting + tool routing; the app supplies the agent loop). Adopting it would mean migrating MarketingBoss's identity model for no functional gain. Revisit at unification time — its `AiEmployee`/`AiEmployeeRun` shape is the right target if the workforce is ever promoted to a package.

### D2. Workers are personas + tool subsets over ONE loop

This is the most important decision, and it is what §14, §24 and §31 jointly demand.

> **Nina is the only agent loop. A "worker" is a `worker` tag on a tool + a persona prompt fragment + the run steps attributed to it.**

- Every tool declares `worker: "TrendScout" | "ContentCreator" | …` (directly mirroring CloseBoss's `assignee` field).
- The activity feed says *"ContentCreator — drafting"* because a ContentCreator-owned tool is executing. That is honest, costs nothing extra, and needs no second model call.
- "Rewrite this caption" therefore runs **one** loop iteration and **one** tool — it cannot fan out to eight workers. §24 is satisfied structurally, not by prompt discipline.

**Tier 2 (later, only where it pays):** true sub-agent delegation via a `delegate(worker, task)` tool that opens a child run with that worker's persona and a narrowed tool set. Justified for the heavy thinkers — TrendScout, MarketResearcher, StrategyDirector — where focused context measurably improves output. Not justified for ContentCreator or SocialManager.

### D3. Mission is the unit of work

```
Mission (objective, autonomy, budget)
  └── AgentRun (one loop invocation chain; Nina or a delegated worker)
        └── AgentRunStep (one tool call: worker, input, output, cost, approval state)
              └── artifact → campaign_posts / generations / opportunities / learnings
```

Missions sit **above** playbooks: a mission may create a playbook (`campaigns`), several actions (`campaign_posts`), and produce learnings. Existing objects gain a nullable `mission_id`; nothing moves.

### D4. Marketing DNA (§26) needs no new memory store for v1

`brand_kits` (brand voice + researched `business` brief + `topic_presets`) + `learnings` (what worked, with evidence) + `opportunities` (what was accepted vs dismissed) already *are* the memory. Add one `brand_kits.preferences jsonb` column for stated instructions and publishing/approval preferences. A dedicated embedding store is premature.

### D5. The roster, as built

> **Naming convention (decided).** The **product** is MarketingBoss. The **AI CMO is Nina** — she is who the user talks to, and whose name appears in the UI, the activity feed, and every report. Same split as CloseBoss/Max. Below, "MarketingBoss" means the app or the orchestrator runtime; "Nina" means the character.

The product brief names eleven workers. Shipping eleven tool-holding agents would violate §24 and §31 — several of them have no distinct engine behind them, and two of them claim the orchestrator's own job. The staged roster below keeps every name in the user's vocabulary while giving **seven** of them real tools.

| Worker | v1 status | Rationale |
|---|---|---|
| **Nina** — AI CMO | The loop | Only agent. Owns planning, delegation, approval requests, the final report. |
| **TrendScout** | ✅ tools | `viral.ts`, `viralIntelligence.ts`, `communityIntelligence.ts` |
| **MarketResearcher** | ✅ tools | `research.ts`, `businessProfile.ts` |
| **StrategyDirector** | ✅ tools | `planner.ts`, `playbookTemplates.ts`, `discovery.ts` — **absorbs GrowthStrategist** |
| **ContentCreator** | ✅ tools | `ai.ts` draft/adapt |
| **VideoProducer** | ✅ tools | `fal.ts`, `generation.ts`, `voiceover.ts`, `ctaVideo.ts` |
| **SocialManager** | ✅ tools | `publish-dispatch.ts`, `weeklySchedule.ts` — **and owns publish recovery** |
| **PerformanceAnalyst** | ✅ tools | `metrics.ts`, `performance.ts`, `learnings.ts` |
| **BrandGuardian** | ✅ gate, not a tool-caller | Runs as a gate at two fixed points (see below), never chosen by the model |
| ~~GrowthStrategist~~ | **merged into StrategyDirector** | "What should we do?" and "what next?" are one question at two times — and already one code path (`appliedLearningsHint` → `planPosts`). Two roles forces the activity feed to arbitrate. |
| ~~CampaignManager~~ | **label only, no tools** | Its brief — create campaigns, break into tasks, assign, track, manage approvals — *is* the orchestrator's job. Two things claiming orchestration is a bug. Retained as the label on cron/queue work ("CampaignManager — 3 posts scheduled") with zero authority over what gets made. |
| ~~CreativeDirector~~ | **not a worker in v1** | Creative direction is currently a prompt fragment (`brandPromptContext()` folded into every draft). A worker here buys a model round-trip to regenerate a style paragraph already stored in `brand_kits`. Promote when it does something ContentCreator can't: visual consistency across a multi-asset campaign, or Character Studio persona assignment. |

**BrandGuardian runs at two points, not one.** The brief places it before publication; the credit model argues for earlier. A video costs 20 credits, so catching an unsupportable claim *after* ContentCreator and VideoProducer have run is the expensive ordering. Instead:

```
StrategyDirector plans → [BrandGuardian: screenClaims — pure code, free]
                       → ContentCreator / VideoProducer generate (credits spent here)
                       → [BrandGuardian: claimReview — one LLM pass, cheap]
                       → SocialManager publishes
```

**Names, not job titles.** Per the CloseBoss brand charter's test ("does this feel like a real company with AI employees?"), the workforce should read as *"Nina · Trend Scout"*, not `TrendScout`. The CMO needs a name distinct from the product — as CloseBoss has Max — or *"MarketingBoss is analyzing your campaign"* reads as software rather than a colleague.

**The cast (decided).** `apps/marketingboss/public/avatars/personas/` holds six PNGs — `chris`, `emma`, `grace`, `max`, `oliver`, `ruby` — referenced nowhere in the code. They share filenames with the CloseBoss cast but are **different artwork** (verified by checksum), and the names are reused deliberately across the brand family. Each MarketingBoss portrait carries a role-readable prop, which drives the assignment:

| Portrait | Reads as | MarketingBoss role |
|---|---|---|
| *(new)* | — | **Nina** — AI CMO |
| `max` | dark turtleneck, calm, executive | **Strategy Director** |
| `oliver` | glasses, tidy, precise | **Market Researcher** |
| `ruby` | orange headband, warm, high-energy | **Trend Scout** |
| `chris` | navy hoodie, youthful, expressive | **Content Creator** |
| `grace` | glasses, studious | **Performance Analyst** |
| `emma` | headset + mic — literally comms | **Social Manager** |
| *(new)* | — | **Video Producer** (proposed name: Leo) |
| — | — | **BrandGuardian — no face** |

**BrandGuardian stays faceless** on purpose: it is a gate, not a colleague, and rendering compliance as a person invites arguing with it.

**Two portraits are missing** — Nina and the Video Producer. They should be generated in MarketingBoss's own **Character Studio** (`lib/characters.ts`: `composeCharacter` → fal render → `setCharacterPortrait`), matching the existing set's style. That is a ~10-credit dogfooding exercise, not an art commission — and it removes any temptation to cut roles to fit the available art.

**The existing six need a cleanup pass before Phase 2.** Inspected at full size: four of six are off-centre (subject in the left ~60%, dead space right, which crops wrong in a circular frame); every one carries a vertical seam artifact along the right edge; and two have garbled AI text baked in — `grace` shows "ATOR", `max` a partial letter. Acceptable at 32–40px in the Phase 1 rail; **not** acceptable at the sizes a Phase 2 sidebar or any hero treatment would use. Re-crop all six and regenerate `grace`.

### D6. Intake is a hard gate, and scope is stated up front

Two rules that decide whether the workforce feels intelligent or generic.

**1. No brand knowledge, no plan.** `discovery.ts` today returns `"skipped: no brand kit or campaign brief yet"` for *both* the seasonal and trends scouts — without intake, half the discovery engine is dead and every draft is generic. So the first mission for any new account is a **business-intake mission** (`research_business` → brand kit → topic presets), and Nina declines to plan content until it completes. This single rule is most of the distance between "I hired a marketing team" and "I used a content generator."

**2. The destination is the account owner's, and it is configured — not built.** Nina does not create landing pages, offers, or lead capture. The owner supplies them in their profile, and the workforce sends traffic there. This is a deliberate scope boundary, not a gap.

What that requires is a **configurable destination set** on the business profile, rather than today's single `campaigns.link` with `brand_kits.company_url` as fallback. "Book a consult", "shop the sale", and "join the list" are different missions pointing at different places, and StrategyDirector/ContentCreator need to know which is which to write a CTA that isn't generic:

```sql
alter table public.brand_kits add column if not exists destinations jsonb;
-- [{ label, url, offer, use_for }]  — owner-filled, all optional
alter table public.brand_kits add column if not exists utm jsonb;
-- { enabled, source, medium, campaign_template } — off by default
```

Two rules ride on it:

- **Conversion-shaped missions require a destination.** If the objective is "get leads / get customers / sell X" and no destination is configured, Nina asks for one instead of posting to nowhere — the ordinary `needs_input` path, not a silent default to the homepage.
- **UTM tagging is the cheap half of attribution.** We tag outbound links; the owner's own analytics attributes them. We never claim to read conversions. One config block, no new integration, and it turns "I can't see what happened after the click" into "your analytics can."

**3. Nina states her measurement scope at mission creation.** Even with a destination configured, `metrics.ts` reads only likes / comments / views from FB / IG / YouTube. So the sentence is: *"I'll send traffic to <destination>, tagged so your analytics can attribute it. I measure engagement and clicks where the platform exposes them — your analytics measures conversion."* And the learning loop must never restate an engagement result as progress toward a lead goal (see Risks).

**Deliberate non-goals, stated so the roster doesn't over-claim:** landing pages and offers (owner-supplied, above), paid media, email and SEO/owned channels, community participation (`communityIntelligence.ts` discovers communities but no worker acts in them), lifecycle/retention. Note that ContentCreator's brief lists *email copy, blog content, landing-page copy* — there is no send rail, CMS, or site behind any of those. Ship the role without those claims until a rail exists.

### D7. What we can actually measure

`metrics.ts` already reads **six** platforms — facebook, instagram, youtube, threads, pinterest, linkedin (only TikTok is missing). But it flattens everything into `{likes, comments, views}`, and that shape is now the limiting factor.

**Three findings:**

1. **A click signal is already being collected and thrown into the wrong bucket.** The Pinterest fetcher requests `PIN_CLICK` and stores it as `metrics.comments`. Real outbound-click data, mislabeled as engagement.
2. **`engagementScore()` sums likes + comments + views flat.** Views swamp everything — a video with 10k views and 3 likes outranks a post with 500 likes. That single score feeds `buildInsights`, `discovery.scoutPerformance`, *and* `learnings.synthesizeLearnings`, so all three currently conclude "post more video" by arithmetic rather than evidence. **This is a bug in the existing learning loop, independent of missions.**
3. **Per-platform click data is real but partial**, so it can't be the primary rail:

| Platform | Outbound clicks | Note |
|---|---|---|
| Pinterest | ✅ `PIN_CLICK` / `OUTBOUND_CLICK` | already fetched |
| Facebook | ✅ `post_clicks` | Page insights, needs `read_insights` |
| LinkedIn | 🟡 `clickCount` | organization shares only |
| YouTube | ❌ | description links not exposed |
| Instagram | ❌ | caption links aren't clickable at all |
| Threads / TikTok | ❌ | — |

**The rail that works everywhere: own the link.** A redirect route on marketingbossai.com (`/r/<token>` → destination) counts every click ourselves — per post, per platform, per mission — with no platform API, no scope, no permission. One route, one `link_clicks` table, and the CTA link is swapped at publish time. It is the only click source that behaves identically across all seven platforms, and it's a genuinely small build.

Honest caveats: Instagram contributes zero clicks regardless (links aren't clickable in captions), and a redirect hop is a mild reach consideration on Meta — make it per-account configurable alongside UTM.

**The resulting hierarchy — and what changes in the code:**

| Tier | Signal | Source |
|---|---|---|
| 1 | **Clicks** | our redirect (universal) + platform click fields where they exist |
| 2 | **Engagement** — likes, comments, views, saves | platform APIs, already built for 6 platforms |
| 3 | **Conversions** | the owner's own analytics, via UTM. We tag; we never claim to read it. |

Concretely: widen `Metric` to `{likes, comments, views, saves, clicks}` (stop overloading `comments` for Pinterest); replace flat `engagementScore()` with a **per-platform-normalized** score; and give `missions.measured_by` real teeth — `awareness` → views/reach, `engagement` → likes+comments, `traffic` → clicks. `learnings.ts` then runs its cohort comparison on **the mission's own metric** instead of one universal number. That is the adjustment; the `MIN_N` / `MIN_MARGIN` honesty gates stay exactly as they are.

---

## E. Database changes

Five new tables, six column additions. All owner-RLS, all pre-migration-tolerant, migration numbers `0025+`.

```sql
-- 0025_missions.sql
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  objective text not null,                     -- "Generate 50 qualified leads in 30 days"
  status text not null default 'planning'
    check (status in ('planning','running','awaiting_approval','completed','failed','cancelled')),
  autonomy text not null default 'review' check (autonomy in ('review','assisted','auto')),
  plan_json jsonb,                             -- the living plan (phases + status)
  budget_credits int, spent_credits int not null default 0,
  summary text,                                -- the final report the user reads
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0026_agent_runs.sql   (mirrors boss_runs / boss_run_steps)
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  worker text not null default 'nina',
  parent_run_id uuid references public.agent_runs(id) on delete cascade,  -- tier-2 delegation
  trigger text not null default 'command' check (trigger in ('command','cron','retry')),
  status text not null default 'planning'
    check (status in ('planning','running','awaiting_approval','completed','failed','budget_exceeded','cancelled')),
  objective text not null,
  plan_json jsonb, messages_json jsonb not null default '[]'::jsonb,
  report text, error text,
  tool_calls int not null default 0, max_tool_calls int not null default 20,
  input_tokens int not null default 0, output_tokens int not null default 0,
  token_budget int not null default 200000,
  verify_done boolean not null default false,
  started_at timestamptz not null default now(), finished_at timestamptz
);

create table public.agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_index int not null,
  worker text not null,                        -- drives the activity feed
  tool_name text not null,
  risk_class text not null,                    -- 'research'|'draft'|'generate'|'publish'
  input_json jsonb, output_json jsonb,
  status text not null default 'running'
    check (status in ('running','completed','pending_approval','rejected','failed')),
  approval_state text not null default 'n/a' check (approval_state in ('n/a','pending','approved','rejected')),
  credits_spent int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, step_index)                  -- the idempotency guarantee
);

-- 0027_click_tracking.sql   (D7)
create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,                  -- the /r/<token> slug
  destination_url text not null,
  mission_id uuid references public.missions(id) on delete set null,
  post_id uuid references public.campaign_posts(id) on delete set null,
  platform text,
  created_at timestamptz not null default now()
);
create table public.link_clicks (
  id bigserial primary key,
  link_id uuid not null references public.tracked_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer text, user_agent text              -- no IPs, no PII
);
create index on public.link_clicks (link_id, clicked_at desc);

-- 0028_mission_links.sql
alter table public.campaigns      add column if not exists mission_id uuid references public.missions(id);
alter table public.campaign_posts add column if not exists mission_id uuid references public.missions(id),
                                  add column if not exists run_step_id uuid references public.agent_run_steps(id);
alter table public.brand_kits     add column if not exists preferences jsonb,
                                  add column if not exists destinations jsonb,  -- owner-configured (D6.2)
                                  add column if not exists utm jsonb;
```

No data migration. No dual-write. Every existing table keeps working untouched.

---

## F. API / service changes

New only — **no existing route changes**:

| Route | Purpose |
|---|---|
| `POST /api/missions` | Goal text → create mission, open a run, kick `driveRun` |
| `GET /api/missions/[id]` | Mission + plan + live steps (feeds the progress UI) |
| `POST /api/missions/[id]/approve` | Approve/reject a parked step; resumes the run |
| `POST /api/missions/[id]/cancel` | Kill switch |
| `POST /api/boss/message` | Conversational turn against an existing mission |

New lib modules under `lib/workforce/`: `engine.ts` (the loop), `store.ts` (run/step persistence), `tools/registry.ts`, `tools/types.ts`, `tools/impl/*.ts` (thin wrappers — each tool calls an **existing** lib function; no capability is reimplemented), `workers.ts` (roster + persona fragments).

**Cron:** add phase 8 — continue runs flagged `needsContinuation` plus a reaper for runs stuck in `running` past a deadline. Given the `*/15` tick is already shared by seven phases and discovery is *already* being skipped whenever the viral refresh fires, mission continuation should get **its own cron path** (`/api/cron/missions`) rather than compete for the same 300s.

---

## G. UI changes

| Surface | Change |
|---|---|
| **Home `/`** | Gains the primary entry: *"What do you want to accomplish?"* — one input, above everything else — plus active missions and the workforce rail. Existing briefing sections stay. Widens to `max-w-6xl`. |
| **`/missions/[id]`** *(new)* | Mission Progress (Research ✅ · Strategy ✅ · Content 🔄 · Publishing ⏳), the worker activity feed rendered from `agent_run_steps`, inline approvals, artifacts, final report, and the destination each action points at. `max-w-6xl`. |
| **Workforce rail** | Worker cards with live status (Working / Waiting / Completed / Needs approval), each expandable to its findings + recommendation + a *Use this* action — §19's pattern. Status derived from real steps only; a worker that didn't run shows idle. |
| **Nav** | **Unchanged in Phase 1.** See G1. |
| **Settings → Business profile** | Gains **Destinations** — the owner's configured links/offers (label, URL, offer, what it's for) plus optional UTM tagging and the click-redirect toggle (D7). This is the one place the owner must fill in, and the intake gate points here. |
| Actions / Playbooks / Studio / Published / Learning | **Unchanged.** |

Per §20, the UI renders decisions, findings, recommendations, actions and results — the step ledger, never the transcript. `messages_json` is never surfaced.

### G1. Navigation and layout — staged, not swapped

**Phase 1 adds no tab.** `/missions/[id]` is a deep-link-only detail route reached from Home, from an accepted opportunity, or from an action card — the same pattern `/playbooks/[id]` and `/autopilot/[id]` already use. There is no `/missions` index in v1.

Three reasons: a user has one to three active missions, and a list of three doesn't earn a permanent tab; `Nav.tsx` already overflows horizontally on mobile at seven tabs plus Settings; and `🎯` is already Opportunities. Most of all, bolting a Missions tab onto a seven-stage workflow nav asserts two contradictory things at once — *"a team is doing this for you"* and *"here are seven stages to supervise."*

**The workforce is never a destination.** §18's "Your AI Marketing Team" is a rail on Home and mission pages, not a tab. Making the team somewhere you *go* is exactly the "forced to navigate individual agents" failure §16 warns against — it should be visible while it works.

**Sidebar: yes, but it is a layout change, not a nav change.** MarketingBoss is currently a centered reading column — 10 pages at `max-w-3xl`, 3 at `max-w-2xl`, only 3 at `max-w-6xl`. A 240px sidebar beside a 768px column sits off-center or crushes the content, so adopting one means converting ~13 pages to a wide shell and re-tuning their grids.

The argument that justifies it eventually is not item count or convention — it is **ambient workforce presence**. A rail can hold live worker status in peripheral vision while you work; a top tab bar structurally cannot. (`apps/helmsmart-web/components/sidebar.tsx` is the in-house precedent.)

So:

| | Phase 1 | Phase 2 |
|---|---|---|
| **Nav** | 7 tabs, untouched | collapse to 4 — `🏠 Home · ⚡ Work · 🧰 Studio · 📈 Learning` |
| **Workforce** | rail on Home + mission detail only, those two pages widened to `max-w-6xl` | promoted to a real sidebar, app-wide |
| **Pipeline tabs** | unchanged | Opportunities / Actions / Published merge into **⚡ Work** with a state filter (Suggested · Needs you · Scheduled · Published) — which is what `campaign_posts.status` already is. Playbooks folds in as *recurring missions*, per the 2.0 blueprint's own "the weekly schedule IS a playbook." |

Do the collapse and the sidebar in **one** pass: four items in a rail reads as intentional, seven reads as a menu that wouldn't fit.

**Why not Phase 1:** re-laying-out the app while simultaneously introducing an agent loop means a release that feels wrong can't be attributed to either change. The rail-on-two-pages step also tests the premise honestly — if a typical mission is three tool calls and the roster mostly sits idle, that is worth learning *before* rebuilding thirteen pages around it.

**Watch item:** Opportunities is the strongest proactive surface in the product; demoting it to a filter could cost engagement. Home already surfaces the top 3, so the full feed becomes a browse view — but if usage shows people navigate there deliberately, keep it as a tab through the collapse. Decide from Phase 2 data, not now.

---

## H. Implementation phases

| Phase | Content | Ships |
|---|---|---|
| **0 — Tool layer + measurement fix** | `lib/workforce/tools/*`: registry, types, and ~10 wrappers over existing libs (`research_business`, `find_trends`, `plan_content`, `draft_post`, `generate_media`, `schedule_post`, `publish_post`, `get_performance`, `create_playbook`, `list_opportunities`), each tagged with its `worker`. Plus two standalone fixes that stand on their own merit: **declare the `@helm/dna-marketing` dependency** (§A), and **widen `Metric` + normalize `engagementScore`** so Pinterest clicks stop landing in `comments` and views stop swamping the learning loop (D7.1–2). No UI, no schema. | 1 PR, small |
| **1 — Nina + Mission (the MVP)** | Migrations 0025–0028, the agent loop, run store, approvals, Home goal box, mission detail with activity feed + report. **Includes the intake gate (D6.1), owner-configured Destinations + the stated measured-by scope (D6.2), and BrandGuardian's free pure-code `screenClaims` pass at plan time** — nothing autonomous should reach generation unscreened. Autonomy default = review. | 1–2 PRs |
| **2 — Workforce identity + IA collapse + full BrandGuardian** | Named workers + avatars (D5) promoted from rail to **sidebar**, in the same pass as the **7 → 4 nav collapse** (G1). Wire `@helm/dna-marketing` `claimReview` + `ProductFacts` from the brand kit as the post-generation gate. SocialManager publish recovery: retry, then a plain-language reconnect prompt. | 2–3 PRs |
| **3 — Delegation + opportunity bridge** | Tier-2 `delegate()` for TrendScout / MarketResearcher / StrategyDirector; "Accept opportunity" starts a mission instead of prefilling a composer. | 1–2 PRs |
| **4 — Learning into missions** | Mission outcomes feed `learnings`; StrategyDirector proposes the next mission; `brand_kits.preferences` accumulates stated instructions. | 1 PR |

Phases 0–1 are the launch. The existing product keeps working throughout — nothing is removed, no route changes, no data migration.

---

## I. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Proxy-metric optimization.** The destination is the owner's (D6.2), but `metrics.ts` still reads only likes / comments / views. A user says *"50 qualified leads in 30 days"*; the calendar runs flawlessly; `synthesizeLearnings` measures the only signal it can see, concludes *"video outperforms image 2:1"*, and confidently optimizes engagement while the stated objective fails silently. | High | Missions carry an explicit *measured-by* field, set at creation and shown on the mission page. Engagement results are never restated as progress toward a conversion goal. UTM tagging (D6.2) pushes attribution to the owner's analytics rather than faking it here. |
| **Unconfigured or bad destination.** The owner leaves destinations empty, or points every mission at a homepage. Now a config problem, not an architectural one — but it produces the same disappointing outcome. | Medium | Conversion-shaped objectives block on `needs_input` until a destination exists; the mission page shows which destination each action points at, so a wrong one is visible before publish, not after. |
| **Publish failure dead-ends.** A failed publish sets `status = 'failed'` and stops; token expiry and scope loss are routine on Meta / TikTok / YouTube. | High | SocialManager owns recovery (Phase 2): bounded retry, then a plain-language reconnect prompt surfaced on the mission — never a raw platform error. |
| **Cost blowup.** A tool loop can burn 20× the tokens and credits of today's one-shot calls; generation tools spend *real* credits. | High | Per-run `max_tool_calls` + `token_budget` (already in the ported design); mission-level `budget_credits` reusing the playbook ceiling; generation tools are `risk_class: generate` and respect the existing `auto_approve_max_credits` dial; show estimated credits before approval (`campaign_posts.estimated_credits` already exists). |
| **300s function ceiling.** A real mission exceeds it. | High | Soft-deadline yield + `needsContinuation` re-kick, exactly as `driveRun` does. All state in `agent_runs`/`agent_run_steps`, so any invocation resumes cold. |
| **Cron contention.** The `*/15` tick already drops discovery when the viral refresh runs. | Medium | Separate `/api/cron/missions` path; don't add phase 8 to the shared tick. |
| **Double-publishing / double-charging** on retry or overlapping ticks. | High | `unique (run_id, step_index)` + claim-then-execute, mirroring `claimStep`. Same guard the existing cron uses on `campaign_posts`. |
| **Workforce theater.** Showing ten busy workers when one tool ran is dishonest and contradicts this codebase's own culture (`learnings.ts` refuses to invent patterns). | Medium | Status derived strictly from `agent_run_steps`. Idle workers render idle. |
| **Model reliability across 20+ tool schemas.** | Medium | Start at ~10 tools; hand-written JSON Schema; forced verification turn; a failed tool returns a structured outcome the model can react to, never a crash (§25). |
| **Pre-migration DB** (migrations are user-applied). | Medium | Follow the existing convention — every new module degrades gracefully; the goal box hides itself until `missions` exists. |
| **Local dev misconfigured.** `.env.local` still uses `NEXT_PUBLIC_SMBAI_SUPABASE_ANON_KEY` (smbai's key name) and carries no `ANTHROPIC_API_KEY`; prod is unaffected (`next.config.ts` hardcodes the correct URL). Flagged in `unification-proposal.md` §9 and still open. | Low | Fix as a one-line cleanup alongside Phase 0. |

---

## J. First MVP

**The smallest thing worth releasing:**

> On Home, the user types *"Promote my new restaurant for the next 30 days."*
> If the account has no brand knowledge yet, Nina runs intake first and says so. Otherwise it creates a Mission, names what it can and cannot measure, plans, and executes with ~10 tools: researches the business, scouts trends, drafts a strategy, creates a playbook, screens the plan for unsupportable claims, generates and drafts the first posts, and queues them for approval.
> The mission page shows the plan, the live worker activity feed with a *why* on each step, inline approve/reject, and a final report.
> Everything already in the app — Studio, Actions, Playbooks, Published, Learning, credits, connections — keeps working exactly as it does today.

That is Phases 0 + 1: four migrations, one loop, one store, ten tool wrappers, two pages. Seven workers, all of them real code that already ships. The Boss is the only thing being built.

---

## Open questions for approval

1. ~~**Nav placement**~~ — resolved in G1: no new tab in Phase 1; workforce rail on two pages; sidebar + 7→4 collapse together in Phase 2.
2. ~~**Cast**~~ — resolved in D5: **Nina** as AI CMO; the six existing names reused with role assignments; BrandGuardian faceless; two new portraits (Nina + Video Producer) generated in Character Studio; re-crop pass on the six before Phase 2. *Open only: the Video Producer's name — Leo is a placeholder.*
3. **Click tracking (D7):** ship the owned redirect in Phase 1 (it's small, and without it "traffic" missions have nothing to measure), or defer to Phase 2? Recommend Phase 1.
4. **Retired roles:** GrowthStrategist merges into StrategyDirector; CampaignManager becomes a label; CreativeDirector is deferred. Confirm these disappear from user-facing copy too, or stay as vocabulary?
