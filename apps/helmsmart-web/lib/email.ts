import "server-only";

import { Resend } from "resend";

/**
 * Built on first send, never at module load: the Resend constructor throws on a
 * missing key, and this module is imported by routes whose page data Next
 * collects at build time (where RESEND_API_KEY isn't present).
 */
let client: Resend | null = null;

function resendClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/**
 * Sender brand name shown in the "From" line. Set EMAIL_FROM_NAME to override
 * without touching code.
 */
export const EMAIL_BRAND = process.env.EMAIL_FROM_NAME?.trim() || "HelmSmart";

/**
 * The only Resend-verified sending domain on this account is realtybossai.com,
 * so it is the default sender for every app in the monorepo. helmsmart.ai and
 * helmsmart.app are NOT verified — sending from them returns a 403 and the mail
 * never leaves. If helmsmart.ai is verified in Resend later, point
 * RESEND_FROM_EMAIL at it; no code change needed.
 */
const DEFAULT_FROM_ADDRESS = "noreply@realtybossai.com";

/**
 * Pull the bare address out of a sender that may be either "a@b.com" or
 * "Name <a@b.com>", so callers can recompose it with their own display name.
 */
function bareAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match?.[1] ?? value).trim();
}

/**
 * Resolved sending address. Note the `||` (not `??`): RESEND_FROM_EMAIL is set
 * to an empty string in some environments, and `??` would happily use "" as the
 * sender and fail every send.
 */
export const FROM_ADDRESS = bareAddress(
  process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_ADDRESS
);

/**
 * Compose a From header on the verified domain. `displayName` lets a caller
 * brand the email (e.g. the org name) while still sending from an address the
 * domain actually authorizes.
 */
export function senderFrom(displayName?: string): string {
  const name = displayName?.trim() || EMAIL_BRAND;
  return `${name} <${FROM_ADDRESS}>`;
}

export type EmailAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

type SendEmailParams = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  /** Display name for the From line; the address is always FROM_ADDRESS. */
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
};

/**
 * Send one email through Resend.
 *
 * Throws on failure. This is the whole point of the helper: the Resend SDK
 * resolves with `{ data: null, error }` instead of throwing, so a bare
 * `await resend.emails.send(...)` silently swallows rejected sends and lets the
 * caller go on to mark an invoice "sent" or tell a user their message went
 * through. Callers that need to tolerate a failure should catch explicitly.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
  fromName,
  replyTo,
  attachments,
  headers,
}: SendEmailParams): Promise<{ id?: string }> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Email isn't configured — RESEND_API_KEY is not set.");
  }
  if (!text && !html) {
    throw new Error("sendEmail requires text or html content.");
  }

  const { data, error } = await resendClient().emails.send({
    from: senderFrom(fromName),
    to: Array.isArray(to) ? to : [to],
    subject,
    // Resend's types want at least one of these; we validated above.
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(headers ? { headers } : {}),
    ...(attachments && attachments.length > 0
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content),
            contentType: a.contentType,
          })),
        }
      : {}),
  } as Parameters<Resend["emails"]["send"]>[0]);

  if (error) {
    console.error("sendEmail: Resend rejected", { to, subject, error });
    throw new Error(friendlyResendError(error));
  }

  return { id: data?.id };
}

/**
 * Turn a Resend error into a message safe to show a user. The common one here
 * is the unverified-domain 403, which is a setup problem rather than a
 * per-send problem — so point at the fix instead of dumping raw JSON.
 */
function friendlyResendError(error: { name?: string; message?: string }): string {
  const message = error.message ?? "";

  if (/verify a domain|only send testing emails|own email address|not verified|domain.*verif/i.test(message)) {
    return `Email couldn't be sent — the sending domain isn't verified in Resend. Verify ${
      FROM_ADDRESS.split("@")[1]
    } at resend.com/domains, then try again.`;
  }
  return message ? `Email send failed: ${message}` : "Email send failed.";
}
