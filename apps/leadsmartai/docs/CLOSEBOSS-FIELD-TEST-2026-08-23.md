# CloseBoss Field Test — 23 Aug 2026

End-to-end pass through closebossai.com in English and 中文, driven as a working listing agent.

- **Surface:** 98 public routes × 2 locales (196 loads, all HTTP 200)
- **Method:** live browser interaction + HTTP sweep + source review against the `leadsmartai` working copy
- **Not covered:** the signed-in dashboard (sign-in never completed in the driven browser), form submissions, checkout
- **Interactive version with screenshots:** https://claude.ai/code/artifact/e60b08e8-a048-44a2-a41d-aae92cdb8ee6

**Counts:** 4 high · 8 medium · 6 low

---

## High

### H1 — Home Value Estimator returns no value and invents the property
`/home-value-estimator` · EN + 中文 · `/api/property/estimate`

Every address tested (Santa Monica CA, Chicago IL, a fabricated address) returned HTTP 200 with `estimatedValue`, `low`, `high` all null and `compsCount: 0`.

The UI fills the gaps with numbers nobody supplied. For an address the API returned entirely null for, the Property Snapshot reads **"0 beds · 0 baths · 1,500 sqft — · Built 0"**, while the summary directly beneath says "We don't have square footage on file for this address yet." Address renders lowercase. Request takes ~20 s.

Root cause:
- `app/home-value-estimator/page.tsx:105` — `const subjectSqft = Number(property?.sqft ?? 0) || comps[0]?.sqft || 1500;`
- `:110–115` — beds, baths, lotSize, yearBuilt each wrapped in `Number(x ?? 0)`, rendered at `:218–228` with no null guard.

Fix: render "—" for nulls, drop the 1500 fallback, title-case the address, and surface the "no comps loaded" state before the spinner rather than after it.

### H2 — Zillow/Redfin analyzer writes a full investment narrative for a nonexistent listing
`/ai-zillow-redfin-link-analyzer` · EN + 中文

A Zillow URL with an invented listing ID produced: `$0 · 0 beds · 0 baths · 0 sqft`, estimated value $0, rent $0/mo, and a prose **AI Investment Summary** describing "999 Fake, St Nowhere" as a property "priced at $0" offering "approximately 0 beds, 0 baths, and 0 sqft of living space."

Deal Score read **20/100** — identical to the score given a real $2.1M Beverly Hills listing minutes earlier. A real listing also showed **0 baths** on a single-family home.

Cash flow prints as `$-375` and `$-4500` (sign misplaced, separator dropped).

Fix: explicit not-found state; suppress score and summary when the lookup yields nothing; format negatives as `-$4,500`.

### H3 — 中文 toggle does nothing on the demo workspace
`/demo/*` · 中文

Reproduced 4× on `/demo/calendar`, including 20 s after load and via direct coordinate click. Translations exist — setting the locale cookie and loading fresh renders 沙盒模式 / 演示工作区 / 日历 / 即将到来的日程 correctly. Only the in-page toggle fails.

Where the toggle does fire, the page splits: header Chinese, body English. The demo calendar subtitle renders as **"This week · 5 upcoming events · 4 笔进行中的交易"**.

Root cause: `lib/i18n/client.ts` — `setLocaleCookie()` writes the cookie and calls `i18n.changeLanguage()`, re-rendering client components only. No `router.refresh()`, so `getServerT()` content keeps the old locale until a full reload.

Fix: `router.refresh()` after the cookie write; set `<html lang>` from the active locale at the same time (M3).

### H4 — /onboarding, the primary CTA destination, locks up the browser tab
`/onboarding`, `/demo/contacts` · EN

"Hire Your AI Team Free" and "Ask Max free" both point at `/onboarding`. Server responds 200 in 0.26 s with no console errors and all assets loading, but after load the main thread stops responding — interaction attempts timed out across 35+ seconds. `/demo/contacts` (50 simulated contacts) shows the same freeze; other pages in the same tab moments earlier were fine.

Could not instrument the frozen page. Both affected pages build large simulated datasets client-side; `components/onboarding/OnboardingFunnel.tsx` has several effects whose dependency arrays include freshly-constructed objects.

---

## Medium

### M1 — Raw translation key printed on the page, in both languages
`/free-tools` · EN + 中文

The language radio in the prompts lead-magnet form is labelled with the literal string `pages.promptsLeadMagnet.english`.

That key exists in **neither** catalog, while the working copy already calls the correct `lead_magnet.form.language_english` from `web_free_tools`. **The deployed build is behind the source** — verify what's live before triaging the rest of this report.

### M2 — Every calculator is half-translated
14 calculator pages · 中文

"空置率（%）" sits directly beneath "Purchase price ($)". Results panel entirely English (NOI, Effective income, Total expenses, Cap rate).

Not missing translations — never externalised: **60+ hardcoded `label="…"` props** across 14 pages, **12 pages** with English baked into the ResultCard `details` template literal.

Also: `app/cap-rate-calculator/page.tsx` has a bare `and` between two links inside a translated FAQ answer → "…ROI 计算器 and 房产投资分析器。"

### M3 — `<html lang>` stays "en" regardless of UI language
Site-wide · 中文

Screen readers get the wrong voice, Chrome offers to translate the page "from English", search engines get a contradictory audience signal.

### M4 — Twenty pages ship the homepage's title tag
EN + 中文. All serve `CloseBoss — Your AI Real Estate Team. Close More Deals.`:

`/features` `/about` `/ai-cma-analyzer` `/ai-real-estate-deal-analyzer` `/ai-zillow-redfin-link-analyzer` `/smart-cma-builder` `/property-investment-analyzer` `/rental-property-analyzer` `/property-report` `/home-value` `/home-value-funnel` `/home-value-widget` `/open-house-signup` `/agent-signup` `/agent-home-value-leads` `/deal-assistant` `/how-to-analyze-rental-property` `/how-to-buy-investment-property` `/how-to-compare-rent-vs-buy` `/how-to-evaluate-rental-cash-flow`

Several of these exist specifically to rank.

### M5 — Chinese visitors get English page titles almost everywhere
**67 of 83** comparable routes serve a byte-identical `<title>` in both locales; only 16 are localised. `/agent/pricing` does it right.

### M6 — Privacy Policy and Terms are English-only in Chinese mode
`/privacy`, `/terms` · 中文. The only CJK on `/privacy` is shared nav chrome (205 chars against 2,363 English words of policy).

Sharper here than elsewhere: the Signature tier is sold as **双语 & 高端** with "含英文 / 中文双语" in its feature list. Bilingual service is a paid, marketed feature.

### M7 — Calculator inputs accept impossible values
`/cap-rate-calculator`, `/cap-rate-roi-calculator`

Vacancy rate declares `max={50}` but accepts 150 with no clamp or warning → effective income **-$33,000**, NOI -$53,600, cap rate **-6.31%**, presented in the same confident styling as a valid result. Negative currency renders `$-53,600`.

### M8 — Developer placeholder copy on a public open-house sign-in page
`/open-house-signup` · 中文

Property line reads "123 Main St, Los Angeles, CA 90001 **(default demo property — scan a property QR code for property-specific signup)**" — an internal note on the page agents hand to visitors on an iPad. Stays English in 中文; heading "Sign up for Open House Updates" untranslated while every field below it is Chinese.

---

## Low

| ID | Finding |
|---|---|
| L1 | "Calculate" buttons are no-ops — bare `type="button"`, no handler; results are reactive. |
| L2 | Doubled title suffix: `HOA Fee Tracker \| CloseBoss \| CloseBoss AI`, `联系我们 \| CloseBoss \| CloseBoss AI`. |
| L3 | Tool names stay English on the Chinese free-tools hub (21 deliberately-identical keys). |
| L4 | Zillow analyzer: description, both buttons, and the validation error stay English in 中文. |
| L5 | Max avatar paints as an empty circle before the image loads. |
| L6 | Cap rate shows `0.00%` when purchase price is 0; "—" would read as handled. |

---

## What held up

| Checked | Input | Result | Verdict |
|---|---|---|---|
| Cap rate | $850,000 · $66,000 rent · 7% vac · $20,600 exp | NOI $40,780 · 4.80% | Correct |
| Mortgage | $240,000 · 5.00% · 30 yr | $1,288.37/mo · $223,814 interest | Correct |
| Annual pricing | Pro $79 → $65.83 | $790/yr, saves $158 | Correct |
| Annual pricing | Premium $199 → $165.83 | $1,990/yr, saves $398 | Correct |
| Annual pricing | Signature $399 → $332.50 | $3,990/yr, saves $798 | Correct |
| Translation catalogs | 39 namespaces, EN ↔ zh-Hans | 0 missing, 0 orphaned keys | Clean |
| Route availability | 98 routes × 2 locales | 196 × HTTP 200 | All up |
| Contact page | 中文 incl. TCPA SMS consent | Fully translated | Good |
| Agent pricing | 中文 incl. title tag | Fully translated, math consistent | Good |
| Input validation | Empty address, non-listing URL | Both rejected clearly | Good |

The catalog result is the encouraging one: every English key exists in Chinese across all 39 namespaces with no drift in either direction, and the 125 identical strings are brand and platform names that should stay as they are. **The bilingual gaps in this report are not translation debt — they are strings that were never handed to the translation layer.**

---

## Where I'd start

1. **Stop showing invented numbers.** H1 and H2 share one root cause — nulls coerced to zero plus a hardcoded 1,500 sqft. A null-safe render pass across both tools removes the worst credibility risk on the site.
2. **Check what's actually deployed.** M1 proves production is behind the working copy. Confirm before triaging the rest.
3. **Add `router.refresh()` to the locale switch.** One line closes H3 and the split-language rendering behind it.
4. **Trace the /onboarding freeze.** It sits on the primary CTA.
5. **Externalise the calculator labels.** 60+ strings, mechanical, fixes 14 pages at once.
6. **Test the signed-in product.** CRM, AI team, offers, transactions, calendar — entirely untested.
