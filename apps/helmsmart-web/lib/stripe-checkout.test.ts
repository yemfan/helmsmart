/**
 * The invoice checkout route charges in the org's currency.
 *
 * It used to send `currency: "usd"` and `total * 100` whatever the invoice
 * said, while /pay/[id] showed the same total in `organizations.currency` — so
 * a CAD invoice for 125.50 was charged US$125.50. These tests drive the route
 * with Stripe and Supabase doubled and read back what it asked Stripe for:
 * the currency, the minor-unit amount (none for JPY/KRW), the per-currency
 * minimum, and errors in the visitor's language rather than English.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { translatorFor } from "@/lib/i18n/translator";
import { money } from "@/lib/books-format";
import { stripeMinimum, toStripeAmount } from "@/lib/stripe-amount";

const INVOICE = "44444444-4444-4444-8444-444444444444";

let locale: "en" | "zh-Hans" | "es" = "en";
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor(locale, ns),
  getServerLocale: async () => locale,
}));

// ─── A Supabase double ──────────────────────────────────────────────────────

let invoice: Record<string, unknown> | null;
const selects: string[] = [];
const updates: Array<{ patch: unknown; filters: Array<[string, unknown]> }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: (table: string) => {
      if (table !== "invoices") throw new Error(`unexpected table ${table}`);
      return {
        select: (cols: string) => {
          selects.push(cols);
          const q = {
            eq: () => q,
            single: async () =>
              invoice ? { data: invoice, error: null } : { data: null, error: { message: "no rows" } },
          };
          return q;
        },
        update: (patch: unknown) => {
          const u = { patch, filters: [] as Array<[string, unknown]> };
          updates.push(u);
          return {
            eq: async (c: string, v: unknown) => {
              u.filters.push([c, v]);
              return { data: null, error: null };
            },
          };
        },
      };
    },
  }),
}));

// ─── A Stripe double ────────────────────────────────────────────────────────

const create = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: (params: unknown) => create(params) } };
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function invoiceRow(over: { total?: number | string; status?: string; currency?: string | null } = {}) {
  return {
    id: INVOICE,
    invoice_number: "INV-0042",
    status: over.status ?? "sent",
    total: over.total ?? 125.5,
    stripe_session_id: null,
    clients: { first_name: "Ana", last_name: "Ruiz", email: "ana@example.com" },
    organizations: { name: "Maple Plumbing", currency: over.currency === undefined ? "CAD" : over.currency },
  };
}

async function checkout(query = `?invoice=${INVOICE}`) {
  const { GET } = await import("@/app/api/stripe/checkout/route");
  return GET(new NextRequest(`http://localhost/api/stripe/checkout${query}`));
}

/** What the route asked Stripe for — the one line item's price. */
function priceSent() {
  expect(create).toHaveBeenCalledTimes(1);
  const params = create.mock.calls[0][0] as {
    line_items: Array<{ price_data: { currency: string; unit_amount: number } }>;
  };
  return params.line_items[0].price_data;
}

const tr = (l: typeof locale) => translatorFor(l, "public");

beforeEach(() => {
  locale = "en";
  invoice = invoiceRow();
  selects.length = 0;
  updates.length = 0;
  create.mockReset();
  create.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1" });
  process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

// ─── The amount helper ──────────────────────────────────────────────────────

describe("toStripeAmount", () => {
  it("uses cents for two-decimal currencies, whatever the case of the code", () => {
    expect(toStripeAmount(125.5, "CAD")).toBe(12550);
    expect(toStripeAmount(19.99, "usd")).toBe(1999);
    expect(toStripeAmount(0.3, "GBP")).toBe(30);
  });

  it("sends zero-decimal currencies as the number itself", () => {
    expect(toStripeAmount(5000, "JPY")).toBe(5000);
    expect(toStripeAmount(12000.4, "krw")).toBe(12000);
  });

  it("sends ISK and UGX as whole units with two zero decimals", () => {
    expect(toStripeAmount(5, "ISK")).toBe(500);
    expect(toStripeAmount(4999.6, "UGX")).toBe(500000);
  });

  it("sends three-decimal currencies in thousandths ending in 0", () => {
    expect(toStripeAmount(1.234, "KWD")).toBe(1230);
  });
});

describe("stripeMinimum", () => {
  it("knows Stripe's per-currency minimum, and admits when it has none", () => {
    expect(stripeMinimum("USD")).toBe(0.5);
    expect(stripeMinimum("gbp")).toBe(0.3);
    expect(stripeMinimum("JPY")).toBe(50);
    expect(stripeMinimum("HUF")).toBe(175);
    expect(stripeMinimum("XOF")).toBeNull();
  });
});

// ─── The route ──────────────────────────────────────────────────────────────

describe("GET /api/stripe/checkout", () => {
  it("charges a CAD invoice in CAD, not the same number in USD", async () => {
    const res = await checkout();

    expect(priceSent()).toEqual(expect.objectContaining({ currency: "cad", unit_amount: 12550 }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.test/cs_test_1");
    expect(updates).toEqual([{ patch: { stripe_session_id: "cs_test_1" }, filters: [["id", INVOICE]] }]);
  });

  it("reads the currency alongside the org name", async () => {
    await checkout();
    expect(selects[0]).toMatch(/organizations\s*\(\s*name,\s*currency\s*\)/);
  });

  it.each([
    ["EUR", 80, "eur", 8000],
    ["GBP", 0.4, "gbp", 40],
    ["JPY", 5000, "jpy", 5000],
    ["KRW", 12000, "krw", 12000],
  ])("sends a %s total of %s as %s %s", async (currency, total, sent, amount) => {
    invoice = invoiceRow({ currency, total });
    await checkout();
    expect(priceSent()).toEqual(expect.objectContaining({ currency: sent, unit_amount: amount }));
  });

  it("falls back to USD when the org has no currency", async () => {
    invoice = invoiceRow({ currency: null, total: 20 });
    await checkout();
    expect(priceSent()).toEqual(expect.objectContaining({ currency: "usd", unit_amount: 2000 }));
  });

  it("applies the currency's own minimum, not a flat $0.50", async () => {
    // ¥40 is under Stripe's ¥50 — and under the old rule it read as 4000 "cents".
    invoice = invoiceRow({ currency: "JPY", total: 40 });
    let res = await checkout();
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toBe(
      tr("en")("pay.checkout.belowMinimum", { amount: money(40, "en", "JPY"), minimum: money(50, "en", "JPY") }),
    );
    expect(error).toContain("¥50");
    expect(create).not.toHaveBeenCalled();

    // £0.40 clears GBP's £0.30, where the old rule refused anything under 50.
    invoice = invoiceRow({ currency: "GBP", total: 0.4 });
    res = await checkout();
    expect(res.status).toBe(307);

    create.mockClear();
    invoice = invoiceRow({ currency: "USD", total: 0.4 });
    res = await checkout();
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves the minimum to Stripe for a currency it publishes none for", async () => {
    invoice = invoiceRow({ currency: "XOF", total: 300 });
    await checkout();
    expect(priceSent()).toEqual(expect.objectContaining({ currency: "xof", unit_amount: 300 }));
  });

  it("refuses a zero or non-numeric total without calling Stripe", async () => {
    for (const total of [0, "not a number"]) {
      invoice = invoiceRow({ total });
      const res = await checkout();
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(tr("en")("pay.checkout.nothingDue"));
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("answers in the visitor's language, not English", async () => {
    locale = "es";
    let res = await checkout("");
    expect(res.status).toBe(400);
    const es = (await res.json()).error;
    expect(es).toBe(tr("es")("pay.checkout.missingInvoice"));
    expect(es).not.toBe(tr("en")("pay.checkout.missingInvoice"));

    locale = "zh-Hans";
    invoice = null;
    res = await checkout();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe(tr("zh-Hans")("pay.checkout.notFound"));

    locale = "es";
    invoice = invoiceRow({ status: "void" });
    res = await checkout();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(tr("es")("pay.void"));
  });

  it("says payment is unavailable, in the visitor's language, when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    locale = "zh-Hans";
    const res = await checkout();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(tr("zh-Hans")("pay.checkout.notConfigured"));
  });

  it("keeps Stripe's own error out of the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("No such currency: xyz"));
    locale = "es";
    const res = await checkout();
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBe(tr("es")("pay.checkout.failed"));
    expect(error).not.toContain("No such currency");
    expect(updates).toEqual([]);
  });

  it("still treats the invoice id as the capability: a paid invoice goes back to /pay", async () => {
    invoice = invoiceRow({ status: "paid" });
    const res = await checkout();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://app.test/pay/${INVOICE}`);
    expect(create).not.toHaveBeenCalled();
  });
});
