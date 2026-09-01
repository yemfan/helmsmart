import { describe, expect, it } from "vitest";

import {
  FREE_BALANCE_CEILING,
  FREE_MONTHLY_CREDITS,
  decideFreeGrant,
  freeGrantRef,
  grantPeriod,
} from "@/lib/credits/freeGrant";
import { FREE_TIER, WELCOME_CREDITS } from "@/lib/credits/pricing";

/**
 * The free tier's monthly credits.
 *
 * `/plans` advertised "100 credits / month" for two days while nothing granted
 * them — FREE_TIER.monthlyCredits was read by the pricing page and by no other
 * code. These pin the rule that keeps the promise, and the two mistakes that
 * would cost real money: paying a subscriber twice, and letting a dormant
 * account bank credits for ever.
 */

describe("the amount matches what the page sells", () => {
  it("grants exactly what /plans advertises", () => {
    // If these drift, the pricing page is lying again — which is the whole
    // reason this module exists.
    expect(FREE_MONTHLY_CREDITS).toBe(FREE_TIER.monthlyCredits);
    expect(FREE_MONTHLY_CREDITS).toBe(100);
  });
});

describe("decideFreeGrant", () => {
  it("grants to a free account", () => {
    expect(decideFreeGrant({ plan: "free", credits: 0 })).toEqual({
      grant: true,
      amount: 100,
    });
  });

  it("NEVER grants to a paid account", () => {
    // Paid credits arrive with the Stripe invoice. Granting here as well hands
    // every subscriber a second allowance every month, for ever.
    for (const plan of ["pro", "premium", "signature", "team"]) {
      expect(decideFreeGrant({ plan, credits: 0 })).toEqual({
        grant: false,
        reason: "not_free",
      });
    }
  });

  it("treats a missing plan as free rather than skipping the account", () => {
    // A null cache is the state of an account nothing has written yet. Reading
    // it as paid would silently deny credits to exactly the newest users.
    expect(decideFreeGrant({ plan: null, credits: 0 }).grant).toBe(true);
    expect(decideFreeGrant({ plan: undefined, credits: 0 }).grant).toBe(true);
    expect(decideFreeGrant({ plan: "  FREE  ", credits: 0 }).grant).toBe(true);
  });

  it("stops accruing at the ceiling, and resumes below it", () => {
    expect(decideFreeGrant({ plan: "free", credits: FREE_BALANCE_CEILING })).toEqual({
      grant: false,
      reason: "at_ceiling",
    });
    expect(decideFreeGrant({ plan: "free", credits: FREE_BALANCE_CEILING - 1 }).grant).toBe(
      true,
    );
  });

  it("does not touch the welcome credits", () => {
    // A new agent holding their 300 signup credits is well under the ceiling
    // and must still receive month two — the grant ADDS, it never tops up to a
    // target, which would read as a clawback.
    const d = decideFreeGrant({ plan: "free", credits: WELCOME_CREDITS });
    expect(d).toEqual({ grant: true, amount: 100 });
  });

  it("survives a null or malformed balance", () => {
    expect(decideFreeGrant({ plan: "free", credits: null }).grant).toBe(true);
    expect(decideFreeGrant({ plan: "free", credits: undefined }).grant).toBe(true);
    expect(decideFreeGrant({ plan: "free", credits: Number.NaN }).grant).toBe(true);
  });

  it("does not grant on a negative balance without ceiling confusion", () => {
    // Metering can drive a balance negative; that account is furthest from the
    // ceiling and should certainly still be granted.
    expect(decideFreeGrant({ plan: "free", credits: -50 }).grant).toBe(true);
  });
});

describe("idempotency key", () => {
  it("is unique per account per month", () => {
    expect(freeGrantRef("u1", "2026-09")).toBe("free_monthly:u1:2026-09");
    expect(freeGrantRef("u1", "2026-09")).not.toBe(freeGrantRef("u1", "2026-10"));
    expect(freeGrantRef("u1", "2026-09")).not.toBe(freeGrantRef("u2", "2026-09"));
  });

  it("is stable, so a re-run in the same month grants once", () => {
    // credit_ledger.ref carries a unique index and grant_credits short-circuits
    // on an existing one, so this string IS the safety mechanism.
    const a = freeGrantRef("u1", grantPeriod(new Date("2026-09-15T00:00:00Z")));
    const b = freeGrantRef("u1", grantPeriod(new Date("2026-09-28T23:59:59Z")));
    expect(a).toBe(b);
  });
});

describe("grantPeriod", () => {
  it("is the UTC year and month, zero padded", () => {
    expect(grantPeriod(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
    expect(grantPeriod(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    expect(grantPeriod(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01");
  });

  it("uses UTC, not local time", () => {
    // The cron fires at 09:00 UTC on the 1st. Reading local time would put a
    // US-evening run into the previous month and re-grant one already given.
    expect(grantPeriod(new Date("2026-10-01T00:30:00Z"))).toBe("2026-10");
  });
});
