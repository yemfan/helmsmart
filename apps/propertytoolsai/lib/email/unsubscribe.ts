/**
 * PropertyTools AI's opt-out wiring.
 *
 * The rules live in `@leadsmart/shared` because `contacts` is shared with
 * CloseBoss: both apps email the same people from the same verified domain, and
 * a contact who unsubscribes from one is unsubscribed, full stop. Duplicating
 * the check is how this app came to be sending automated marketing with no
 * unsubscribe link, no List-Unsubscribe header and no opt-out check at all,
 * months after CloseBoss had all three.
 *
 * What is app-specific is only the addressing: the link must live on the domain
 * the recipient was actually written from. Someone who got a PropertyTools
 * email should not be sent to an agent product they have never heard of in
 * order to stop hearing from us.
 */

import {
  appendUnsubscribeFooter,
  buildUnsubscribeHeaders,
  buildUnsubscribeUrl,
} from "@leadsmart/shared";

export { emailSuppression, isEmailSuppressed } from "@leadsmart/shared";
export type { EmailSuppressionRow, SuppressionReason } from "@leadsmart/shared";

function siteOrigin(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.propertytoolsai.com";
  return base.replace(/\/+$/, "");
}

/**
 * The mailto arm of List-Unsubscribe.
 *
 * MUST be a mailbox that actually receives. `contact@propertytoolsai.com` does
 * — it is the domain's catch-all target. An address that bounces is worse than
 * no mailto at all: the recipient believes they unsubscribed, hears nothing,
 * and reports spam when the next message arrives.
 */
function unsubscribeMailto(): string {
  return (
    process.env.OUTREACH_UNSUBSCRIBE_MAILTO?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    "contact@propertytoolsai.com"
  );
}

/**
 * The physical postal address CAN-SPAM requires in the footer. Falls back to an
 * obviously-unset placeholder so a missing value shows up in a test send rather
 * than going out blank to real people.
 */
function mailingAddress(): string {
  return (
    process.env.OUTREACH_MAILING_ADDRESS?.trim() ||
    process.env.NEWSLETTER_MAILING_ADDRESS?.trim() ||
    "PropertyTools AI — [set OUTREACH_MAILING_ADDRESS to your physical postal address]"
  );
}

export function unsubscribeUrl(token: string | null | undefined): string | null {
  return buildUnsubscribeUrl(siteOrigin(), token);
}

export function unsubscribeHeaders(token: string | null | undefined): Record<string, string> {
  return buildUnsubscribeHeaders({
    url: unsubscribeUrl(token),
    mailto: unsubscribeMailto(),
  });
}

export function withUnsubscribeFooter(args: {
  html: string;
  text: string;
  token: string | null | undefined;
  senderName?: string | null;
}): { html: string; text: string } {
  return appendUnsubscribeFooter({
    html: args.html,
    text: args.text,
    url: unsubscribeUrl(args.token),
    senderName: args.senderName ?? null,
    mailingAddress: mailingAddress(),
  });
}
