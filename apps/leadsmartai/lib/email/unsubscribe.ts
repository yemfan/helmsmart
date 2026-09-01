/**
 * Opt-out plumbing for agent outreach email.
 *
 * The drip rail sends automated marketing to contacts with an open-tracking
 * pixel in the body. It had no unsubscribe link, no List-Unsubscribe header and
 * no opt-out check — while the SMS branch of the same loop refuses to send
 * without `sms_opt_in`. This is the email half of that check.
 *
 * TWO SUPPRESSION FLAGS, BOTH BINDING. `contacts` carries
 * `contact_opt_out_email` (the contact asked us to stop) and
 * `do_not_contact_email` (the agent marked them do-not-contact). Different
 * actors, both decisive, so `isEmailSuppressed` reads both. Honouring only the
 * one nearest to hand is how someone who unsubscribed keeps getting mail.
 *
 * Pure — no I/O — so every rule here is testable without a database or a mail
 * server.
 */

/** Columns any sender must select to decide whether it may send. */
export type EmailSuppressionRow = {
  email?: string | null;
  contact_opt_out_email?: boolean | null;
  do_not_contact_email?: boolean | null;
  email_unsubscribe_token?: string | null;
};

/** Why a send was suppressed, for logs and for the agent's activity view. */
export type SuppressionReason = "no_email" | "contact_opted_out" | "agent_do_not_contact";

/**
 * May we send marketing email to this contact?
 *
 * Returns the REASON rather than a bare boolean: "we didn't email them" and
 * "they told us to stop" are different facts, and an agent looking at a
 * sequence that went quiet needs to know which.
 */
export function emailSuppression(row: EmailSuppressionRow | null | undefined): SuppressionReason | null {
  if (!row) return "no_email";
  if (!String(row.email ?? "").trim()) return "no_email";
  if (row.contact_opt_out_email === true) return "contact_opted_out";
  if (row.do_not_contact_email === true) return "agent_do_not_contact";
  return null;
}

/** Convenience for call sites that only branch on it. */
export function isEmailSuppressed(row: EmailSuppressionRow | null | undefined): boolean {
  return emailSuppression(row) !== null;
}

function siteOrigin(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.closebossai.com";
  return base.replace(/\/+$/, "");
}

/**
 * The one-click endpoint, which is also what the footer link points at.
 *
 * Returns null when the contact has no token — a link that cannot identify
 * anyone is worse than no link, because it looks like a working opt-out and
 * silently is not.
 */
export function unsubscribeUrl(token: string | null | undefined): string | null {
  const t = String(token ?? "").trim();
  if (!t) return null;
  return `${siteOrigin()}/api/email/unsubscribe?token=${encodeURIComponent(t)}`;
}

/**
 * The mailto arm of List-Unsubscribe. Some mail clients prefer it, and RFC 8058
 * wants a second route that does not depend on our web tier being up.
 */
export function unsubscribeMailto(): string {
  return (
    process.env.OUTREACH_UNSUBSCRIBE_MAILTO?.trim() ||
    process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    "unsubscribe@closebossai.com"
  );
}

/**
 * The physical postal address CAN-SPAM requires in the footer.
 *
 * Falls back to an obviously-unset placeholder rather than an empty string, so
 * a missing value shows up in the first test send instead of shipping a blank
 * (and distinctly spammy-looking) footer to real people.
 */
export function mailingAddress(): string {
  return (
    process.env.OUTREACH_MAILING_ADDRESS?.trim() ||
    process.env.NEWSLETTER_MAILING_ADDRESS?.trim() ||
    "CloseBoss — [set OUTREACH_MAILING_ADDRESS to your physical postal address]"
  );
}

/**
 * `List-Unsubscribe` + `List-Unsubscribe-Post`, the RFC 8058 pair that gives
 * Gmail and Outlook their native one-click Unsubscribe button.
 *
 * Empty when there is no token: advertising one-click and then not honouring it
 * is worse for sender reputation than not advertising it, because the provider
 * measures whether the button works.
 */
export function unsubscribeHeaders(token: string | null | undefined): Record<string, string> {
  const url = unsubscribeUrl(token);
  if (!url) return {};
  return {
    "List-Unsubscribe": `<${url}>, <mailto:${unsubscribeMailto()}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The visible footer: who this is from, why they got it, and how to stop.
 *
 * The header alone is not enough. It is invisible to the reader, and a person
 * who cannot find a way out clicks "spam" instead — which costs far more than
 * the unsubscribe would have, and costs it to every other app sending from this
 * domain.
 *
 * Returns the bodies unchanged when there is no token, rather than rendering a
 * dead "Unsubscribe" link.
 */
export function withUnsubscribeFooter(args: {
  html: string;
  text: string;
  token: string | null | undefined;
  /** Who the mail is from, in the reader's terms. */
  senderName?: string | null;
}): { html: string; text: string } {
  const url = unsubscribeUrl(args.token);
  if (!url) return { html: args.html, text: args.text };

  const from = String(args.senderName ?? "").trim();
  const why = from
    ? `You received this because you enquired with ${from}.`
    : "You received this because you enquired with us.";
  const address = mailingAddress();

  const html = `${args.html}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;line-height:1.5;color:#64748b;">
  <p style="margin:0 0 4px;">${escapeHtml(why)}</p>
  <p style="margin:0 0 4px;">${escapeHtml(address)}</p>
  <p style="margin:0;"><a href="${escapeHtml(url)}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a></p>
</div>`;

  const text = `${args.text}

—
${why}
${address}
Unsubscribe: ${url}`;

  return { html, text };
}
