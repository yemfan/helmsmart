/**
 * Opt-out rules for marketing email, shared by every app that writes to the
 * same `contacts` table.
 *
 * WHY THIS IS SHARED AND NOT COPIED. CloseBoss and PropertyTools AI send to the
 * SAME contacts in the SAME database from the SAME verified domain. A contact
 * who unsubscribes from one is unsubscribed, full stop — so the suppression
 * check and the opt-out plumbing cannot live in one app and be reimplemented,
 * or forgotten, in the other. That is exactly how PropertyTools AI came to be
 * sending automated marketing with no unsubscribe link, no List-Unsubscribe
 * header and no opt-out check months after CloseBoss had all three.
 *
 * Pure and env-free on purpose: each app passes its own base URL, mailto and
 * postal address, because the unsubscribe link must live on the domain the
 * recipient was actually written to. A homeowner who got a PropertyTools email
 * should not be sent to closebossai.com to opt out.
 */

/** The columns any sender must read before it may send. */
export type EmailSuppressionRow = {
  email?: string | null;
  /** The CONTACT asked to stop. Set by the unsubscribe link. */
  contact_opt_out_email?: boolean | null;
  /** The AGENT marked them do-not-contact. A different actor, equally binding. */
  do_not_contact_email?: boolean | null;
  email_unsubscribe_token?: string | null;
};

export type SuppressionReason = "no_email" | "contact_opted_out" | "agent_do_not_contact";

/**
 * May we send marketing email to this contact?
 *
 * Returns the REASON rather than a bare boolean: "we didn't email them" and
 * "they told us to stop" are different facts, and whoever looks at a sequence
 * that went quiet needs to know which.
 */
export function emailSuppression(
  row: EmailSuppressionRow | null | undefined,
): SuppressionReason | null {
  if (!row) return "no_email";
  if (!String(row.email ?? "").trim()) return "no_email";
  if (row.contact_opt_out_email === true) return "contact_opted_out";
  if (row.do_not_contact_email === true) return "agent_do_not_contact";
  return null;
}

export function isEmailSuppressed(row: EmailSuppressionRow | null | undefined): boolean {
  return emailSuppression(row) !== null;
}

/**
 * The one-click endpoint, which is also what the footer link points at.
 *
 * Null without a token: a link that cannot identify anyone still LOOKS like a
 * working opt-out, which is worse than offering none.
 */
export function buildUnsubscribeUrl(
  baseUrl: string,
  token: string | null | undefined,
): string | null {
  const t = String(token ?? "").trim();
  if (!t) return null;
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(t)}`;
}

/**
 * `List-Unsubscribe` + `List-Unsubscribe-Post` — the RFC 8058 pair that gives
 * Gmail and Outlook their native one-click Unsubscribe button.
 *
 * Empty without a URL: advertising one-click and then not honouring it is worse
 * for sender reputation than not advertising it, because the provider measures
 * whether the button works.
 *
 * @param mailto must be a mailbox that actually RECEIVES. A bouncing opt-out
 *   address is worse than no mailto arm — the recipient believes they have
 *   unsubscribed, hears nothing, and reports spam when the next one arrives.
 */
export function buildUnsubscribeHeaders(args: {
  url: string | null;
  mailto: string;
}): Record<string, string> {
  if (!args.url) return {};
  return {
    "List-Unsubscribe": `<${args.url}>, <mailto:${args.mailto}>`,
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
 * the unsubscribe would have, and costs it to every other app sending from the
 * same domain.
 *
 * Bodies come back unchanged when there is no URL, rather than rendering a dead
 * "Unsubscribe" link.
 */
export function appendUnsubscribeFooter(args: {
  html: string;
  text: string;
  url: string | null;
  /** Who the mail is from, in the reader's terms. */
  senderName?: string | null;
  /** The physical postal address CAN-SPAM requires. */
  mailingAddress: string;
}): { html: string; text: string } {
  if (!args.url) return { html: args.html, text: args.text };

  const from = String(args.senderName ?? "").trim();
  const why = from
    ? `You received this because you enquired with ${from}.`
    : "You received this because you enquired with us.";

  const html = `${args.html}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;line-height:1.5;color:#64748b;">
  <p style="margin:0 0 4px;">${escapeHtml(why)}</p>
  <p style="margin:0 0 4px;">${escapeHtml(args.mailingAddress)}</p>
  <p style="margin:0;"><a href="${escapeHtml(args.url)}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a></p>
</div>`;

  const text = `${args.text}

—
${why}
${args.mailingAddress}
Unsubscribe: ${args.url}`;

  return { html, text };
}
