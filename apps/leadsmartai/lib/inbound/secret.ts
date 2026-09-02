import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison for the inbound-parse shared secret.
 *
 * SendGrid Inbound Parse does not sign its requests, so a secret in the URL is
 * the only handle we get — which makes it worth comparing carefully. `!==` on
 * strings returns as soon as two bytes differ, and that timing difference is
 * measurable over enough requests against an endpoint anyone on the internet
 * can POST to.
 *
 * Both sides are hashed first so the buffers are always 32 bytes. That is not
 * decoration: `timingSafeEqual` THROWS on a length mismatch, and branching on
 * length before comparing would leak how long the secret is.
 *
 * This is a mitigation, not a fix. The real weakness is that the secret travels
 * in a query string, where it lands in access logs, proxies and referrers. It
 * is the mechanism SendGrid gives us; the Resend route's signed body was
 * stronger and was set aside deliberately — see this directory's README.
 */
export function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const a = createHash("sha256").update(String(provided ?? ""), "utf8").digest();
  const b = createHash("sha256").update(String(expected ?? ""), "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Shortest secret worth calling one, for a value that rides in a URL. */
export const MIN_SECRET_LEN = 24;

/**
 * True when the configured secret is too short to be worth much.
 *
 * Reported rather than enforced: refusing to run would take inbound mail down
 * over a weak-but-working secret, which is a worse outcome than a warning in
 * the logs.
 */
export function isWeakSecret(secret: string): boolean {
  return secret.length < MIN_SECRET_LEN;
}
