# The gates and the price list disagree

**Status:** open — documented, not fixed. Decision deferred 2026-09-06.

`/plans` promises every feature on every tier. Fourteen API routes gate on a
retired feature-tier catalogue that grants the free tier one feature. Nine
routes are therefore refused to every account on the system.

Nothing here is broken by accident: both halves work exactly as written. They
were written against different products.

---

## What the price list says

`packages/i18n/locales/en/web_plans.json` → `plans.blurb`:

| tier | blurb |
| --- | --- |
| free | Every feature, one seat. **Enough to try the AI receptionist.** |
| solo | Every feature, one seat. For steady solo marketing. |
| pro | Every feature, one seat. For daily calling and regular video. |

The credit model is *every plan includes every feature; tiers differ by credit
volume*. `lib/credits/pricing.ts` prices the usage — voice is 8 credits/minute,
so the free tier's 100 credits buys about twelve call-minutes. **Credits are
the limit, not features.**

## What the gates do

`lib/billing/subscriptionAccess.ts` → `getActiveCrmSubscription()`:

```ts
// No paid row, but the user is an agent:
return { plan: "starter", status: "active", cadence: "monthly" };
```

Every account resolves to `starter`, and in `lib/billing/plans.ts`:

```ts
starter: { features: ["basic_crm"], … }
```

`requireCrmFeature(feature)` → `userHasCrmFeature` → `hasFeature` →
`PLANS[plan].features.includes(feature)`.

## The result, for all 19 accounts

| route | needs | outcome |
| --- | --- | --- |
| `ai-email/send/bulk` | `basic_crm` | allowed |
| `ai-sms/send/bulk` | `basic_crm` | allowed |
| `dashboard/outreach/schedule` | `basic_crm` | allowed |
| `dashboard/outreach/scheduled` | `basic_crm` | allowed |
| `dashboard/outreach/scheduled/[id]` | `basic_crm` | allowed |
| `dashboard/books/expenses` | `bookkeeping` | **blocked** |
| `dashboard/books/expenses/delete` | `bookkeeping` | **blocked** |
| `dashboard/books/invoices` | `bookkeeping` | **blocked** |
| `dashboard/books/invoices/pdf` | `bookkeeping` | **blocked** |
| `dashboard/books/invoices/send` | `bookkeeping` | **blocked** |
| `dashboard/books/invoices/status` | `bookkeeping` | **blocked** |
| `dashboard/voice/appointment-reminders` | `ai_calling` | **blocked** |
| `dashboard/voice/outbound-call` | `ai_calling` | **blocked** |
| `dashboard/voice/outbound-call/bulk` | `ai_calling` | **blocked** |

The sharpest case is the free tier's own blurb: it names the AI receptionist as
the thing free is for, and `ai_calling` is one of the blocked features.

Note there is no *paid* plan to upgrade into that would lift these, either —
the feature-tier ladder (`starter`/`pro`/`premium`/`signature`/`team`) is
retired as a price list. Every route that sold it answers 410, and no row in
`billing_subscriptions`, `agents`, `leadsmart_users` or `product_entitlements`
carries one of its plans.

---

## The two ways out

**Open the gates.** Give every tier every feature, so `requireCrmFeature`
degrades to what it is still genuinely good for — refusing someone who is not
an agent at all — and credits do the limiting. This is one data change in
`plans.ts` and it makes the code agree with what `/plans` already sells. Spend
stays bounded, because voice and video are priced in credits.

**Fix the price list.** If the gates encode the intended product, then `/plans`
overpromises: the blurbs should stop saying "Every feature, one seat" and stop
naming the AI receptionist on a tier that cannot place a call.

Either is small. Choosing is a commercial call, which is why this file exists
instead of a patch.

---

## What NOT to do

Do not delete the `features` arrays from `lib/billing/plans.ts` because
`hasFeature` looks unused.

`hasFeature` has zero callers outside its own definition and test, which makes
the whole feature-gating layer look dead. It is not: `hasFeature` is the inner
helper of `userHasCrmFeature` and `requireCrmFeature`, which have 41 callers
between them across the fourteen routes above. Deleting the arrays would open
every gate silently, which is one of the two outcomes above — but arrived at by
accident, unreviewed, and recorded in the history as a cleanup.

`plans.ts` is retired as a **price list** and live as an **entitlement
dictionary**. Those are different jobs and only the first one ended.
