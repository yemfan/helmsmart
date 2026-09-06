# CloseBoss UX audit — delivery status

Companion to `closeboss-ui-ux-audit-2026-09-05.html`. Every roadmap item from the
audit, the PR that shipped it, and what is still open. Last updated 2026-09-06.

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
| Measure the first ten minutes — time to first proposal / first approval | #1613 |

## Follow-ups from verifying on production

| Finding | PR |
|---|---|
| Unlayered `a { color }` beat Tailwind text utilities (sidebar active row contrast) | #1591 |
| Server translator has no plural resolution — raw key on the public CMA page | #1610 |
| Signature $499 setup fee advertised but never charged | #1577 |

## Still open

- **Authenticated axe scan** of the dashboard routes — needs a test-account
  session (storage state) as a CI secret; the public-route job is the template.
- **Signature on the plans page** — the fee is charged now; whether Signature is
  sold on the page or stays "Talk to us" is a pricing decision.
- **Mobile approval sheet on a device** — #1618 typechecks; not run on a simulator.
