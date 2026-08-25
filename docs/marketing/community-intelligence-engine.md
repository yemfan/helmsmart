# MarketingBoss — Community Intelligence Engine

Not what to say — WHERE to say it, and how to adapt it for each audience.

## Step 1–2: audit — reuse map

| Charter component | Existing implementation | Gap |
|---|---|---|
| CommunityScout | The web-research scout idiom (viral.ts → discovery.ts → viralIntelligence.ts): Anthropic's licensed web search, pause_turn loop, structured second pass | Point it at communities |
| CommunityAnalyzer / DNA | Merged into the scout's structured pass (same cost trick as the viral engine: Scout+Analyze = 1 research + 1 structured call) | — |
| Opportunity scoring | Stored-component pattern (`SCORE_WEIGHTS`, per-component jsonb, admins see WHY) | Community-specific components |
| Audience match | `brand_kits.business` (0021 researched profile) + `nicheOf()` | — |
| CommunityWriter | `adaptForPlatforms` (per-platform caption tailoring) + composer intent prefill | MVP: "Write a post for this community" → composer intent carrying the community's culture/rules; full rewriter = Phase 2 |
| Library UX | TrendingLibrary / CharacterStudio card idioms | — |
| Publishing | publish-dispatch posts to OWN accounts only — **no connected API posts into subreddits/groups**; the MVP produces community-adapted drafts the user posts manually | Honest by design |
| Background jobs | Cron staged pipeline — but the tick budget is already carrying 7 phases | **MVP is on-demand discovery only**; scheduled community refresh = Phase 2 with its own budget slot |

## MVP (charter Phase 1)
- **Migration 0024** — `communities`: universal model (platform, name, url, industry, audience/
  activity/culture/rules/topics jsonb, **dna** jsonb with the recommendation, stored
  `score_components` + `opportunity_score`), shared-library RLS (authenticated read, service-role
  write; same posture as `viral_items`). `community_saves`: per-user favorites with a free-text
  `collection` (owner RLS).
- **lib/communityIntelligence.ts** — `scoutCommunities(niche)` (web research → structured records
  with DNA + component estimates, dedup by name+platform), component scoring (weights constant),
  list/search with filters, saves/collections, `discoverForUser` (niche from the business profile).
- **APIs** — `GET /api/communities` (search + filters + savedOnly), `POST /api/communities/discover`
  (on-demand, niche-driven), `POST/DELETE /api/communities/[id]/save`.
- **UI** `/studio/communities` — recommendation-first ("because you do X…"), cards with platform,
  size estimate, culture chips, promotion tolerance, opportunity score with expandable component
  breakdown, the DNA recommendation, Save/collection — and **Write a post for this community** →
  composer prefilled with the community's tone/rules/format guidance.
- Estimates honestly labeled (web-research sourced) until platform connectors exist.

## Deferred honestly
- Platform connectors (Reddit/Facebook/LinkedIn/Discord APIs need apps, agreements, or paid tiers —
  Reddit's API ToS restricts commercial use; nothing is pretended). Provider abstraction is the
  `source` column + normalized jsonb model — a connector fills the same shape.
- TrendScout per-community threads, watchlists/alerts, calendar, performance learning (needs post
  attribution), full CommunityWriter rewrites — Phases 2–3 per charter.
