# Home Value Estimate engine

## Modules (`lib/homeValue/`)

| File | Role |
|------|------|
| `types.ts` | `NormalizedProperty`, API request/response shapes, intent |
| `estimateEngine.ts` | Baseline $/sqft × sqft + multiplicative adjustments (type, beds/baths, age, lot, condition, renovation, trend) |
| `confidenceEngine.ts` | Score 0–100 + range band % from address quality, field completeness, comp coverage, DOM/trend |
| `normalizeProperty.ts` | Merges warehouse row + client overrides + missing-field list |
| `recommendations.ts` | `buildHomeValueRecommendations` — intent + estimate + confidence + comps + market + `intent_signals` → 3 next-step links |
| `intentInference.ts` | `resolveLikelyIntent` (explicit intent + light heuristics) |
| `leadCapture.ts` | When to prompt: no gate before preview; soft banner after useful estimate / refine; unlock gate for full report |
| `runEstimate.ts` | `runHomeValueEstimatePipeline` — enrichment → estimate → confidence → session + events |
| `funnelPersistence.ts` | `home_value_sessions`, `tool_events`, `market_snapshots` |
| `closeBossRouting.ts` | `buildCloseBossHomeValueNotes` (optional CRM notes shape) |
| `toolEventsClient.ts` | Browser `trackToolEvent` → `POST /api/events` |

## API (canonical routes)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/home-value-estimate` | Run pipeline; upserts `home_value_sessions`, optional `tool_events` / `market_snapshots` |
| `POST` | `/api/home-value/estimate` | **Alias** — `beforeFiles` rewrite to `/api/home-value-estimate` (same behavior) |
| `GET` | `/api/home-value/session?session_id=` | Hydrate saved funnel row for returning visitors |
| `POST` | `/api/home-value/unlock-report` | Same body as tool-capture (`persistToolLead`) + inserts `report_unlocked` in `tool_events` |
| `POST` | `/api/events` | Funnel analytics (`tool_events`: `session_id`, `tool_name`, `event_name`) |

**Alias:** `POST /api/home-value/estimate` → same handler (see `next.config.js` rewrites).

- Enrichment: `getPropertyData` → warehouse row; `getComparables` for sold PPSF; `getCityData` for ZIP/city median and trend.
- Baseline PPSF: **comps** (if sold prices present) else **city** median PPSF else **245** fallback.
- Guests allowed (lead-gen).

## CRM / CloseBoss

**`LeadRecord`** (`lib/leads/leadRecord.ts`) — canonical shape returned on unlock (`leadRecord` in JSON): `source: "home_value_estimator"`, value band, confidence, `likelyIntent`, engagement, optional timeline / buying vs selling.

Full-report unlock uses **`POST /api/home-value/unlock-report`** (not generic tool-capture), which calls `persistToolLead` and records **`report_unlocked`**.

Payload aligns with tool-capture:

- **`source`**: `home_value_estimator`
- **`tool`**: `home_value_estimator` (traffic_source: `home_value_estimator:home_value_estimator`)
- **`property_value`**, **`confidence_score`**, **`engagement_score`** (0–100 capped; lead weights: tool +25, refine +10, unlock +15, phone +10, repeat session +10, CMA +15, expert +10, high-value +15; raw max 110 → cap 100). Bands: 0–29 low, 30–59 medium, 60+ high (`lead_score_band` / `engagement_score_band` in metadata on unlock).
- **`metadata`**: `likely_intent` (seller | buyer | investor), estimate band, comps, `leadsmart_ready`

`notes` stores JSON for CRM intelligence. `recordLeadEvent` + `runLeadMarketplacePipeline` + `scoreLead` run on insert.

## UX (`components/homeValue/HomeValueTool.tsx`)

### Page sections (1–7)

1. **Hero & address** — title/subtitle in scaffold + address autocomplete (`HomeValueSection` `hv-section-1`).
2. **Estimate preview** — range + confidence + comp support copy + trust disclaimer (`hv-section-2`).
3. **Refinement form** — live debounced recalc (`hv-section-3`).
4. **Report gate** — blurred teaser + unlock CTA (`hv-section-4`).
5. **Detailed report** — unlocked adjustments + summary (`hv-section-5`).
6. **Recommendations / next steps** — intent-based links (`hv-section-6`).
7. **Expert help CTA** — pricing / match (`hv-section-7`).

### UI state machine (`lib/homeValue/estimateUiState.ts`)

Derived `EstimateUiState`: `idle` → `address_selected` → `estimating` → `preview_ready` → `refining` → `refined_result_ready` (report still gated / “report locked” in UX copy) → `unlocking` → `report_unlocked` → `next_steps` (when unlock + recommendations exist). Exposed on the root as `data-estimate-ui-state`.

### Analytics (`lib/homeValue/homeValueTracking.ts`)

Product events (plus `tool_events` when `session_id` present): `home_value_started`, `address_selected`, `property_details_loaded`, `estimate_generated`, `estimate_refined`, `report_gate_shown`, `report_unlocked`, `lead_submitted`, `cma_clicked`, `expert_cta_clicked`, `recommendation_clicked`. Metadata often includes `city`, `confidence`, `likelyIntent`, `sessionId`, `estimateUiState`.

### Trust & compliance (`lib/homeValue/estimateDisplay.ts` + `HomeValueTrustDisclaimer`)

- Label outputs as **estimates**, not appraisals; show a **range**; explain **confidence**; **informational purposes** disclaimer.
- Display rounds to **nearest $1,000**; comp support text avoids overstating quality when data is thin.

Roadmap: `docs/HOME_VALUE_ROADMAP.md`. File layout notes: `lib/homeValue/README.md`, `components/home-value/README.md`.

---

Flow: **address** → **estimate preview** → **refinement** (debounced recalc) → **report gate** (modal) → **full report** + **recommendations**.

- Estimates: `POST /api/home-value-estimate` (UI; same engine as `POST /api/home-value/estimate`).
- Returning tab: `GET /api/home-value/session` then silent re-estimate to refresh the card.
- Funnel: `trackToolEvent` for `estimate_complete`, `report_gate_opened`, `session_hydrated` (plus product analytics via `trackEvent`).
