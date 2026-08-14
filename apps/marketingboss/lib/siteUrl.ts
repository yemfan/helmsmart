/**
 * Canonical public origin for marketingbossai.com.
 *
 * Deliberately defaults to the real domain rather than NEXT_PUBLIC_APP_URL:
 * that var is `http://localhost:3007` in .env.example and NEXT_PUBLIC_* values
 * are inlined at BUILD time, so an unset/stale value in Vercel would bake
 * localhost URLs into the public sitemap and robots.txt. An override is only
 * honoured when it's a real https origin.
 */
const CANONICAL = "https://www.marketingbossai.com";

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw && /^https:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return CANONICAL;
}
