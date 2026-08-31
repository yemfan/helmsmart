import { describe, expect, it } from "vitest";

import {
  entitlingRows,
  pickCurrentSubscription,
  tierFromRows,
  type BillingRow,
} from "@/lib/billing/currentPlan";

/**
 * The cases here are all drawn from real rows on agent 26, the first paying
 * account. Between them they are why "read the plan column" was never a single
 * question with a single answer.
 */

const NOW = new Date("2026-08-29T00:00:00Z");

/** Live, paid, current — the row that should win. */
const SIGNATURE: BillingRow = {
  plan: "crm_signature",
  status: "active",
  livemode: true,
  current_period_start: "2026-08-21T17:17:54Z",
  current_period_end: "2026-09-21T17:17:54Z",
};

/**
 * A $99 TEST-mode subscription, already canceled in Stripe but still marked
 * active here: `cancel_at_period_end` leaves the Stripe status `active` until
 * the period ends, and the terminal webhook that would clear it is delivered to
 * a test endpoint production never sees.
 */
const TEST_MODE: BillingRow = {
  plan: "consumer_free",
  status: "active",
  livemode: false,
  current_period_start: "2026-08-14T06:25:46Z",
  current_period_end: "2026-09-14T06:25:46Z",
};

describe("entitlingRows", () => {
  it("drops test-mode rows outright", () => {
    // A sandbox checkout was never paid for. Letting one entitle production
    // access is the whole reason livemode exists.
    expect(entitlingRows([SIGNATURE, TEST_MODE], NOW)).toEqual([SIGNATURE]);
  });

  it("keeps rows whose livemode was never recorded", () => {
    // NULL means "written before the column existed", not "test". Dropping a
    // real subscriber's entitlement over a missing backfill is the worse error.
    const legacy: BillingRow = { plan: "crm_pro", status: "active", livemode: null };
    expect(entitlingRows([legacy], NOW)).toEqual([legacy]);
  });

  it("drops a row that has outlived its own paid period", () => {
    const lapsed: BillingRow = {
      plan: "crm_team",
      status: "active",
      livemode: true,
      current_period_end: "2026-07-01T00:00:00Z",
    };
    expect(entitlingRows([lapsed], NOW)).toEqual([]);
  });

  it("keeps a row with no end date — silence is not expiry", () => {
    const open: BillingRow = {
      plan: "crm_pro",
      status: "active",
      livemode: true,
      current_period_end: null,
    };
    expect(entitlingRows([open], NOW)).toEqual([open]);
  });

  it("ignores rows that are not paying", () => {
    const rows: BillingRow[] = [
      { plan: "crm_team", status: "canceled", livemode: true },
      { plan: "crm_team", status: "past_due", livemode: true },
      { plan: "crm_pro", status: "trialing", livemode: true },
    ];
    expect(entitlingRows(rows, NOW).map((r) => r.plan)).toEqual(["crm_pro"]);
  });
});

describe("pickCurrentSubscription", () => {
  it("picks the paid live row over the test-mode one", () => {
    expect(pickCurrentSubscription([TEST_MODE, SIGNATURE], NOW)).toBe(SIGNATURE);
  });

  it("takes the highest tier when a user holds two real products", () => {
    const consumer: BillingRow = {
      plan: "consumer_premium",
      status: "active",
      livemode: true,
    };
    expect(pickCurrentSubscription([consumer, SIGNATURE], NOW)).toBe(SIGNATURE);
  });

  it("breaks a same-tier tie with the newer period", () => {
    const older: BillingRow = {
      plan: "crm_pro",
      status: "active",
      livemode: true,
      current_period_start: "2026-01-01T00:00:00Z",
    };
    const newer: BillingRow = {
      plan: "crm_pro",
      status: "active",
      livemode: true,
      current_period_start: "2026-08-01T00:00:00Z",
    };
    expect(pickCurrentSubscription([older, newer], NOW)).toBe(newer);
    expect(pickCurrentSubscription([newer, older], NOW)).toBe(newer);
  });

  it("returns null when nothing entitles", () => {
    expect(pickCurrentSubscription([], NOW)).toBeNull();
    expect(pickCurrentSubscription([TEST_MODE], NOW)).toBeNull();
  });

  it("skips rows whose plan means nothing to us", () => {
    const unknown: BillingRow = { plan: "some_future_sku", status: "active", livemode: true };
    expect(pickCurrentSubscription([unknown], NOW)).toBeNull();
  });
});

describe("tierFromRows", () => {
  it("resolves agent 26 to signature — the tier actually paid for", () => {
    expect(tierFromRows([SIGNATURE, TEST_MODE], NOW)).toBe("signature");
  });

  it("is free when the only active row is a sandbox one", () => {
    expect(tierFromRows([TEST_MODE], NOW)).toBe("free");
  });

  it("is free when there are no rows at all", () => {
    expect(tierFromRows([], NOW)).toBe("free");
  });
});
