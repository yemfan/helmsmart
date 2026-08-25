# MarketingBoss — Marketing Intelligence Engine

Discover → Analyze → Understand → Template → Match → Remix → Publish → Measure → Learn

## Step 1–2: Codebase audit — what already exists (reuse map)

The 2.0 Growth-OS build (PRs #1171–#1187, migrations 0014–0021) already implements most of
the closed loop, per-user:

| Engine component | Existing implementation | Gap |
|---|---|---|
| ViralScout | `lib/viral.ts` (web-research trend scout) + `lib/discovery.ts` (4 sources → scored `opportunities`) | Finds are **per-user and ephemeral** — no shared, persistent library; no component scoring/lifecycle |
| TrendAnalyst | `ViralRef.why/hook/styleNotes`, `opportunities.reasoning` (mandatory) | Creative DNA not structured (hook type, structure, emotion, format) |
| TemplateBuilder | `lib/playbookTemplates.ts` (strategy templates only) | **No creative Template DNA** ({SLOT} patterns) at all |
| TrendMatcher | `brand_kits.business` (0021 researched profile), `nicheOf()`, per-user opportunity scoring | Matching is niche-string level; fine for MVP |
| PerformanceLearner | `lib/learnings.ts` + `campaign_posts.metrics` + `buildPerformanceSummary` | Template-level attribution not wired yet |
| Remix → Publish | Accept-opportunity → `/actions/new?intent=&type=` → composer → publish-dispatch | Works; remix just needs to feed it |
| Automation | `/api/cron/run` `*/15` phased pipeline (maxDuration 300) | No queue infra on Vercel — **cron phases are the job system** |
| Cost staging | discovery: cheap scouts first, 1 user/tick, 24h gates | Same staging idiom reused |

## MVP architecture (this build)

**Legal posture: metadata-only.** We never download or store third-party media. `viral_items`
stores metadata, links, and OUR OWN AI-generated analysis; remix generates original expression
from structural patterns (`rights` jsonb records this posture per row).

### Data (migration 0022 — user-applied, code degrades gracefully pre-migration)
- `viral_items` — the shared library. source ('web_research' | 'user' | 'own_content' | future connectors),
  url/title/description, platform, content_type, format, industries[], metrics jsonb (as discovered/estimated),
  **score_components jsonb** (momentum/engagement/acceleration/recency/replicability/industryFit/crossPlatform,
  each 0–100, stored so admins see WHY), viral_score (weighted; weights are a code constant),
  velocity (emerging/rising/exploding/viral/established/declining/evergreen),
  status lifecycle (discovered→analyzed→templated→archived), analysis jsonb (creative DNA + whyItWorks[]),
  analysis_version, rights jsonb, user_id (null = global row). RLS: authenticated read
  (global + own), service-role writes only.
- `viral_templates` — Template DNA: structure `[{slot, pattern}]` with `{VARIABLES}`, hook_type,
  emotional_trigger, content_type/format/platforms/industries/objective, replicability, difficulty,
  version, usage_count, performance jsonb, viral_item_id.

### Pipeline (staged for cost, runs inside the existing cron)
1. **Scout+Analyze (1 web research + 1 structured pass, ONCE per day)** — a broad "what's gaining
   unusual momentum right now for small-business marketing" sweep returns 5–8 items WITH their
   creative DNA and per-component score estimates in the same pass (merging Analyze into Scout
   halves the calls). Dedupe by title/url against live rows.
2. **Template (1 structured call × top 3 new items only)** — extract the {SLOT} Template DNA.
3. Cron ordering: the viral refresh runs before per-user discovery; when it fires, user-discovery
   skips that tick (keeps the 300s budget).
- Honesty note: web-research metrics are **estimates with sources**, marked as such in `metrics`.
  Exact platform metrics arrive with real connectors (Phase 6).

### APIs
- `GET /api/viral/trending` — top live items + templates
- `GET /api/viral/search?q=&platform=&type=&velocity=` — filters + ilike (NL-intent parse: later)
- `POST /api/viral/[id]/remix` — item + template + the user's business profile/brand kit →
  ORIGINAL hook/outline/caption/hashtags/mediaPrompt + a composer-ready intent; bumps usage_count
- `GET /api/admin/viral/pipeline` — counts, last run, per-status/velocity breakdown
  (CRON_SECRET bearer or ADMIN_EMAILS session)

### UI
- `/opportunities` gains **🔥 Trending now** (constitution: no new top-level nav) — library cards:
  velocity badge, viral score + component breakdown, why-it-works, format/platform tags, primary CTA
  **Remix for my business** → inline original version → **Create content** → prefilled composer.
- `/admin/viral` — pipeline monitor, gated by `ADMIN_EMAILS` env (unset → 404).

## Step 4: blocked without external credentials / agreements (do NOT pretend these exist)
- TikTok / TikTok Creative Center: requires TikTok developer app + research/creative-center access.
- Instagram/Facebook trending: no public trending API; Graph API only covers own/connected accounts.
- YouTube trending (`videos.list mostPopular`): possible with a **YOUTUBE_API_KEY** (user can mint
  one in the existing Google Cloud project) — best first real connector.
- X: paid API tier. Reddit: OAuth app + ToS review. Google Trends: no official API.
- Until then the legal, working source is Anthropic's licensed web search (already powering four
  shipped scouts) + own published content + (later) user submissions.

## Phasing after this MVP
- P2: NL search parse; admin cost tracking (per-call token estimates); user submissions (+ private templates).
- P3: TrendMatcher v2 — per-user industryFit from `brand_kits.business`, personalized ranking of the library.
- P4: real connectors (YouTube first), snapshot-based velocity (content_metrics over time → real acceleration).
- P5: PerformanceLearner tie-in — stamp template_id on composer output → campaign_posts, roll up
  real-world template performance ("used by N, avg engagement X"), feed planner.
