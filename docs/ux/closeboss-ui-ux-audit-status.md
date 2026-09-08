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
"after" is run 34248052867 with everything below live — median of three
runs per route, measured as real Chrome (see the last two rows). Ask Max was
the worst page on the product and the one every agent lands on.

| Route | Perf before → after | LCP before → after | CLS before → after |
|---|---|---|---|
| Ask Max (`/dashboard`) | 38 → **82** | 7.9 s → **1.75 s** | 0.70 → **0.02** |
| Contacts | 64 → 71 | 3.3 s → 2.6 s | 0.00 → 0.00 |
| Conversations | 77 → 81 | 1.9 s → 1.7 s | 0.00 → 0.02 |
| Tasks | 61 → 81 | 3.6 s → 1.7 s | 0.00 → 0.06 |
| Calendar | 76 → 77 | 2.2 s → 2.1 s | 0.00 → 0.03 |
| Settings | 82 → 85 | 1.9 s → 1.7 s | 0.00 → 0.00 |

Server side, from a signed-in session on production: a warm dashboard
page's first byte went from ~0.9–1.0 s to 0.4–0.65 s, `/api/me` from 1.3 s
to 0.2 s, and the document from 830 KB to ~100 KB.

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

Still structural, not fixed: the client JS arrives in six to eight dependency
rounds (~25 chunks), which is the bundler's chunk graph rather than app code;
and the server's response time still varies run to run (0.6–2.6 s for the
same page on the same commit — another instance, a slow query), which is why
the job takes a median. Contacts is the one route still over 2.5 s LCP: its
page reads 500 contacts plus per-contact showing and offer stats before the
first byte. The dispatch gate is still off; the scheduled run gates at
perf ≥ 0.85 / LCP ≤ 2.5 s / CLS ≤ 0.1 / TBT ≤ 200 ms and will fail until the
remaining routes clear 0.85.

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
