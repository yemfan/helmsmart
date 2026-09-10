# Home value estimator — roadmap

## v1 (current)

- Heuristic AVM + local median $/sqft blend
- Simple adjustment model (beds, baths, condition, renovation, trend)
- Lead capture + routing (unlock report, CloseBoss)
- Confidence + intent inference from signals
- Recommendation engine (intent + market + comps context)

## v2

- Real comparable sale weighting in the baseline
- Neighborhood / micro-market segmentation
- Better confidence calibration from backtests
- Saved estimate history per session / account

## v3

- Learning loop from user corrections and closed transactions
- Richer AI explanation of the estimate
- Agent-assisted valuation handoff
- Auto-generated CMA preview in-product

## Recommended file layout (target)

New code can migrate gradually:

- `lib/home-value/` — barrels + future split modules (`address`, `enrich`, `estimate`, `confidence`, `intent`, `recommendations`)
- `app/api/home-value/estimate/route.ts` — estimate API (today: rewrite to `/api/home-value-estimate` + nested body support in handler)
- `app/api/home-value/unlock-report/route.ts` — lead + unlock (exists)
- `components/home-value/` — `AddressInput`, `EstimatePreview`, `RefinementForm`, `ReportGate`, `FullReport`, `NextSteps` (partially factored; main flow still in `HomeValueTool`)
