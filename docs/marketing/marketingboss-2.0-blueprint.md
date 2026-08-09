# MarketingBoss 2.0 — Constitution → Codebase Blueprint

**Status:** Proposal (2026-08-09). Companion to the MarketingBoss AI 2.0 Product Constitution.
**Scope:** `apps/marketingboss` only. Refactor, not rewrite.

---

## 1. Architecture audit — what exists today

MarketingBoss is a Next 16 / React 19 / Tailwind v4 app on its own Supabase project
(`vsmeeydxkbrupzbnpcwq`), deployed at marketingbossai.com. Zero-dependency philosophy:
raw `fetch` to Anthropic, Stripe, Google, TikTok, fal.ai — no SDKs.

### Current surfaces (Nav tabs)

| Tab | Route | What it does |
|---|---|---|
| Studio | `/` | fal.ai generation: image / video / swap (Kling O1), presets, reference images, CTA end cards |
| Posting | `/compose` | Posting hub: new AI post wizard (`/compose/new`), UGC wizard (`/compose/ugc`), weekly schedule, scheduled queue, history |
| Autopilot | `/autopilot` | Link → AI brand brief → campaign (cadence, budget, channels, review/auto) → review queue → publish |
| Performance | `/performance` | Engagement aggregates by platform / format / angle, top posts |
| Gallery | `/gallery` | Saved renders with filter/search |
| Settings | `/settings` | Connections, billing (packs + subscriptions), Brand Kit |

### Current engine layer (`lib/`)

| Module | Role |
|---|---|
| `fal.ts`, `generation.ts` | Generation core, credit reserve/refund (image 1 / edit 2 / video 20 / swap 25 / CTA 6) |
| `ai.ts` | `anthropicJson`, `draftPost`, `draftUgcAd`, `adaptForPlatforms` |
| `research.ts` | Two-step Claude web research → structured `BrandBrief` (audience, tone, pillars, competitors) |
| `viral.ts` | Web-search scout for trending UGC/ad references in a niche |
| `planner.ts` | Brief (+ insights hint) → batch of planned posts, AI picks media type per post |
| `campaigns.ts` | `campaigns` + `campaign_posts` CRUD; scheduled/history queries |
| `weeklySchedule.ts` | Weekday slots → cron researches topic → enqueues scheduled post |
| `metrics.ts`, `performance.ts` | Per-platform engagement fetch (FB/IG/YT readable), `engagementScore`, `buildInsights` |
| `publish-dispatch.ts`, `publishers.ts`, `social.ts`, `oauth.ts`, `tiktok.ts`, `youtube.ts` | 7-platform OAuth + publish fan-out |
| `brandKit.ts` | Per-user brand memory folded into every draft prompt |
| `billing.ts`, `stripe.ts`, `subscriptions.ts`, `fulfill.ts` | Credits, packs, monthly plans |
| `app/api/cron/run` | `*/15` tick: drain scheduled posts → advance campaigns → refresh metrics → weekly-schedule fires |

### The key audit finding

**The 2.0 loop already exists in embryonic form — it's just named differently and
scattered across tabs.** The cycle *Objective → Playbook → Opportunities → Actions →
Execution → Published → Learning* maps almost 1:1 onto
*brief → campaign → (missing) → campaign_posts → publish-dispatch → history → buildInsights*.

The gaps are exactly two:
1. **Opportunities** as a first-class, multi-source, persistent object (today the closest
   things — viral refs, competitor angles, insight hints — are ephemeral, computed inline,
   never stored, never scored, never shown as "here's what you should do").
2. **Learning** as narrative "why" items that feed back into playbooks (today
   `buildInsights` produces one hint string consumed silently by the planner; the user
   never sees the reasoning, and it improves nothing durable).

Everything else is a rename, a re-grouping, or a column addition.

---

## 2. Feature → philosophy map

| Existing feature | Becomes | Notes |
|---|---|---|
| Autopilot campaign | **Playbook** | `campaigns` is the proto-playbook: objective (brief), cadence, budget, autonomy, kill switch. Add explicit `objective`, `milestones`, template id. |
| Brand brief (`research.ts`) | **Playbook context** + Opportunity source | Competitor angles + pillars in the brief are unscored opportunities today. |
| `campaign_posts` | **Action** | Status enum `draft/approved/scheduled/publishing/published/failed/skipped` is already ~the constitution lifecycle. Add `generating`, `reasoning`, `opportunity_id`. |
| Compose wizard (`/compose/new`) | **Manual Action creation** (Studio-assisted) | Stays; becomes "create an Action by hand". |
| UGC wizard + `viral.ts` | **UGC Studio** + Opportunity source ("Trends") | The viral scout is discovery engine #1, already built. |
| Weekly schedule | **Recurring playbook** ("Stay consistent") | It IS a simple playbook: standing objective producing scheduled Actions. Presented as one. |
| Posting hub scheduled/history | **Actions queue** / **Published** | Split: queue → ⚡ Actions, history → 📢 Published. |
| Performance dashboard | **Learning** (+ contextual analytics) | Aggregates stay as context; the page becomes narrative Learning items. |
| `buildInsights` | **Learning engine seed** | Upgrade from one hint string to stored, explained `learnings` rows. |
| Studio / Swap / CTA card | **Creative + Video Studio** | Unchanged capability, demoted from "the product" to 🧰. |
| Gallery | **Studio asset library** | Moves under Studio (and Published shows the posted subset). |
| Brand Kit | **Business profile** (Settings) | Grows into the objective/context input for playbooks. |
| Connections, billing | **Settings** | Unchanged. |
| Credit metering | **Execution budget** | Already per-playbook (`budget_credits`); surfaces as "estimated cost" on Actions. |

Nothing is deleted. Every route keeps working through redirects during migration.

---

## 3. Navigation redesign

```
🏠 Home            NEW        /home          Mission control briefing
🎯 Opportunities   NEW        /opportunities Scored, multi-source feed
⚡ Actions         RENAME     /actions       ex-Posting hub queue + wizards
📚 Playbooks       RENAME     /playbooks     ex-Autopilot + weekly schedule + templates
🧰 Studio          REGROUP    /studio        ex-/ Studio + UGC + Gallery
📢 Published       SPLIT      /published     ex-history + per-post metrics
📈 Learning        UPGRADE    /learning      ex-Performance, narrative-first
⚙ Settings        KEEP       /settings      + Business profile (Brand Kit grows)
```

Redirects: `/` → `/home` (logged in), `/compose*` → `/actions*`, `/autopilot*` →
`/playbooks*`, `/performance` → `/learning`, `/gallery` → `/studio/gallery`.
Public marketing homepage stays at `/` for logged-out visitors.

**Home** composes existing queries — no new engine needed for v1:
- Today's Opportunities (top 3 by score)
- Action queue (drafts awaiting approval, scheduled today)
- Learning highlight (latest learning item)
- Business health (credits, connected channels, active playbooks)
- Quick Studio (prompt box that deep-links into Studio)

---

## 4. New data model (migrations 0014+)

All owner-RLS, same posture as existing tables. MB migrations are **user-applied**
(MCP org can't reach `vsmeeydxkbrupzbnpcwq`) — repo-first, then user runs them.

Migration numbers are assigned in ship order (Phase 2 shipped first as
`0014_action_lifecycle.sql`); the blocks below describe shape, not final numbering.

```sql
-- opportunities
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,            -- 'trends' | 'competitors' | 'performance' | 'seasonal' | 'news' | ...
  title text not null,
  description text not null,
  reasoning text not null,         -- WHY (constitution: every recommendation explains why)
  business_value text,             -- narrative estimate
  reach text check (reach in ('low','medium','high')),
  urgency text check (urgency in ('low','medium','high')),
  confidence numeric,              -- 0..1
  score numeric not null default 0,-- computed rank for the feed
  recommended_playbook_id uuid references public.campaigns(id),
  recommended_action jsonb,        -- pre-drafted action params (type, angle, prompt seed)
  status text not null default 'open'
    check (status in ('open','accepted','dismissed','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- action lifecycle (campaign_posts GROWS — no new table, no data move)
-- SHIPPED as 0014_action_lifecycle.sql (reasoning + estimated_credits)
alter table public.campaign_posts
  add column if not exists opportunity_id uuid references public.opportunities(id),
  add column if not exists reasoning text,          -- why this action, in the UI
  add column if not exists estimated_credits int;   -- cost shown before approval
-- widen lifecycle: add 'generating' + 'waiting_approval' (view-level aliases of
-- draft/approved keep old rows valid; CHECK constraint recreated additively)

-- playbooks (campaigns GROWS)
alter table public.campaigns
  add column if not exists objective text,          -- "Generate first 100 customers"
  add column if not exists template text,           -- playbook template key
  add column if not exists milestones jsonb,        -- [{title, target, done_at}]
  add column if not exists learnings_applied jsonb; -- audit trail of improvements

-- learnings
create table public.learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id),
  insight text not null,           -- "Founder stories outperform product posts 3:1"
  evidence jsonb,                  -- post ids + metric deltas backing it
  recommendation text,             -- what to change in which playbook
  applied_at timestamptz,          -- null until user (or auto mode) applies it
  created_at timestamptz not null default now()
);
```

`weekly_schedules` stays as-is; the Playbooks page renders it as the built-in
"Stay consistent" playbook.

---

## 5. AI orchestration additions

All follow the existing zero-dep two-step pattern (web tools → `anthropicJson`).

| Engine | Built on | What it does |
|---|---|---|
| **Discovery scouts** (cron phase 5) | `viral.ts`, `research.ts` | Per active user w/ brand kit or playbook: (a) *Trends* — viral scout over the niche; (b) *Competitors* — re-scan brief competitors for new angles; (c) *Performance* — promote `buildInsights` winners to "do more of this" opportunities. Each writes scored `opportunities` rows. Budget: ≤1 scout run/user/day, dedupe by title-similarity. |
| **Opportunity scorer** | new, pure fn + one Claude pass | value/reach/urgency/confidence → `score`; expiry for time-sensitive items. |
| **Learning synthesizer** (cron phase 6, weekly) | `performance.ts` | Compares cohorts (angle vs angle, format vs format, platform vs platform) where n≥3 posts; writes `learnings` rows with evidence + a concrete playbook recommendation. Honest gate: skips users with too little data instead of hallucinating patterns. |
| **Playbook improver** | `planner.ts` | "Apply" on a learning patches the campaign brief/pillars and stamps `learnings_applied`; planner already accepts insight hints — it now receives applied learnings verbatim. |
| **Action reasoner** | `planner.ts` | Planner output gains `reasoning` + `estimatedCredits` per post (schema addition, no new call). |

Cron stays the single scheduler; phases become: drain → advance playbooks →
metrics → weekly schedule → **discover** → **learn**. Discovery/learning are
budget-capped and skippable per tick (same ADVANCE_LIMIT pattern).

**What we deliberately do NOT build yet:** Reddit/GSC/CRM/review ingestion (no
connectors exist), true attribution (platform APIs don't expose it at our scopes),
Analytics Studio (needs data volume first). The `source` column leaves room.

---

## 6. Refactor plan (not rewrite)

- **Keep every table** — `campaign_posts` → Actions and `campaigns` → Playbooks by
  column addition only. No data migration, no dual-write.
- **Keep every lib module** — new engines import, never fork, `ai.ts` / `research.ts` /
  `viral.ts` / `planner.ts` / `generation.ts` / `publish-dispatch.ts`.
- **Rename at the route/UI layer** with permanent redirects; API routes keep their
  paths (nothing external depends on them, but the mobile-port pattern from CloseBoss
  says stable APIs are cheap insurance).
- **Vocabulary sweep** is UI-copy only; internal table/file names stay until a natural
  rewrite touches them (constitution compliance is a user-facing property).
- Credits/billing/auth/connections untouched.

---

## 7. Implementation roadmap

Each phase ships independently, is verifiable live, and leaves the app fully working.

### Phase 1 — Vocabulary + IA shell (1 PR)
New nav (Home/Opportunities/Actions/Playbooks/Studio/Published/Learning/Settings),
route renames + redirects, split Posting hub into `/actions` (queue) and `/published`
(history). Home v1 = composition of existing queries (action queue, credits, channels,
quick studio). Opportunities tab shows an honest empty state ("discovery arrives soon")
or is hidden behind a flag. **No schema change.**

### Phase 2 — Actions lifecycle (1 PR)
Migration 0015. Action detail view with the full lifecycle (PR-style), reasoning +
estimated credits on planned posts, approve/edit/regenerate/schedule from one screen.
Wizards (`/compose/new`, UGC) become "New Action" entry points.

### Phase 3 — Opportunities v1 (1–2 PRs)
Migration 0014 + discovery scouts (trends, competitors, performance) + scorer + cron
phase 5. Feed UI with Why/value/urgency/confidence, Accept → pre-filled Action,
Dismiss → feedback signal. Home gains "Today's Opportunities".

### Phase 4 — Playbooks v1 (1 PR)
Migration 0016. `/playbooks` = campaigns re-presented with objective + milestones +
progress; template gallery (Launch Product, First 100 Customers, Grow Local Business,
Build Personal Brand — templates are config: pillars + cadence + channel defaults
that seed the existing campaign creator). Weekly schedule appears as the standing
"Stay consistent" playbook.

### Phase 5 — Learning v1 (1 PR)
Migration 0017 + learning synthesizer (cron phase 6). `/learning` = narrative items
with evidence + one-click "Apply to playbook". Performance aggregates remain as the
context section below. Home gains "Learning highlight".

### Phase 6 — Contextual analytics + polish (ongoing)
Metrics chips on Action/Published cards, playbook progress charts, opportunity
historical-performance context. Analytics Studio deferred until data volume warrants.

Dependencies: 2→(3,4) share nothing; 5 needs 4's applied-learning slot but can ship
read-only earlier. Realistic sequencing: Phases 1–2 together, then 3, then 4+5.

---

## 8. Product test, applied

Every phase answers the constitution's test:
- Phase 3 *discovers Opportunities* — the biggest missing organ.
- Phase 2 *improves Actions* — visibility, reasoning, cost, control.
- Phase 4 *strengthens Playbooks* — objectives, milestones, templates.
- Phase 5 *creates Learning* — stored, explained, appliable.
- Phase 1 makes every screen answer *"what should I do next?"*

The AI recommends. The human decides — review-mode default, per-playbook autonomy
toggle, and approval gates are all already built and carry straight through.
