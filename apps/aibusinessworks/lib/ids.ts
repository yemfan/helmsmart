import { randomBytes, createHash } from "node:crypto";

/** Characters chosen to survive being read aloud and typed: no 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A short, human-shareable partner code, e.g. "ABW-7K4M2X". */
export function generatePartnerCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `ABW-${code}`;
}

/** A referral or discount code derived from a partner code, e.g. "SARAH7K4M". */
export function generateReferralCode(seed: string): string {
  const base = slugify(seed).replace(/-/g, "").slice(0, 8).toUpperCase();
  const bytes = randomBytes(3);
  let suffix = "";
  for (const byte of bytes) suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${base || "PARTNER"}${suffix}`;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Deterministic slug with a short disambiguating suffix. */
export function partnerSlug(firstName: string, lastName: string): string {
  const base = slugify(`${firstName} ${lastName}`) || "partner";
  const suffix = randomBytes(2).toString("hex");
  return `${base}-${suffix}`;
}

/**
 * One-way hash of an IP address for abuse detection.
 *
 * The raw address is never stored. The salt keeps hashes from being reversible
 * with a rainbow table of the IPv4 space.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 16) ?? "abw-static-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
