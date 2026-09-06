import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CREDIT_TIERS, annualUsd, annualPriceEnv } from "../pricing";

/**
 * No page may invent its own prices.
 *
 * Four surfaces each kept a private copy of the price list, and no two agreed:
 *
 *   OnboardingFunnel   Pro  $49   Premium  $99   Signature $249
 *   /pricing           Pro  $49
 *   /start-free/agent  Pro  $49   Premium  $99
 *   /agent/pricing     Pro  $79   Premium $199   Team      $299
 *   CREDIT_TIERS       Pro $159   Premium $299   Signature $399  <- what Stripe bills
 *
 * A brokerage manager was quoted $49 for a plan that charges $159 — on the
 * funnel the landing page's own CTA leads to. Nothing failed; a hardcoded
 * number does not throw, it just quietly misquotes a stranger by 3x.
 *
 * This guard is deliberately narrow: it checks that the tier prices actually
 * on sale appear nowhere as literals in the marketing surfaces, so the next
 * reprice cannot leave one page behind.
 */

const ROOT = join(__dirname, "..", "..", "..");

/** Surfaces that display plan prices to a prospect. */
const SURFACES = [
  "components/onboarding/OnboardingFunnel.tsx",
  "app/plans/page.client.tsx",
];

/** Prices from a RETIRED ladder. Seeing one again means a page regressed. */
const DEAD_PRICES = [49, 99, 249, 199];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("plan price surfaces", () => {
  it("keeps the catalogue as the only place a tier price is written", () => {
    // Each live monthly price, as a bare numeric literal (`monthly: 159`).
    const live = CREDIT_TIERS.map((t) => t.priceUsd);
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      const src = read(rel);
      for (const price of live) {
        const re = new RegExp(`(monthly|price|priceUsd|amount)\\s*:\\s*${price}\\b`);
        if (re.test(src)) offenders.push(`${rel} hardcodes ${price}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no retired price left on a marketing surface", () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      const src = read(rel);
      for (const dead of DEAD_PRICES) {
        const re = new RegExp(`(monthly|price|priceUsd|amount)\\s*:\\s*${dead}\\b`);
        if (re.test(src)) offenders.push(`${rel} still shows retired price ${dead}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("derives annual as ten months, for every tier", () => {
    // Twelve for the price of ten — the convention every surface already used
    // (79 -> 790). Derived so it cannot drift from the monthly figure.
    for (const t of CREDIT_TIERS) {
      expect(annualUsd(t.id)).toBe(t.priceUsd * 10);
    }
    expect(annualUsd("nonexistent" as never)).toBeNull();
  });

  it("names an annual price env per tier, so the UI can gate on it", () => {
    // Annual must not be offered until its Stripe price exists — advertising
    // an uncheckoutable cadence is the same bug in a different coat.
    for (const t of CREDIT_TIERS) {
      expect(annualPriceEnv(t.id)).toBe(`${t.priceEnv}_ANNUAL`);
    }
  });

  it("still sells the four tiers at the agreed prices", () => {
    // A canary on the catalogue itself: if these change, it should be because
    // someone repriced deliberately, not because a merge went sideways.
    expect(CREDIT_TIERS.map((t) => [t.id, t.priceUsd])).toEqual([
      ["solo", 79],
      ["pro", 159],
      ["premium", 299],
      ["signature", 399],
    ]);
    expect(CREDIT_TIERS.find((t) => t.id === "signature")?.setupFeeUsd).toBe(499);
  });

  it("shows every tier it sells on the signup funnel", () => {
    /*
     * The funnel listed four plans against a five-tier catalogue, so Solo —
     * the cheapest paid plan at $79 — did not exist in the signup flow at all.
     * A prospect went straight from $0 to $159, and the $79 step was visible
     * only on /plans. Prices being right is not the same as the ladder being
     * whole.
     */
    const funnel = read("components/onboarding/OnboardingFunnel.tsx");
    const missing = CREDIT_TIERS.filter((t) => !new RegExp(`"${t.id}"`).test(funnel));
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it("has no 'team' tier — retired", () => {
    expect(CREDIT_TIERS.map((t) => t.id)).not.toContain("team");
  });
});

/**
 * The retired feature-tier ladder must stay retired.
 *
 * It was already half-retired once: /api/stripe/checkout has carried a comment
 * since 2026-08-30 saying the old catalogue is retired "and its pricing pages
 * now redirect to /plans". The precedence change shipped; the redirect did
 * not, and the old storefront kept selling at the wrong prices for five more
 * weeks. A comment is not a guarantee — this is.
 */
describe("retired feature-tier ladder", () => {
  const RETIRED_ROUTES = [
    "app/api/billing/crm/checkout/route.ts",
    "app/api/billing/crm-checkout/route.ts",
    "app/api/billing/crm/change-cadence/route.ts",
  ];

  it("answers 410 from every retired checkout endpoint", () => {
    for (const rel of RETIRED_ROUTES) {
      const src = read(rel);
      expect(src, `${rel} should refuse`).toContain("status: 410");
      // If it can still reach Stripe it can still charge someone.
      expect(src, `${rel} must not import Stripe`).not.toMatch(/from "@\/lib\/stripe/);
    }
  });

  it("no longer ships the old storefront pages", () => {
    // Their prices lived in these files; a redirect that still imports them
    // has not retired anything.
    for (const rel of [
      "app/agent/pricing/page.client.tsx",
      "app/start-free/agent/page.client.tsx",
    ]) {
      expect(existsSync(join(ROOT, rel)), `${rel} should be deleted`).toBe(false);
    }
  });

  it("redirects the retired storefront routes", () => {
    for (const rel of ["app/agent/pricing/page.tsx", "app/start-free/agent/page.tsx"]) {
      expect(read(rel), `${rel} should redirect`).toMatch(/redirect\(/);
    }
  });

  it("no longer ships the last storefront for the retired ladder", () => {
    /*
     * PricingModal was the one left. It sold Pro $79 and Premium $199 with a
     * "7-day free trial" — a different number from the 14 days the funnel
     * claimed, for a trial that does not exist — through
     * /api/create-checkout-session, against price ids whose Stripe products
     * were archived on 2026-09-04. It opened from two "Upgrade" buttons on a
     * CONSUMER home-value funnel, so the one path a visitor there had to buy
     * anything led to a checkout that could not complete.
     */
    expect(existsSync(join(ROOT, "components", "PricingModal.tsx"))).toBe(false);
    const funnel = read("app/home-value-funnel/page.tsx");
    expect(funnel).not.toContain("PricingModal");
    expect(funnel).toMatch(/href="\/plans"/);
  });

  it("quotes the live catalogue in the structured data Google reads", () => {
    /*
     * /pricing published Pro $49, Pro annual $490, Premium $99 and a Team tier
     * as JSON-LD, months after Stripe moved to 79/159/299/399 — and that is
     * the number a search result quotes, so it misprices the product before a
     * prospect ever reaches the site. It is where the $49 a brokerage manager
     * was quoted came from.
     *
     * It is a redirect now. Its last shape was the tell: the JSON-LD had been
     * fixed to derive from CREDIT_TIERS while the cards underneath still
     * rendered a fifth ladder from web_pricing.json, so the prices a visitor
     * read and the prices Google read had drifted apart inside one file. The
     * structured data lives on the page it describes.
     */
    const retired = read("app/pricing/page.tsx");
    expect(retired).toContain('redirect("/plans")');
    expect(retired).not.toMatch(/price\s*:/);

    const plans = read("app/plans/page.tsx");
    expect(plans).toContain("CREDIT_TIERS");
    expect(plans).toContain("JsonLd");
    for (const dead of ["49", "490", "99", "249", "199"]) {
      expect(plans, `JSON-LD still hardcodes ${dead}`).not.toMatch(
        new RegExp(`price:\\s*"${dead}"`),
      );
    }
    /*
     * A retired storefront must not be advertised as an offer URL either.
     * Usage, not mention: the page comment explains what it replaced, and
     * that history is worth keeping — a link or an offer url is not.
     */
    expect(plans).not.toMatch(/(?:url|href)[:=]\s*"[^"]*\/(?:agent\/)?pricing/);
  });

  it("keeps the old catalogue readable for existing subscriptions", () => {
    // Retiring it as a PRICE LIST is not deleting it as a DICTIONARY: a live
    // crm_signature subscriber's features resolve through PLANS[sub.plan].
    expect(existsSync(join(ROOT, "lib", "billing", "plans.ts"))).toBe(true);
    expect(read("lib/billing/subscriptionAccess.ts")).toContain("PLANS[sub.plan]");
  });
});
