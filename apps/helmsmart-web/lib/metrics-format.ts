/**
 * Pure metric-formatting helpers shared by the business-insights generator.
 * Kept in its own module (no Anthropic / Supabase imports) so it can be
 * unit-tested without instantiating heavy clients.
 */
import { intlLocale } from "@leadsmart/i18n";

/**
 * Format a week-over-week change as a signed percentage string.
 *
 * `locale` is required, never defaulted: a helper that quietly falls back to
 * `"en-US"` is the bug the i18n guard exists to catch. Pass the reader's
 * locale — `await getServerLocale()` in a request, `await userUiLocale(id)`
 * in a cron.
 *
 * Edge cases the digest prompt relies on:
 *   - prev === 0 && now > 0  → "new"   (can't divide; it's brand-new activity)
 *   - prev === 0 && now <= 0 → "flat"  (nothing then, nothing now)
 *   - otherwise              → "+N%" / "-N%" (rounded to whole percent)
 *
 * "new" and "flat" stay English on purpose. They are read by the model that
 * writes the digest, not by the owner: the prose Claude produces from them is
 * what the owner reads, and `languageDirectiveForJson` puts that in their
 * language.
 */
export function pctChange(now: number, prev: number, locale: string | null | undefined): string {
  if (prev === 0) return now > 0 ? "new" : "flat";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format((now - prev) / prev);
}
