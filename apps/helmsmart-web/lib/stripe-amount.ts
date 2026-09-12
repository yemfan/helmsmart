/**
 * An invoice total → the `unit_amount` Stripe expects, for the org's currency.
 *
 * Stripe takes amounts in the currency's MINOR unit, and "multiply by 100" is
 * only right for two-decimal currencies. The checkout route used to do exactly
 * that with `currency: "usd"` hardcoded, so the currency was never in question
 * — once it is the org's `organizations.currency`, a ¥5,000 invoice sent as
 * `500000` would charge ¥500,000.
 *
 * Rules and lists are Stripe's, from https://docs.stripe.com/currencies
 * ("Zero-decimal currencies", "Three-decimal currencies", "Special cases",
 * "Minimum charge amount by currency"). They are Stripe's API conventions, not
 * ISO 4217's — `Intl`'s fraction digits disagree for ISK, UGX and IDR — which
 * is why this is a table and not a call to `Intl.NumberFormat`.
 *
 * Pure: no Stripe client, no Supabase. The route decides what to do with a
 * total that is below the minimum; this only knows the numbers.
 */

/** The charge and the amount are the same number: 500 JPY is `500`. */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/**
 * Zero-decimal in practice, but for backward compatibility Stripe still takes
 * them as two-decimal values whose decimals are always `00`: 5 ISK is `500`,
 * and a fraction of a króna cannot be charged.
 */
const WHOLE_UNITS_AS_TWO_DECIMAL = new Set(["ISK", "UGX"]);

/** Amounts in thousandths, and the last digit must be 0: 1.234 KWD is `1230`. */
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

/**
 * Stripe's minimum charge, in MAJOR units, for the currencies it publishes one
 * for.
 *
 * Strictly the minimum follows the account's settlement currency, which this
 * app cannot see. An org invoices in the currency it is paid in, so the
 * charge currency's own row is the right proxy; for a currency with no row,
 * Stripe itself is the check, and its refusal comes back as a failed session.
 */
const MINIMUM: Record<string, number> = {
  USD: 0.5, AED: 2, ARS: 0.5, AUD: 0.5, BRL: 0.5, CAD: 0.5, CHF: 0.5,
  COP: 0.5, CZK: 15, DKK: 2.5, EUR: 0.5, GBP: 0.3, HKD: 4, HUF: 175,
  IDR: 0.5, ILS: 0.5, INR: 0.5, JPY: 50, KRW: 50, MXN: 10, MYR: 2,
  NOK: 3, NZD: 0.5, PHP: 0.5, PLN: 2, RON: 2, RUB: 0.5, SEK: 3,
  SGD: 0.5, THB: 10, ZAR: 0.5,
};

const code = (currency: string) => currency.trim().toUpperCase();

/** `total` in major units (what `invoices.total` stores) → Stripe's integer amount. */
export function toStripeAmount(total: number, currency: string): number {
  const c = code(currency);
  if (ZERO_DECIMAL.has(c)) return Math.round(total);
  if (WHOLE_UNITS_AS_TWO_DECIMAL.has(c)) return Math.round(total) * 100;
  if (THREE_DECIMAL.has(c)) return Math.round(total * 100) * 10;
  return Math.round(total * 100);
}

/** Stripe's published minimum in major units, or null when it publishes none. */
export function stripeMinimum(currency: string): number | null {
  return MINIMUM[code(currency)] ?? null;
}
