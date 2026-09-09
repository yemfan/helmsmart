# CloseBoss UX audit — delivery status

Companion to `closeboss-ui-ux-audit-2026-09-05.html`. Every roadmap item from the
audit, the PR that shipped it, and what is still open. Last updated 2026-09-07. Both axe jobs (public routes, signed-in dashboard) are green.

## Phase 1 — Critical

| Item | PR |
|---|---|
| Run-card rendering and states (markdown, no tool meter, four states) | #1552 |
| Mobile cold-start route + Boss in 中文 | #1552, #1557 |
| Onboarding consolidation — Max's welcome owns setup | #1558 |
| Plan-aware Upgrade/promo, plan name, identity props | #1552, #1569 |
| axe criticals, drawer Escape, skip link | #1552, #1564 |

## Phase 2 — High impact

| Item | PR |
|---|---|
| Leads list rebuild with card mode, one visible action per row | #1559 |
| Conversations two-pane, one pane on phones, Draft with Max | #1555 |
| Settings index and five groups, Profile moves inside | #1560 |
| Notification feed with read state | #1563 |
| Mobile tab bar (Boss · Inbox · Leads · Calendar · More), house Toggle, 中文 | #1557, #1583 |
| Sidebar footer/scroll, phone quick actions, loading states | #1580 |
| Retire the floating AI Guide bubble; Auto Pilot moves to Conversations + lead profile | #1600 |

## Phase 3 — Design system

| Item | PR |
|---|---|
| Adopt Button, Card, Dialog, Toggle; `useConfirm()` replaces native confirm() | #1564 |
| Input / Select / Textarea / Checkbox / Field and Sheet primitives | #1587 |
| Codemod gray → slate (one neutral ramp) | #1586 |
| Shared tokens package (`@leadsmart/tokens`) — mobile imports it, web CSS is held to it by test | #1616 |
| Route-level loading skeletons | #1580 |
| Dark mode (opt-in, Light / Dark / System) | #1588 |

## Phase 4 — Advanced UX

| Item | PR |
|---|---|
| Max memory — `boss_memories`, remember/forget tools, post-run extraction, Settings panel, composer context line | #1585 (recent missions), #1605 |
| Autopilot expressed as sentences (web, mobile) | #1606, #1618 |
| Confidence band + basis line on CMA values | #1607, #1610 |
| Command palette: contacts, actions, Ask Max; `g`-then-letter shortcuts | #1608 |
| Personalised Ask Max ordering by the realtor's goal — and the goal is finally saved | #1609 |

## Phase 5 — Premium polish

| Item | PR |
|---|---|
| Motion system (five named entrances, one reduced-motion rule) | #1611 |
| Landing rewrite (nine sections, hero mock says it is an example) | #1565 |
| axe in CI — public routes, weekdays and on demand, report as artifact | #1612, #1614 |
| Every violation the first scan named (labels, contrast) | #1615, #1617 |
| axe signed in — 11 dashboard routes as the test agent, critical/serious gate | #1622, #1624 |
| Every violation the first signed-in scan named (labels, switch names, 368× slate-400 contrast) | #1626 |
| Measure the first ten minutes — time to first proposal / first approval | #1613 |

## Performance pass (2026-09-08)

Measured signed in as the test agent by `lighthouse-dashboard.yml`
(desktop preset). "Before" is run 34240554600, one sample per route;
"after" is run 34290097393 with everything below live — median of three
runs per route, measured as real Chrome (see the last two rows). Ask Max was
the worst page on the product and the one every agent lands on.

| Route | Perf before → after | LCP before → after | CLS before → after |
|---|---|---|---|
| Ask Max (`/dashboard`) | 38 → **81** | 7.9 s → **1.78 s** | 0.70 → **0.02** |
| Contacts | 64 → **84** | 3.3 s → **1.73 s** | 0.00 → 0.00 |
| Conversations | 77 → 80 | 1.9 s → 1.73 s | 0.00 → 0.02 |
| Tasks | 61 → 81 | 3.6 s → 1.73 s | 0.00 → 0.06 |
| Calendar | 76 → 83 | 2.2 s → 1.74 s | 0.00 → 0.03 |
| Settings | 82 → 80 | 1.9 s → 1.97 s | 0.00 → 0.00 |

Six routes that ranged from 38 to 82 now sit between 80 and 84, and every
one paints between 1.73 s and 1.97 s.

Server side, from a signed-in session on production: a warm dashboard page's
first byte went from ~0.9–1.0 s to 0.4–0.65 s (Contacts from as much as
2.2 s to 0.42–0.64 s) and `/api/me` from 1.3 s to 0.2 s. The document
**transferred** per page went from 244–251 KB to 12–23 KB. Quote that number,
not the uncompressed length: the HTML is still 98–196 KB as a string, and
repeated Tailwind class strings compress almost perfectly, so raw length
badly overstates what anyone pays. Contacts was chased for a while on a
"729 KB document" that is 19 KB on the wire.

What was wrong, and the fix for each:

| Finding | PR |
|---|---|
| The whole English locale (733 KB of an 830 KB document) rode in every page's React payload, because the root layout passed it to the client provider as a prop. Now a code-split chunk the provider `use()`s — 100 KB document, 226 KB gzipped chunk cached after the first visit | #1660 |
| The i18n bundle for both locales shipped as one 1.36 MB client chunk | #1653 |
| Ask Max fetched its thread from the browser after ten dashboard fetches, then swapped a 328 px skeleton for a thread several times taller | #1658 |
| Each run card fetched its own detail after mount and grew when it landed | #1663 |
| Consent banner painted only after hydration and was the LCP element on every dashboard page; now decided from the cookie on the server | #1657 |
| Auth resolved twice per request in the dashboard layout; now one cached `getCurrentAgentContext` reading verified claims | #1654 |
| Two notification bells (desktop and mobile chrome) each fetched the unread count | #1659 |
| `getUserFromRequest` gated ~55 route handlers with a network call to Supabase Auth; `/api/me` then ran three reads in series (1.3 s) | #1661 |
| The dashboard layout did five serial reads, including a Stripe `subscriptions.list`, before the first byte (warm TTFB 0.9 s vs 0.2 s for an API route) | #1662 |
| Persona portraits and the logo mark served at full size; now `next/image` | #1654 |
| The proxy ran on every `/dashboard/*` request from an edge region across the country from the database and made four network calls in series (`getUser`, then three queries) — the whole gap between a page's first byte and an API route's | #1666 |
| Lighthouse job: warm-up visit per route, then the median of three runs, measured as real Chrome (Lighthouse's own UA is on Next's `htmlLimitedBots` list and was served the non-streaming path) | #1668, #1669 |
| Contacts made six database reads in series before its first byte — smart lists, contacts, their signals, showings, that showing's feedback, offers. The badges depend only on the agent and the signals reach it through a foreign key, so it is three | #1675 |
| Nightly gate set from the measured baseline (0.75) instead of an 0.85 nothing met — a gate that fails every weekday teaches everyone to ignore it. 0.85 stays the target | #1678 |

### What is left, and one trade-off worth knowing

**The locale chunk is the next lever, and it is a big one.** Moving the
locale out of the React payload is what took documents from 244 KB to 12-23 KB,
but it now loads as a **225 KB code-split chunk that nothing in the HTML
references** — 24 chunks are named there, that one is not. So the browser
cannot discover it until hydration reaches `I18nProvider`, and it arrives
last (4.7-7.7 s on the throttled profile). It does not touch first paint, and
a warm cache pays nothing, but the first load after each deploy has delayed
interactivity. The public site pays too: `/plans` downloads it as 227 KB of
522 KB total JS.

Almost none of it belongs to the page loading it. The chunk is dominated by
the `dashboard` namespace (616 KB of raw JSON), and that namespace is a
catch-all — of its `pages` subtree, **44% (202 KB) is referenced only from
non-dashboard routes** and 11% only from dashboard ones. The largest entries
are the admin back office, the client portal, public SEO articles (the whole
cap-rate cluster) and a blog post. Every signed-in agent downloads all of it,
and so does every visitor to the pricing page.

The fix is two halves that only pay off together: move the public-route
strings out of the `dashboard` namespace, then load just the namespaces a
route needs. **The first half shipped (#1680)** — `dashboard` is down from
607 KB to 364 KB and a `web_pages` namespace holds the 93 lifted subtrees.
Nothing downloads less yet; the bundle still ships every namespace.

#### What the second half needs (measured, not started)

Splitting the bundle by route group requires every module a route renders to
resolve only that group's namespaces. Three things stand in the way, all
counted on the code as it stands after #1680:

| Blocker | Size |
|---|---|
| 11 `pages.*` subtrees plus the top-level `disclaimers` are chrome BOTH worlds render (`dashFragments` is 12 KB of the 19 KB) | 19 KB |
| **32 shared modules bind a dashboard-group namespace and are imported directly by public routes** — including `components/cookie-consent/CookieConsent.tsx`, which the root layout renders on every page | — |
| App routes themselves bind 7 `web_*` namespaces (`web_contacts`, `web_posts`, `web_quick_post`, …), so the app group is not just the four obvious ones | — |

The shared chrome is easy: carry it in both namespaces, with a test asserting
the copies stay byte-identical — once the groups exist a route never downloads
both, so it is the arrangement `common` already has. The 32 modules are the
real work, and the transitive importers are not counted above.

Doing only the first two steps makes things **worse**, not better: duplicating
the chrome adds 19 KB to the single bundle everyone downloads and buys nothing
until the split actually lands. So it is all-or-nothing, and it wants an
explicit decision rather than a drive-by — the failure mode is raw keys
reaching users, which happened twice more doing #1680 (see below).

#### Two ways a namespace move renders raw keys

Both were hit doing #1680, and neither was caught by the test suite:

- A rewrite matching `t(` misses `tr(`.
- Keys held in constant arrays and passed as variables are invisible to a
  literal-key rewrite. This broke a blog post that renders correctly in
  production; only loading the page showed it.

Render the pages. Neither of these is visible to a static check, because a
key assembled at runtime is not a literal for anything to resolve.

`clientNamespace.test.ts` now also honours an explicit `{ ns: "..." }` and
checks the key against that namespace, which its own doc already intended for
the `"ns:key"` prefix form.

#### A namespace list DOES fall through — an earlier note here was wrong

This file previously claimed that `useTranslation(["a", "b"])` does not reach
the second namespace and that `missingKeys.test.ts` was wrong to assume it
does. **Both claims were false.** Checked against the pinned i18next (23.x)
three ways — a plain list, a namespace added after `init`, and a list whose
first entry was never loaded — and every one resolves from the later
namespace. `i18next`'s `resolve()` iterates the whole list. The test's
comment is correct and was left alone.

What actually produced the raw keys during that migration was almost
certainly a stale dev server: the pages rendered correctly as soon as an edit
forced a recompile. The 196 explicit `{ ns: "..." }` options added to 11 files
in #1680 were therefore unnecessary. They are valid and verified, so they were
not reverted — but do not copy that pattern believing a list would fail.

The durable lesson is unchanged and is the reason this was caught at all:
**render the pages.** The trap here was diagnosing from a dev server without
confirming the mechanism.

Smaller and still open: the client JS arrives in eight dependency rounds
(~26 chunks), which is the bundler's chunk graph rather than app code; and
the server's response time varies run to run (0.6-2.6 s for the same page on
the same commit — another instance, a slow query), which is why the job takes
a median of three.

## Follow-ups from verifying on production

| Finding | PR |
|---|---|
| Unlayered `a { color }` beat Tailwind text utilities (sidebar active row contrast) | #1591 |
| Server translator has no plural resolution — raw key on the public CMA page | #1610 |
| Signature $499 setup fee advertised but never charged | #1577 |

## Still open

- ~~Signature on the plans page~~ — resolved: with the setup-fee price configured
  (#1577), /plans sells Signature self-serve ($399/mo + one-time $499 setup);
  Upgrade lands on /dashboard/credits, which knows the current plan. "Talk to
  us" remains only for Brokerage (multi-seat), by design.
- **Mobile approval sheet on a device** — #1618 typechecks; not run on a simulator.
