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
 * Resend-verified closebossai.com domain (same domain lib/email.ts sends from).
 * Override with NEWSLETTER_FROM. NOTE: the domain here MUST stay on
 * closebossai.com — that's the only DKIM/SPF-verified Resend domain.
 */
export function newsletterFrom(): string {
  const fromEnv = process.env.NEWSLETTER_FROM?.trim();
  if (fromEnv) return fromEnv;
  return "CloseBoss <newsletter@closebossai.com>";
}

/**
 * FROM line for an AGENT-BRANDED send (Phase 3). Display-name only change —
 * the mailbox stays on the Resend-verified closebossai.com domain (the only
 * DKIM/SPF-verified sender), so deliverability is unchanged. Client replies are
 * routed to the agent via a separate reply_to (set by the caller), not the from
 * address. The agent's name is sanitized to keep the RFC 5322 display name
 * legal (strip characters that would need quoting/escaping).
 *
 * Example: `Jane Smith via CloseBoss <newsletter@closebossai.com>`.
 */
export function agentNewsletterFrom(agentName: string | null | undefined): string {
  const base = newsletterFrom();
  const name = typeof agentName === "string" ? agentName.trim() : "";
  if (!name) return base;

  // Pull the mailbox out of the base FROM ("<addr>" or a bare address).
  const m = base.match(/<([^>]+)>/);
  const mailbox = m ? m[1] : base.trim();

  // Sanitize the display name: collapse whitespace, drop quotes/angle brackets
  // and other specials so the header stays valid without quoting.
  const safeName = name
    .replace(/[<>"@,;:\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!safeName) return base;

  return `${safeName} via CloseBoss <${mailbox}>`;
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
  return "CloseBoss — [set NEWSLETTER_MAILING_ADDRESS to your physical postal address]";
}

/**
 * mailto target for the List-Unsubscribe header's mailto arm.
 *
 * The default MUST be a mailbox that actually receives. This defaulted to
 * `unsubscribe@closebossai.com`, which does not exist — and since neither env
 * var is set, that dead address has been going out on every newsletter. Some
 * clients prefer the mailto arm over the URL, so those unsubscribes bounced
 * instead of being honoured, and a bouncing opt-out address costs sender
 * reputation on the one verified domain every app here sends from.
 */
export function newsletterUnsubscribeMailto(): string {
  const addr =
    process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    "contact@closebossai.com";
  return addr;
}
