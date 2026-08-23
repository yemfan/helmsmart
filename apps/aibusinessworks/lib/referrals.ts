import "server-only";
import { SITE } from "@/lib/site";

/** Cookie that carries an attribution claim from first click to signup. */
export const REFERRAL_COOKIE = "abw_ref";
/** How long a referral click stays attributable. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export interface ReferralClaim {
  code: string;
  /** ISO timestamp of the click that set it. */
  at: string;
  landing?: string;
  utm?: Record<string, string>;
}

export function parseReferralCookie(raw: string | undefined): ReferralClaim | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ReferralClaim>;
    if (typeof parsed.code !== "string" || !parsed.code) return null;
    return {
      code: parsed.code.toUpperCase(),
      at: typeof parsed.at === "string" ? parsed.at : new Date().toISOString(),
      landing: typeof parsed.landing === "string" ? parsed.landing : undefined,
      utm: typeof parsed.utm === "object" && parsed.utm ? (parsed.utm as Record<string, string>) : undefined,
    };
  } catch {
    return null;
  }
}

export function serialiseReferralCookie(claim: ReferralClaim): string {
  return encodeURIComponent(JSON.stringify(claim));
}

/** The partner's shareable referral URL. */
export function referralUrl(code: string, path = "/"): string {
  const base = SITE.url.replace(/\/$/, "");
  return `${base}/r/${encodeURIComponent(code)}${path === "/" ? "" : `?to=${encodeURIComponent(path)}`}`;
}

/**
 * QR code image URL for a referral link.
 *
 * Rendered by an external image service so no binary generation happens on the
 * request path. Swap the base URL here if the program moves to a self-hosted
 * generator; nothing else references it.
 */
export function qrCodeUrl(target: string, size = 512): string {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    data: target,
    margin: "8",
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

/** Extract UTM parameters worth keeping on the attribution record. */
export function collectUtm(searchParams: URLSearchParams): Record<string, string> {
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const value = searchParams.get(key);
    if (value) utm[key] = value.slice(0, 120);
  }
  return utm;
}
