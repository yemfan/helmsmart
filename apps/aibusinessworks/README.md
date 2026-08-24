# AI Business Works Partner Program

Part of the `Propertytoolsai` monorepo (`apps/aibusinessworks`).

The partner platform for **AI Business Works** — public marketing site, partner
registration, referral attribution, a configurable compensation engine, the
partner dashboard, and the admin dashboard.

Domain: `https://aibusinessworks.business`
Local dev: `pnpm --filter aibusinessworks dev` (port **3008**)

---

## The one rule that shapes everything

**No compensation number is hard-coded anywhere except `lib/compensation/defaults.ts`.**

That file exists only to seed plan version 1 and to keep public pages rendering
correct rates when the database is unreachable. After the seed migration runs,
the database is authoritative: an administrator edits rates, durations,
qualification thresholds, generation limits, discounts and revenue eligibility
in `/admin/compensation`, and every public page, dashboard tile and future
commission follows.

Grep check — these should return nothing outside `defaults.ts` and tests:

```bash
grep -rn "25%\|10%\|5%\|36 months" app components content --include=*.tsx
```

---

## Architecture

| Layer | Location | Notes |
| --- | --- | --- |
| Marketing site | `app/(marketing)/` | Static + ISR (600s). Reads plan data through the anon client, never cookies. |
| Partner dashboard | `app/dashboard/` | `force-dynamic`, gated by `requirePartner()`, scoped by RLS. |
| Admin dashboard | `app/admin/` | `force-dynamic`, gated once in the layout by `requireAdmin()`. |
| Compensation engine | `lib/compensation/engine.ts` | **Pure**: no clock, no I/O, no database. 26 tests. |
| Ledger writer | `lib/ledger.ts` | The only module that writes `abw_commission_transactions`. |
| Compensation config | `app/api/admin/compensation/route.ts` | Creates plan *versions*; never edits a live one. |
| Schema | `supabase/migrations/` | Core tables, RLS, seed. |

### Client selection

| Client | When |
| --- | --- |
| `lib/supabase/public.ts` | Public reads (plan, legal docs, partner directory). No session, so pages stay static. |
| `lib/supabase/server.ts` | Signed-in reads and writes. RLS scopes the data. |
| `lib/supabase/client.ts` | Browser: sign-in, sign-out. |
| `lib/supabase/admin.ts` | Service role. Only after `requireAdmin()` / `assertAdminForApi()`, plus the commission engine. |

---

## The commission engine

`calculateCommissions(input)` is pure and takes every fact as an argument, so a
commission can be reproduced years later from its stored inputs alone.

Order of operations:

1. Resolve the plan — product-specific plan if one exists, else the default.
2. Resolve the plan *version* — the version live on the transaction date decides
   the anchoring policy; under the default (`customer_start`) the customer is
   then grandfathered onto whichever version was live when they subscribed.
3. Check the revenue event type is commissionable under that version.
4. Compute qualifying revenue: gross, minus tax / discount / credits / refunds /
   chargebacks according to the configured rules.
5. Commission year = months since the **customer's** start date ÷ 12, +1.
6. Direct commission = qualifying × the year's rate.
7. For each generation up to `maxGenerations`: check the leader qualifies
   (customers, direct partners, academy, standing), then apply the generation
   rate.
8. Emit a calculation carrying rate, plan version, qualifying revenue, a plain
   English explanation, and the exact inputs.

Everything money-related is **integer cents**; every rate is **integer basis
points** (2500 = 25%). Rounding is half-away-from-zero so a reversal is the
exact mirror of its original.

### Immutability

- `abw_commission_transactions` has a trigger that rejects any `DELETE` and any
  `UPDATE` touching amount, rate, qualifying revenue, plan version, commission
  year, partner or calculation. Only workflow columns move.
- A correction is a **new** mirror-image row pointing at the original, plus an
  `abw_commission_adjustments` record with the reason.
- The engine is idempotent: a unique index on
  `(revenue_event_id, partner_id, kind, generation)` means replaying a webhook
  or re-running the batch creates nothing new.

Run it:

```bash
curl -X POST https://aibusinessworks.business/api/commissions/process -H "Authorization: Bearer $CRON_SECRET"
```

---

## Security

Row level security is on and **forced** for every `abw_` table. A partner can
read their own row, their own customers, their own commissions, and the status
and level of partners they personally sponsor. Nothing else. There is no
partner-writable path to the ledger at all.

Public-read policies exist only on data that is public by design: active
products, recognition levels, the published compensation plan, published legal
documents, and profiles a partner has explicitly set to public.

---

## Setup

```bash
pnpm install                      # from the monorepo root
cp .env.example .env.local        # fill in the Supabase values
```

### Database

The platform is installed in the shared **PropertyToolsAI** Supabase project
(`babmbowmzwizoahkmshx`). Every object is `abw_`-prefixed, so it coexists with
the other apps in that project without collision.

Migrations 0001–0004 are **already applied** there. On a fresh project, apply
them in order (repo first, then the database — never the reverse):

1. `0001_partner_platform_core.sql` — 30 tables, enums, the ledger immutability
   trigger, the idempotency index
2. `0002_partner_platform_rls.sql` — RLS on and forced everywhere, 37 policies,
   the `abw_public_partners` directory view
3. `0003_seed_reference_data.sql` — products, levels, Plan V1, Academy,
   resources
4. `0004_hardening_and_plan_effective_date.sql` — advisor fixes and the plan
   effective date

### Making someone an administrator

Run this in the Supabase **SQL Editor**, with the **PropertyToolsAI** project
selected (`babmbowmzwizoahkmshx`) — not one of the sibling projects, which have
no `abw_` tables. Paste the SQL only; the editor does not accept a `psql`
wrapper.

```sql
insert into abw_admin_users (user_id, role)
select id, 'super_admin' from auth.users where lower(email) = 'you@example.com'
on conflict (user_id) do update set role = 'super_admin';
```

If it reports 0 rows, that email has no `auth.users` row in this project yet —
register at `/join` first.

Admin access is checked against `abw_admin_users` alone, so an administrator does
not need a Partner record. The `/admin` pages additionally need
`SUPABASE_SERVICE_ROLE_KEY` set, or they render with a banner saying
administrative data cannot be read.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public reads and sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Registration, engine, admin |
| `NEXT_PUBLIC_APP_URL` | yes | Canonical URLs, referral links |
| `CRON_SECRET` | for scheduling | Bearer token for the engine endpoint |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional | Analytics |

All of these are already covered by the monorepo `turbo.json` build env
allowlist. Vercel env vars that are **not** in that allowlist are silently
stripped from the build.

---

## Deploying

Its own Vercel project in the **AI-Property-Tools** team, alongside the other
apps in this repo. Settings that are not defaults:

| Setting | Value | Why |
| --- | --- | --- |
| Framework Preset | `Next.js` | Must be set explicitly. A project created through the API before the repo is linked has nothing to detect from and lands on `Other`, which builds it as a static site: no serverless functions, no SSR, no API routes. |
| Root Directory | `apps/aibusinessworks` | |
| Include files outside the root directory | Enabled | The pnpm workspace root holds the lockfile and `node_modules`. |
| Skip deployments when unchanged | Enabled | Stops every unrelated commit in the monorepo rebuilding this app. |
| Build Command | `npm run build` | Optional - the Next.js preset already defaults to this. Matches `marketingboss`. |

Environment variables go on the Vercel project, not just in `.env.local`. All
are in the root `turbo.json` allowlist; anything absent from it is silently
stripped at build time.

### Things that fail quietly

**A missing `SUPABASE_SERVICE_ROLE_KEY` does not take the site down.** Public
pages fall back to the bundled plan in `lib/compensation/defaults.ts` and render
correct-looking rates, while registration, `/admin` and the commission engine
all fail. The site looks healthy and is not. After deploying, confirm
`/compensation` shows the plan version's real effective date rather than the
fallback's.

**The service-role key must belong to the same project as the URL.** Both point
at `babmbowmzwizoahkmshx`. A key from a sibling Supabase project authenticates
fine and then finds none of the `abw_` tables. Decode the `ref` claim to check.

**`CRON_SECRET` gates the hourly commission run.** Without it the cron endpoint
returns 401 rather than running unauthenticated - the safe failure, but nothing
gets processed. See the commission engine section above.

**`NEXT_PUBLIC_*` values are inlined at build time**, so changing one needs a
redeploy, not just a restart.

### Triggering a build when only config changed

Because deployments are skipped when `apps/aibusinessworks` is untouched, a
settings-only change does not produce a build. Use Redeploy in the dashboard, or
push a commit that touches this directory.

---

## Verification

```bash
pnpm --filter aibusinessworks run typecheck
pnpm --filter aibusinessworks run test      # 26 engine tests
pnpm --filter aibusinessworks run build
```

`pnpm lint` fails monorepo-wide with a `FlatCompat` circular-structure error
in `@eslint/eslintrc` - the same failure occurs in `apps/marketingboss`, so it
is not specific to this app. `next build` runs
its own lint pass, so it is not a coverage gap.

---

## Compliance posture

This is a compensation *structure*, presented as one — never as an earnings
promise.

- No income claims, no typical-results language, no wealth imagery.
- Every rate, example and total renders with a `<Disclaimer>`.
- The simulator is labelled an illustration and cannot produce a payable amount;
  official commissions only ever come from the server engine.
- `/success-stories` ships **empty** by design, with the publication standard
  stated. It stays empty until there are real, named, consenting subjects.
- Legal documents live in `abw_legal_documents` and are edited and published
  from `/admin/content` — counsel can revise them without a code change. The
  bundled drafts in `content/legal.ts` are fallbacks and render with an
  "unreviewed draft" banner.

**The compensation structure and final business model must be reviewed by
qualified legal counsel before public launch.**

---

## Not built yet (architected for)

Billing integration (revenue events are recorded by hand in `/admin/customers`
today, through the same table a webhook would write), payment-provider payouts
(payout records exist and carry an external reference field), academy lesson
content, partner community, certifications, multi-currency, i18n.
