/**
 * Shared send configuration for the Weekly Regional Newsletter (Phase 2).
 *
 * Single source of truth for the FROM line, the CAN-SPAM mailing address, and
 * the mailto used in List-Unsubscribe, so the confirmation email and the weekly
 * issue send stay consistent. Pure (no server-only) so it's importable from
 * both route handlers and the template.
 */

/**
 * FROM line for newsletter sends. Defaults to a newsletter@ address on the
 * Resend-verified realtybossai.com domain (same domain lib/email.ts sends from).
 * Override with NEWSLETTER_FROM. NOTE: the domain here MUST stay on
 * realtybossai.com — that's the only DKIM/SPF-verified Resend domain.
 */
export function newsletterFrom(): string {
  const fromEnv = process.env.NEWSLETTER_FROM?.trim();
  if (fromEnv) return fromEnv;
  return "RealtyBoss <newsletter@realtybossai.com>";
}

/**
 * Physical postal address for the CAN-SPAM footer (required on commercial
 * email). Set NEWSLETTER_MAILING_ADDRESS in prod. Falls back to a CLEARLY
 * placeholder string so an unset value is obvious in a test send rather than
 * shipping a blank/spammy footer.
 */
export function newsletterMailingAddress(): string {
  const addr = process.env.NEWSLETTER_MAILING_ADDRESS?.trim();
  if (addr) return addr;
  return "RealtyBoss — [set NEWSLETTER_MAILING_ADDRESS to your physical postal address]";
}

/** mailto target for the List-Unsubscribe header's mailto arm. */
export function newsletterUnsubscribeMailto(): string {
  const addr =
    process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    "unsubscribe@realtybossai.com";
  return addr;
}
