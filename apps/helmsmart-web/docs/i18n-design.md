# HelmSmart three-language design (en · zh-Hans · es)

Status: design, 2026-09-09. Chinese ships first; Spanish is wired for but not
bundled until its translations exist.

## Summary

HelmSmart has no UI localization today. Every heading, label, email and AI
briefing is English in source. CloseBoss (`apps/leadsmartai`) has a complete,
battle-tested i18n stack — locale contract, server and client translators,
language picker, AI language directives, and nine CI guard tests that caught
the "half-Chinese page" in each of its disguises. This design moves the
app-agnostic half of that stack into the shared `@leadsmart/i18n` package and
wires HelmSmart onto it, so the two apps run the **same code path** and the
same guards.

Decisions at a glance:

| Question | Decision |
| --- | --- |
| Locale ids | `en`, `zh-Hans`, `es` (BCP-47, script subtag on Chinese) |
| Where the owner's choice lives | cookie `helmsmart_locale` (fast path) + `user_preferences.ui_locale` (durable, for crons) |
| Resolution order | cookie → `Accept-Language` → `en` |
| Shared code | pure core moves to `packages/i18n/src/` (resolveKey, translatorFor, languageDirective, intlLocale, translateNav, plurals); Next glue becomes factories under `@leadsmart/i18n/next` |
| Bundles | per app: `apps/helmsmart-web/messages/<locale>/<ns>.json`; HelmSmart reuses the package's already-translated `common` namespace |
| Two readers | UI locale is the **owner's** language; `clients.preferred_language` stays the **contact's** language. They never collapse. |
| Pack terms × translation | relabel first (`terms[label] ?? label`), then translate the result; `nav.json` carries both core and pack nouns |
| Spanish | contract, Intl map, directive and picker support land now; `es` enters `SUPPORTED_LOCALES` only when its bundles pass the parity test |
| CI | port the CloseBoss guard tests; add `vitest-helmsmart.yml` (HelmSmart has no vitest gate today) |

## What exists today

### CloseBoss — reusable as-is or with a config parameter

`apps/leadsmartai/lib/i18n/` plus `packages/i18n/`:

| Piece | File | Portable? |
| --- | --- | --- |
| Locale contract: `SUPPORTED_LOCALES`, `resolveLocale` (collapses zh-CN/zh-SG → zh-Hans), `localeDisplayName` | `packages/i18n/src/locales.ts` | already shared |
| Key resolution: locale bundle → `defaultValue` → English bundle → key; `{{var}}` interpolation | `lib/i18n/resolveKey.ts` | pure — move |
| `translatorFor(locale, ns)` — synchronous `t()` for crons and email renderers | `lib/i18n/translator.ts` | pure once `resources` is a parameter — move |
| `languageDirective` + JSON / mixed / extraction variants for AI prompts | `lib/i18n/languageDirective.ts` | pure — move |
| `intlLocale()` — locale id → BCP-47 tag for `Intl` | `lib/i18n/locale.ts` | pure — move |
| `translateNavSections` — translate an authored nav tree, keyed by English label | `lib/i18n/navLabels.ts` | generic over `{label, items}` — move |
| `getServerLocale` / `getServerT` (cookies + headers) | `lib/i18n/server.ts` | Next-bound; becomes a factory taking `{cookieName, resources}` |
| `initClientI18n` / `setLocaleCookie` / `useSetLocale` (i18next + `router.refresh()`) | `lib/i18n/client.ts` | same |
| `<I18nProvider locale>` | `lib/i18n/I18nProvider.tsx` | same |
| `agentUiLocale()` — DB lookup for request-less code | `lib/i18n/agentLocale.ts` | schema-specific; HelmSmart writes its own `userUiLocale()` |
| `LanguageToggle` (header EN / 中文 radiogroup), `LanguagePanel` (settings list) | `components/` | copy; restyle to HelmSmart tokens |
| `POST /api/dashboard/ui-language` | `app/api/dashboard/ui-language/route.ts` | copy; targets `user_preferences` |
| Nine guard tests: residualEnglish, jsxExpressionEnglish, missingKeys, serverNamespace, clientNamespace, untranslatedValues, localeBlindDates, translatorBoundary, copyInDataProps, navLabels parity | `lib/i18n/__tests__/` | copy with a config block at the top (root, scan dirs, namespaces) |
| `common` namespace: 90 generic verbs and statuses, already in zh-Hans | `packages/i18n/locales/{en,zh-Hans}/common.json` | import directly; override `app_name` |

### HelmSmart — what the design has to respect

- **No UI i18n at all.** `<html lang="en">` is hardcoded in `app/layout.tsx`. Rough
  count of English in source: ~810 JSX text nodes, ~180 copy attributes, ~170
  string literals inside `{…}` expressions, ~260 error strings returned from
  server actions, 135 `metadata.title` values, 139 `toLocale*` calls and 50
  `new Intl.*` calls, most hardcoded to `en-US`.
- **A customer-language layer already exists.** `lib/language.ts` detects an
  inbound message's language as `Lang = "en" | "es" | "zh"`, translates it to
  English for the inbox (`messages.translation_en`), and localizes outbound
  replies and invoice reminders bilingually when
  `organizations.owner_english_assist` is on (migration `00038_multilanguage`).
  `clients.preferred_language` remembers it per contact. The AI Receptionist
  greets callers in the caller's language. **This is the contact's language, not
  the owner's, and it stays.**
- **Pack terms relabel the nav.** `components/sidebar.tsx` applies
  `terms[label] ?? label` from the active industry pack (medical: Clients →
  Patients, Books → Billing). Translation has to compose with that.
- **Two Supabase projects.** Core (`vpmwsnoosuiknyzdxgtk`) and the medical
  island. Any new table ships to both.
- **No vitest CI gate.** `vitest.config.ts` includes `lib/**/*.test.ts`, but no
  workflow runs it. The guard tests are worthless until one does.
- **Server-rendered by default.** 91 of 95 pages are Server Components, so most
  copy goes through `getServerT`, and the `_one/_other` plural gap in the
  server translator (see memory: getServerT has no plurals) has to be closed
  first.

## The model: two languages, two readers

Every string HelmSmart produces is read by one of two people:

1. **The owner** — the person signed in. Their language is the **UI locale**:
   headings, nav, settings, Tim's briefing, Ask answers, the weekly digest
   email, approval notices. Source of truth: cookie, then `user_preferences`.
2. **The contact** — a client, a caller, a lead. Their language is
   `clients.preferred_language` (detected by `lib/language.ts`). Invoices,
   reminders, campaign SMS, review requests, receptionist speech.

The rule that makes this safe is the one CloseBoss already encodes in
`languageDirective`: an owner who reads Chinese with English-speaking clients
must never have a client-facing message flipped into Chinese because the
dashboard is in Chinese. Every generator is tagged with which reader it serves,
and only owner-facing generators take the UI locale.

The existing "Show me English (multi-language assist)" setting presumes the
owner reads English. Once the UI locale exists, the assist translates inbound
messages into the **owner's UI locale**, and the label becomes "Show me my
language". `translation_en` keeps its name in Phase 1 and generalizes in
Phase 3 (a `translation_locale` column beside it).

## Architecture

### Package split

```
packages/i18n/
  src/
    locales.ts          ALL_LOCALES = [en, zh-Hans, es]; resolveLocale(input, supported)
    resolveKey.ts       moved from leadsmartai — + plural rules (count → _one/_other via Intl.PluralRules)
    translator.ts       translatorFor(resources, locale, defaultNs)
    languageDirective.ts moved; LANGUAGE_NAMES gains es: "Español (Spanish)"
    intl.ts             intlLocale(): en→en-US, zh-Hans→zh-CN, es→es-US
    nav.ts              translateNavSections<T extends {label?, items?}>
    next/
      server.ts         createServerI18n({ cookieName, resources, supported }) → { getServerLocale, getServerT }
      client.tsx        createClientI18n({ cookieName, resources, namespaces, supported, persistUrl })
                        → { I18nProvider, useSetLocale, setLocaleCookie, i18n }
  locales/<locale>/*.json   CloseBoss + mobile bundles (unchanged)
```

`next`, `i18next`, `react-i18next`, `server-only` become peer dependencies of
the package. The workspace uses the hoisted linker, so both apps resolve one
copy. `apps/leadsmartai/lib/i18n/*` shrinks to a config file that calls the
two factories with the CloseBoss resources and cookie name; its call sites do
not change.

`SUPPORTED_LOCALES` stays exported for CloseBoss and mobile with its current
value. HelmSmart passes its own list to the factories. When Spanish ships, the
app that ships it first widens its own list; the package's `ALL_LOCALES` is
the type-level superset and is what `resolveLocale` and `LANGUAGE_NAMES` know.

### HelmSmart app wiring

```
apps/helmsmart-web/
  lib/i18n/
    config.ts        I18N_COOKIE_NAME = "helmsmart_locale"; SUPPORTED = ["en","zh-Hans"]; resources map
    server.ts        export const { getServerLocale, getServerT } = createServerI18n(config)
    client.tsx       export const { I18nProvider, useSetLocale } = createClientI18n(config)
    userLocale.ts    userUiLocale(userId): user_preferences.ui_locale → null   (for crons)
    __tests__/       the ported guards
  messages/
    en/        common.json (re-export of package common + app_name override), nav.json, settings.json,
               dashboard.json, books.json, auth.json, site.json, emails.json
    zh-Hans/   same set
  components/
    language-toggle.tsx   header EN / 中文 (/ ES) radiogroup
    language-panel.tsx    Settings → General → Language
  app/api/me/ui-locale/route.ts   POST { locale } → user_preferences
```

Root layout (`app/layout.tsx`): resolve `locale` with `getServerLocale()`,
set `<html lang={locale}>`, wrap `children` in `<I18nProvider locale>`, and
translate the "Skip to content" link. `generateMetadata` uses `getServerT("site")`
for the description.

Dashboard layout: pass nothing new — `Sidebar` translates its own tree:

```ts
// components/sidebar.tsx
const { t } = useTranslation("nav");
const sections = translateNavSections(
  navSections.map(relabel),      // pack terms first: "Clients" → "Patients"
  (label) => t(label, { defaultValue: label }),   // then translate: "Patients" → "患者"
);
```

`nav.json` is keyed by the English label, including pack nouns:
`"Clients": "客户"`, `"Patients": "患者"`, `"Front Desk": "前台"`. A new nav
entry with no translation renders its English label, never a raw key — the
same choice CloseBoss made for the same reason.

Language picker placement: the compact toggle sits in the marketing nav (next
to "Sign in") and in the dashboard sidebar footer beside the account menu; the
full panel is the first card on Settings → General, above the org form, with
the title "Language / 语言". Picking a language writes the cookie, flips
i18next, `router.refresh()`es so Server Components catch up, and POSTs the
durable copy. The picker is per **user**, not per org: two owners of one
business can read different languages.

### Dates, numbers, money

Every `toLocaleDateString("en-US")` and `new Intl.DateTimeFormat("en-US")`
becomes `intlLocale(locale)`. Money uses the org's existing `currency` column:

```ts
new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: org.currency ?? "USD" })
```

`lib/briefing.ts` hardcodes `$` and `en-US`; it takes `locale` as an argument
in Phase 1 because Tim's briefing is the first owner-facing text on the Home
page. `localeBlindDates.test.ts` fails any internationalized file that still
formats a date without a locale.

### Owner-facing AI generators

Append `languageDirective(locale)` (or the JSON variant) to the system prompt
of every generator whose output the **owner** reads, and only those:

| Generator | Reader | Locale source | Directive |
| --- | --- | --- | --- |
| `app/api/ask/route.ts` (Ask) | owner | request cookie | `languageDirective` |
| `lib/briefing.ts` (Tim's daily briefing) | owner | request or `userUiLocale` (cron) | `languageDirective` |
| `lib/business-insights.ts` (weekly insights cron) | owner | `userUiLocale` per recipient | `languageDirectiveForJson` |
| `lib/actions/client-brief.ts` (AI client brief) | owner | request cookie | `languageDirectiveForJson` |
| `lib/actions/expense-categorize.ts`, `categorize.ts` notes | owner | request cookie | `languageDirectiveForJson` (enum values stay English) |
| `lib/actions/messages.ts` reply draft | contact | `preferred_language` | none — already handled by `lib/language.ts` |
| `lib/actions/estimates.ts`, `campaigns.ts`, `social.ts`, `invoice-reminders.ts`, `receptionist-agent.ts` | contact / public | existing | none |

The directive's `LANGUAGE_NAMES` map gains `es`. Prompts are cache
breakpoints, so the directive string is deterministic per locale (one cached
prefix per language) — this is already how CloseBoss does it and is why the
paragraph is a constant, not a template.

### Owner-facing emails

`translatorFor(locale, "emails")` is synchronous and request-free, which is
what a cron needs. Owner-facing senders: the weekly digest
(`api/cron/digest/weekly`), team invites (`lib/actions/team.ts`), approval and
form-submission alerts (`lib/automation-engine.ts`, `api/forms/[slug]`).
Recipient locale comes from `userUiLocale(userId)`; a digest to three owners
renders three times. Contact-facing mail (invoices, estimates, reminders,
campaigns, review requests) is untouched.

### Metadata and the marketing site

Cookie-based locale means one URL serves every language. That is right for the
app and acceptable for the marketing site in Phase 1 — it is what CloseBoss
does — but it hides Chinese and Spanish pages from search. Phase 3 revisits
`/zh` and `/es` path prefixes with `hreflang` for `(marketing)` routes only;
the app never needs a prefixed URL. `metadata.title` values move to the `site`
namespace via `generateMetadata` in the same phase.

## Data

### Migration: `user_preferences`

```sql
create table if not exists user_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ui_locale  text check (ui_locale in ('en','zh-Hans','es')),
  updated_at timestamptz not null default now()
);
alter table user_preferences enable row level security;
create policy "own preferences" on user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Per user, not per membership or per org: language belongs to the person. The
file lands in `apps/helmsmart-web/supabase/migrations/` (the canonical source
for Core) and is applied to **both** Supabase projects; the medical island has
its own `auth.users`. Repo-first, then `apply_migration`.

Write path: `POST /api/me/ui-locale` upserts through the RLS client and asks
for the row back (`.select("user_id")`), returning 401 signed-out — the cookie
has already done the visible work, so a failed write never blocks the flip.
Read path for crons: `userUiLocale(userId)` returns the column or `null`
("no evidence"), and every caller treats `null` as English.

## Locale codes and the three name spaces

| Meaning | Codes | Where |
| --- | --- | --- |
| UI locale (owner) | `en`, `zh-Hans`, `es` | cookie, `user_preferences`, i18next, `<html lang>` |
| Contact language (detected) | `en`, `es`, `zh` (`Lang`) | `clients.preferred_language`, `lib/language.ts` |
| `Intl` tag | `en-US`, `zh-CN`, `es-US` | `intlLocale()` only |

The two-letter `zh` in `Lang` is not renamed; it is data, and Haiku returns
it. A one-line `langToLocale()` maps `zh → zh-Hans` and `es → es` for the single
place both meet: the inbox translating an inbound message into the owner's UI
locale (Phase 3). `resolveLocale` keeps returning `null` for `zh-Hant` /
`zh-TW` / `zh-HK` — Traditional Chinese is a separate bundle set, not an alias.

Spanish region: `es` without a region tag, as the package's own comment already
plans. `es-US` for `Intl` because HelmSmart's customers are US small businesses
(USD, US date order). An `es-MX` split comes only if translations diverge.

## Bundles and namespaces

HelmSmart is roughly 1,500 strings against CloseBoss's 9,000-key `dashboard`
namespace, so the split is by product surface, small enough to translate in
one sitting each:

| Namespace | Covers | Est. keys |
| --- | --- | --- |
| `common` | package `common` + `app_name` | 0 new |
| `nav` | sidebar sections and items, pack nouns, settings tabs, books sub-nav | ~60 |
| `settings` | Settings page and every settings form | ~200 |
| `dashboard` | Home, Command Center, Insights, Inbox, Calendar, Tasks, Clients, Pipeline, Projects, Timesheets, Workflows, Automations, Reception, Voice | ~600 |
| `books` | Invoices, Quotes, Bills, Expenses, Reports, Journal, Aging, Vendors, 1099 | ~350 |
| `auth` | login, signup, forgot/reset, accept invite, onboarding | ~80 |
| `site` | marketing pages, metadata titles/descriptions, footer | ~250 |
| `emails` | owner-facing email subjects and bodies | ~40 |
| `errors` | server-action error strings (`{ ok: false, error }`) | ~260 |

Server actions return **keys**, not English, once their surface is
internationalized: `{ ok: false, error: "errors.invoice.notFound" }`, and the
client resolves it with `t(error, { ns: "errors" })`. Keys that exist in no
bundle render as the key — loudly, on purpose.

Translation production: Chinese strings are generated with Claude from the
English bundle plus a glossary (product nouns HelmSmart, Tim, Emma, Alex,
Emily stay; "Books" → 账务; "Quotes" → 报价单; "Pipeline" → 销售管道; pack terms
per pack), then reviewed by Michael before merge. `untranslatedValues.test.ts`
fails a zh-Hans value that is byte-identical to its English source unless it
matches an allowed shape (URL, interpolation-only, proper noun).

## Guards and CI

Port from `apps/leadsmartai/lib/i18n/__tests__/` into
`apps/helmsmart-web/lib/i18n/__tests__/`, each with a config block naming the
scan roots (`app`, `components`), the bundle root (`messages`) and the
namespaces. The tests scan by "does this file call `useTranslation` or
`getServerT`", so a file is held to the standard only once it opts in — which
is what lets the port land page by page.

| Guard | Catches |
| --- | --- |
| `residualEnglish` | JSX text and copy attributes still in English in a translated file |
| `jsxExpressionEnglish` | `{cond ? "Saving…" : "Save"}` literals (AST-based) |
| `missingKeys` | a literal `t("x.y")` that resolves in no bundle |
| `serverNamespace` / `clientNamespace` | a key read from the wrong namespace |
| `untranslatedValues` | zh value identical to en |
| `localeBlindDates` | `toLocaleDateString("en-US")`, `()` or `(undefined)` in a translated file |
| `translatorBoundary` | `"use client"` not first; client module importing the server translator |
| `copyInDataProps` | copy in module-scope arrays one hop before JSX |
| `navLabels` | every nav label has a zh key; both locales hold the same key set |

New workflow `.github/workflows/vitest-helmsmart.yml`, a copy of
`vitest-leadsmartai.yml` filtered to `helmsmart`, unfiltered by path, added
to the required checks on `main`. This is a prerequisite, not part of the
i18n change: without it the guards protect nothing.

## Phasing

Each phase is one or a few PRs, each independently shippable, each behind the
same rule: a page is either fully in a bundle or not opted in.

**Phase 0 — shared core (one PR, both apps, no visible change).** Move the
pure modules into `packages/i18n/src/`, add the two Next factories, add
plural resolution to `resolveKey`, add `es` to `ALL_LOCALES`, `LANGUAGE_NAMES`
and `intlLocale`. CloseBoss's `lib/i18n` becomes config over the factories;
its 2,266-test suite is the regression check. Ship `vitest-helmsmart.yml`.

**Phase 1 — HelmSmart shell in Chinese.** Config, provider, root layout,
`<html lang>`, migration, `/api/me/ui-locale`, picker in header and Settings,
sidebar + settings tabs + books nav (`nav`), Settings page and forms
(`settings`), Home + Command Center + Tim's briefing with the directive
(`dashboard` part 1), auth + onboarding (`auth`), `intlLocale` on every date on
those pages. The guards come in with the first opted-in file. Outcome: an
owner can pick 简体中文 and reach a Chinese dashboard, settings and sign-in.

**Phase 2 — the working surfaces.** Inbox, Clients, Tasks, Calendar,
Pipeline, Projects, Timesheets, Workflows, Automations, Reception, Voice
(`dashboard` part 2); Invoices through 1099 (`books`); `errors` namespace
with server actions returning keys; money via `Intl.NumberFormat` +
`org.currency`. Ask, client brief, insights and categorizers get the
directive. Medical pack terms and tagline in zh-Hans.

**Phase 3 — what reaches the owner outside the app.** `emails` namespace,
weekly digest and invites rendered per recipient via `userUiLocale`;
marketing site and metadata (`site`); inbox "Show me my language" generalizing
`translation_en`; decision on `/zh` path prefixes + `hreflang` for the
marketing routes.

**Phase 4 — Spanish.** Generate `messages/es/*` from the English bundles with
the same glossary, review, add `es` to HelmSmart's `SUPPORTED_LOCALES`, third
option in the picker (`ES` / `Español`). Nothing else changes — every
directive, Intl tag and guard already knows `es`. CloseBoss can adopt the same
bundles' `common` half for free.

## Non-goals and open questions

- **Not renaming `@leadsmart/i18n`.** It is namespaced for CloseBoss, and
  HelmSmart's other shared code is `@helm/*`. A rename touches every import in
  two apps for no behaviour change; do it when it hurts.
- **Not URL-prefixed locales for the app.** Cookie + `router.refresh()` is
  proven in CloseBoss. Prefixes are a Phase 3 question for the marketing site
  alone.
- **Not Traditional Chinese.** `zh-Hant` resolves to English until a bundle
  set exists.
- **Open: cookie domain across verticals.** `helmsmart.ai` and
  `doctor.helmsmart.ai` are different cookie hosts. Setting `domain=.helmsmart.ai`
  in production would carry the choice across; the durable copy in
  `user_preferences` makes this cosmetic, so it is a Phase 1 detail to
  measure, not decide now.
- **Open: which pages the medical pack translates first.** Medical is live on
  its own island with its own owners; the pack's `terms` get zh in Phase 2
  but its surfaces are the same Core routes, so nothing pack-specific is
  blocked on this.
