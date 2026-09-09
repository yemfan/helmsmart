/**
 * Locale- and currency-aware formatting for the Books surface.
 *
 * Every Books screen used to hardcode
 * `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`,
 * which is two bugs in one call: a Chinese-speaking owner got American
 * grouping and month names, and an organization whose `organizations.currency`
 * is not USD had its own money relabelled as dollars.
 *
 * PURE ON PURPOSE. No Supabase, no `next/headers`, no `server-only` — a
 * client component (`expense-form`, `transaction-review-row`, the invoice
 * builder) imports the same formatter the server pages use, passing
 * `i18n.language` where the server passes `await getServerLocale()`.
 * `orgCurrency()` in `./books-currency` is the server half that reads the
 * column.
 *
 * There is no default locale argument anywhere here: a helper that quietly
 * falls back to `"en-US"` is exactly the bug this replaces.
 */
import { intlLocale } from "@leadsmart/i18n";

/** What `organizations.currency` defaults to in the schema. */
export const DEFAULT_CURRENCY = "USD";

/**
 * A reusable money formatter. Build it once per render and call it per row —
 * `Intl.NumberFormat` construction is the expensive half.
 */
export function moneyFormatter(
  locale: string | null | undefined,
  currency: string | null | undefined,
  options?: Intl.NumberFormatOptions,
): (value: number) => string {
  const nf = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: currency || DEFAULT_CURRENCY,
    ...options,
  });
  return (value: number) => nf.format(value);
}

/** One-off money formatting where a per-render formatter would be noise. */
export function money(
  value: number,
  locale: string | null | undefined,
  currency: string | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  return moneyFormatter(locale, currency, options)(value);
}

/** Plain number formatting (counts, hours, percentages) in the reader's locale. */
export function numberFormatter(
  locale: string | null | undefined,
  options?: Intl.NumberFormatOptions,
): (value: number) => string {
  const nf = new Intl.NumberFormat(intlLocale(locale), options);
  return (value: number) => nf.format(value);
}

/**
 * A date formatter for the reader's locale.
 *
 * Books stores dates as bare `YYYY-MM-DD`, and `new Date("2026-01-31")` is
 * parsed as UTC midnight — which renders as the 30th anywhere behind UTC. Use
 * `dateOnly()` to build the Date, never the bare string.
 */
export function dateFormatter(
  locale: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): (value: Date | string) => string {
  const df = new Intl.DateTimeFormat(intlLocale(locale), options);
  return (value: Date | string) =>
    df.format(typeof value === "string" ? dateOnly(value) : value);
}

/** `YYYY-MM-DD` → local midnight, so the rendered day is the stored day. */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}
