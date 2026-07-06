# Home Value Estimate — Accuracy Architecture

This document covers all the signals, APIs, and adjustments used in the
PropertyTools AI home value estimate pipeline.

> **Note (2026):** RentCast has been removed. The primary AVM signal is now
> AI-grounded — Claude reasoning over live web search of recent comparable
> sales and public listing data (cited, real comps, not fabricated). RentCast
> is no longer a required (or live) data source, and the RentCast API key env
> var is no longer read anywhere. The blending diagram and "Rentcast AVM" labels below
> are retained for historical context; read "Rentcast AVM" as "AI-grounded
> AVM (Claude + web search)".

---

## Pipeline Flow

```
User enters address
        │
        ▼
┌─ Property Enrichment ─────────────────────────────┐
│  1. Warehouse lookup (properties_warehouse)        │
│  2. Rentcast API (/v1/properties + /v1/avm/value) │
│  3. Forward geocoding (Mapbox/Google)              │
└────────────────────────────────────────────────────┘
        │
        ▼
┌─ Micro-Market Signals (fetched in parallel) ──────┐
│  • Walk Score API         → walkability multiplier │
│  • FEMA NFHL              → flood zone discount    │
│  • Census ACS             → ZIP-level fallback PPSF│
│  • GreatSchools API       → school rating premium  │
│  • ZIP market_snapshots   → ZIP-level PPSF         │
└────────────────────────────────────────────────────┘
        │
        ▼
┌─ Baseline PPSF Selection ─────────────────────────┐
│  Priority: weighted comp PPSF                      │
│         > ZIP-level market snapshot PPSF           │
│         > city-wide market data PPSF               │
│         > Census ACS ZIP median PPSF               │
│         > $245 national fallback (last resort)     │
└────────────────────────────────────────────────────┘
        │
        ▼
┌─ Estimate Engine (11 multipliers) ────────────────┐
│  baseline PPSF × sqft × Π(adjustments)            │
│                                                    │
│  1.  Property type    (condo 0.97×, multi 1.05×)  │
│  2.  Beds / baths     (vs typical 3bd/2ba)        │
│  3.  Property age     (new 1.02×, 50+ yr 0.98×)  │
│  4.  Lot ratio        (large lot 1.04×)           │
│  5.  Condition        (poor 0.95× to exc 1.04×)  │
│  6.  Renovation       (none 1.0× to full 1.055×) │
│  7.  Market trend     (up 1.02×, down 0.98×)     │
│  8.  Walk Score       (90+ 1.03×, <25 0.98×)     │
│  9.  Flood zone       (high risk 0.94×)          │
│  10. Seasonal         (June 1.035×, Jan 0.97×)   │
│  11. School rating    (9-10 1.04×, <3 0.97×)     │
└────────────────────────────────────────────────────┘
        │
        ▼
┌─ AVM Blending ────────────────────────────────────┐
│  Signal 1: Rentcast AVM (ML-trained on MLS data)  │
│  Signal 2: Comp-based estimate (from above)       │
│                                                    │
│  0 comps  → 100% Rentcast AVM                     │
│  1-3 comps → 85% AVM + 15% comp-based            │
│  4+ comps  → 75% AVM + 25% comp-based            │
└────────────────────────────────────────────────────┘
        │
        ▼
┌─ ML Model Blending (optional) ────────────────────┐
│  Signal 3: XGBoost/LightGBM prediction            │
│                                                    │
│  When model available:                             │
│  • 15% weight on ML prediction                    │
│  • ML agrees (<10% divergence) → tighten range    │
│  • ML disagrees (>20%) → widen range              │
│  When model unavailable: skipped silently          │
└────────────────────────────────────────────────────┘
        │
        ▼
  Final estimate + confidence + range band
```

---

## External APIs

### Required (already configured)

| API | Env Variable | Free Tier | Used For |
|-----|-------------|-----------|----------|
| AI-grounded AVM (Claude + web search) | `ANTHROPIC_API_KEY` | Paid | AVM, comps, property details (replaces the former RentCast integration) |
| Mapbox or Google | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Free tier | Geocoding |

### Optional (enhance accuracy)

| API | Env Variable | Free Tier | Used For |
|-----|-------------|-----------|----------|
| Walk Score | `WALKSCORE_API_KEY` | 5,000/day | Walkability premium |
| GreatSchools | `GREATSCHOOLS_API_KEY` | Free trial | School district premium |
| FEMA NFHL | None needed | Unlimited | Flood zone discount |
| Census ACS | None needed | Unlimited | ZIP-level median PPSF |

**Without optional APIs**: the corresponding multiplier is neutral (1.0×).
No accuracy loss — just no micro-market signal for that dimension.

### Getting API Keys

**Walk Score:**
1. Go to https://www.walkscore.com/professional/api.php
2. Sign up for free API access (5,000 requests/day)
3. Add `WALKSCORE_API_KEY=your_key` to `.env.local`

**GreatSchools:**
1. Go to https://www.greatschools.org/api/
2. Apply for API access (free trial available)
3. Add `GREATSCHOOLS_API_KEY=your_key` to `.env.local`

---

## Weighted Comp PPSF

Instead of simple-averaging all comp sale prices per sqft, comps are
weighted by three dimensions:

### Recency (how recent was the sale)
| Days ago | Weight |
|----------|--------|
| 0–90     | 1.0    |
| 91–180   | 0.85   |
| 181–270  | 0.65   |
| 271–365  | 0.45   |
| 365+     | 0.30   |

### Proximity (how close to subject)
| Distance | Weight |
|----------|--------|
| ≤ 0.5 mi | 1.0   |
| ≤ 1 mi   | 0.9   |
| ≤ 2 mi   | 0.75  |
| ≤ 3 mi   | 0.6   |
| ≤ 5 mi   | 0.5   |
| > 5 mi   | 0.4   |

### Similarity (how similar to subject)
Factors: bed count diff, bath count diff, sqft % diff, age diff.
Each factor multiplies a score from 0.6 to 1.0. Combined minimum: 0.2.

### Outlier trimming
When 4+ comps are available, any comp with PPSF below 50% or above 175%
of the median is dropped to prevent skewing.

### 12-month filter
Comps with `sold_date` older than 12 months are excluded from the
baseline PPSF calculation entirely. In appreciating markets, stale
comps drag the estimate down.

---

## Confidence Engine

Four pillars weighted to produce a 0–100 confidence score:

| Pillar | Weight | Scoring |
|--------|--------|---------|
| Address quality | 15% | Structured (95), partial (68), unknown (40) |
| Detail completeness | 35% | Based on missing fields count (beds, baths, sqft, lot, year, type) |
| Comp coverage | 35% | 8+ comps (98), 5-7 (85), 3-4 (72), 1-2 (55), 0 (28) |
| Market stability | 15% | Trend + days on market + data freshness |

**Confidence levels:**
- 80–100 → High
- 55–79 → Medium
- 0–54 → Low

**Range band**: inversely proportional to confidence score.
Higher confidence → tighter range (±4.5%–12%).

---

## Adjustment Breakdown (UI)

The estimate engine produces `AdjustmentLine[]` — each multiplier with
a key and label. The API route converts these to dollar-value adjustments:

```
dollar_impact = (multiplier - 1) × estimate_value
```

Example for a $750K estimate with Walk Score 85:
- Multiplier: 1.015
- Dollar impact: +$11,250
- Displayed as: "Walk Score 85 (Very Walkable): +$11,250"

Adjustments under $1,000 are hidden to reduce noise.

---

## Value History Chart

The `ValueHistoryChart` component fetches historical snapshots from:

```
GET /api/home-value/history?address=123+Main+St&limit=52
```

Data source: `property_snapshots_warehouse` table, which stores a new
snapshot when a property's estimated value changes by >2% or hasn't been
snapshotted in 7+ days.

The chart shows:
- Area chart with green (up) or red (down) gradient
- Total $ and % change since first snapshot
- Custom tooltip with date, value, and PPSF
- Minimum 2 data points required for chart display

---

## File Reference

```
lib/homeValue/
├── runEstimate.ts           # Main pipeline orchestration
├── estimateEngine.ts        # 11 multiplicative adjustments
├── confidenceEngine.ts      # 4-pillar confidence scoring
├── walkScore.ts             # Walk Score API integration
├── floodZone.ts             # FEMA NFHL flood zone lookup
├── schoolRatings.ts         # GreatSchools API integration
├── seasonalAdjustment.ts    # NAR monthly indices
├── censusFallbackPpsf.ts    # Census ACS ZIP-level PPSF
├── zipMarketData.ts         # ZIP-level market_snapshots lookup
├── weightedCompPpsf.ts      # Recency/proximity/similarity weighting
├── mlInference.ts           # XGBoost model bridge (Node.js → Python)
├── normalizeProperty.ts     # Merge warehouse + user input
└── types.ts                 # Shared types

components/home-value/
├── EstimateResultsSection.tsx    # Main results layout
├── CompsMapPanel.tsx             # Map + explainability panel
├── ValueHistoryChart.tsx         # Recharts area chart
└── homeValueCompsShared.ts       # Adjustment labels + formatting

app/api/home-value/
├── estimate/route.ts        # POST — run estimate pipeline
├── history/route.ts         # GET — value snapshots for chart
└── session/route.ts         # GET — restore saved session
```
