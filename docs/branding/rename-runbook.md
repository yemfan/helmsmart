# Brand rename runbook

Fire this when a replacement name is chosen. Written 2026-07-15, off a real dry-run
(`node scripts/rename-brand.mjs --name X --domain Y`), so the numbers below are measured,
not estimated.

## Why

`RealtyBoss` collides with **USPTO Reg. 6152911** — LIVE, REGISTERED, Class 036, covering
*"Real estate agency services; Real estate brokerage; Real estate listing; Real estate
valuations"*, first use 2019-09-01, owned by RealtyBoss, LLC (Fort Lauderdale). Identical
mark, same industry, and their recital covers valuations — which is what the AI CMA and
Home Value Estimator do. See `HANDOFF-realtyboss-compliance.pdf` (P0).

## The one insight that shrinks this

**The brand and the "Boss Assistant" are separable.** The mark at issue is REALTYBOSS,
not BOSS — and BOSS is laudatory and heavily crowded (Follow Up Boss, PropertyBoss,
LoanBoss, RentBoss, SalesBoss all coexist). A product named *something else* containing a
"Boss Assistant" does not use their mark.

So the theme constitution survives intact: you manage a team, the Boss Assistant is your
chief of staff, the nav stays. **You are changing a name, not a concept.**

That means these do **not** change:

| Stays | Why |
|---|---|
| `boss_*` DB identifiers (`boss_instructions`, `boss_recommendations`, `boss_runs`, `boss_autopilot_settings`) | The assistant role, not the brand |
| `lib/realtyboss/`, `components/realtyboss/`, `app/api/dashboard/realtyboss/` (73 paths) | Internal; no user sees them. 230 of 263 lowercase refs are import paths |
| `**/migrations/**` | History. Rewriting them rewrites what already ran in prod |
| `REALTORBOSS_LEGACY.md`, `next.config.js` compat rewrites | These exist to record the old name |
| Legacy `realtorboss` spellings (46) | Intentionally preserved |

## Measured scope

- **361 files, 1,025 replacements** (user-visible brand + domain)
- Domain refs: 267 (`realtybossai.com` 192, `www.` 67, `app.` 8)
- i18n copy: 148 strings across 28 locale files — **EN and zh-Hans**; the Chinese needs a human read
- 3 `git mv`s (emitted by the script)
- 8 binaries to regenerate (6 brand PNGs + 2 lead-magnet PDFs)

## Steps

### 1. Sweep

```bash
node scripts/rename-brand.mjs --name "NewName" --domain "newdomain.com"          # dry run
node scripts/rename-brand.mjs --name "NewName" --domain "newdomain.com" --apply  # write
```

Then run the `git mv` commands it prints. **Non-optional** — the sweep rewrites both the
`RealtyBossLogo` identifier and its `@/components/brand/RealtyBossLogo` import specifier,
so the file must move with it or the build breaks.

Review `git diff` before committing. Then `pnpm typecheck` (repo lint is broken — use
typecheck).

### 2. Art (the real time sink — human, not code)

- `components/brand/RealtyBossLogo.tsx` → new mark (exports `RealtyBossLogo` + `RealtyBossMark`)
- `public/brand/realtyboss/` — 6 PNGs; regen via `scripts/generate-realtorboss-icons.mjs` (sharp)
- `public/downloads/RealtyBoss_5_AI_Prompts{,_ZH}.pdf` — lead magnets, rebuild
- Favicons + `og:image`
- Update `docs/branding/realtyboss-theme-constitution.md` (the renamed `.docx` — edit the
  source, then re-extract to `.extracted.md`)

### 3. Domain + hosting

- Buy the domain. **Note:** every pronounceable short `.com` is squatter-held (20/20
  checked resolve), so expect to pay, or reuse the proven `+ai` pattern
  (`realtybossai.com` was itself that workaround). Domains are a price question, not a filter.
- Vercel: add domain, set as primary, keep `realtybossai.com` aliased with 301s
- **Fix `NEXT_PUBLIC_SITE_URL` in `.github/workflows/next-build-leadsmartai.yml`** — it is
  currently `https://leadsmart-ai.com`, a domain the repo's own docs call dead, while page
  code canonicalises to `realtybossai.com`. This is live SEO damage today and is
  independent of the rename. Fix it regardless of what happens with the name.
- Redirect map: `realtybossai.com` → new (301, preserve GTM asset links)

### 4. External systems

| System | Action | Notes |
|---|---|---|
| **Google Play** | **New listing required** | `com.realtybossai.app` is **immutable**. See below. |
| Apple | *Nothing* | Bundle is `ai.leadsmart.mobile` — already brand-neutral |
| Twilio | Repoint SMS webhook to `https://www.<newdomain>/api/sms/webhook` | Must be `www` (non-www 308s, Twilio won't follow) **and** match `APP_BASE_URL` or the handler 403s "Invalid signature" |
| Resend | *Nothing* | Sends from verified `helmsmart.ai`, not the brand domain |
| Supabase | *Nothing* | Project name is cosmetic |
| Stripe | Product/price display names | Cosmetic |
| LinkedIn | Brand account + auto-poster (agent 22) | |
| Retell | Check agent prompts for the brand name | |

### 5. Do this before promoting to production

**`com.realtybossai.app` cannot be changed.** Android package names are permanent once
published; a rename means a brand-new Play listing with nothing carried over.

Today that costs ~nothing — internal testing only (first submitted 2026-07-03), no
installs, ratings, reviews, or ranking to lose. The moment it hits production that becomes
permanent. **This is the strongest argument for deciding early** — not legal risk, the
Play listing. The cost only grows.

## Known gaps

- `realtyboss-ai` (1) and `realtyboss ai` (2) — lowercase variants the default rules miss.
  Grep after sweeping.
- `RealtyBossNewsletterBot` (1) — swept consistently, but check where it surfaces.
- `--deep` also rewrites lowercase `realtyboss`; only use it with matching `git mv`s for
  `lib/`, `components/`, and `app/api/dashboard/`. Deferrable indefinitely.

## Related

- Memory: `project_realtyboss_trademark_blocker.md` — register facts, the Follow Up Boss
  precedent, the naming screen results
- Prior rename (RealtorBoss → RealtyBoss, PR #766): `apps/leadsmartai/REALTORBOSS_LEGACY.md`
- **FinanceBoss warning:** if the `___Boss` family continues, FinanceBoss needs its own
  clearance check — Class 036 is insurance/financial/monetary *and* real estate, so it
  lands in Reg. 6152911's class rather than a neighbouring one.
