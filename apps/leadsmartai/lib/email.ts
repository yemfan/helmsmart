/**
 * Resend-side attachment shape. We carry the binary payload as a
 * Uint8Array; the helper base64-encodes it on the way out (Resend's
 * API expects `content` as a base64 string).
 */
export type EmailAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

type SendEmailParams = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  /** Optional sender override. Falls back to RESEND_FROM_EMAIL or
   *  the default LeadSmart sender. Use the agent's verified address
   *  when available so replies route back to them. */
  from?: string;
  /** Optional reply-to override (e.g. when sending FROM a system
   *  address but wanting replies to go to the agent's mailbox). */
  replyTo?: string;
  /** Optional binary attachments. Resend requires base64-encoded
   *  content; this helper handles the encoding internally. */
  attachments?: EmailAttachment[];
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from,
  replyTo,
  attachments,
}: SendEmailParams): Promise<{ id?: string } | undefined> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("sendEmail: RESEND_API_KEY not set, skipping email send");
    return undefined;
  }

  const recipients = Array.isArray(to) ? to : [to];
  // Default sender must be on a Resend-VERIFIED domain. We've migrated to
  // helmsmart.ai (leadsmart-ai.com expired). Sends only deliver once helmsmart.ai
  // is verified at resend.com/domains. Override per-env with RESEND_FROM_EMAIL
  // (e.g. a verified subdomain like inbox.helmsmart.ai).
  const fromAddress =
    from?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "RealtorBoss <contact@helmsmart.ai>";

  const payload: Record<string, unknown> = {
    from: fromAddress,
    to: recipients,
    subject,
    text,
  };
  if (html) payload.html = html;
  // Replies should land in the active mailbox — default reply-to to
  // contact@helmsmart.ai (env-overridable). Callers that pass their own replyTo
  // (e.g. the agent's address) still win.
  const replyToAddress =
    replyTo?.trim() || process.env.RESEND_REPLY_TO?.trim() || "contact@helmsmart.ai";
  if (replyToAddress) payload.reply_to = replyToAddress;
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: bufferToBase64(a.content),
      content_type: a.contentType,
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // Keep the raw Resend payload in the server logs for debugging, but throw a
    // human message — callers surface this straight to the agent's screen.
    console.error("sendEmail: Resend rejected", { status: res.status, body: errText });
    throw new Error(friendlyResendError(res.status, errText));
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id };
}

/**
 * Turn a Resend API error into a message safe to show an agent. The most
 * common one in practice is the unverified-domain / test-mode 403 ("you can
 * only send testing emails to your own email address"), which is a setup
 * issue, not a per-send failure — so we point at the fix instead of dumping
 * the raw JSON.
 */
function friendlyResendError(status: number, body: string): string {
  let message = "";
  try {
    message = String((JSON.parse(body) as { message?: string })?.message ?? "");
  } catch {
    /* body wasn't JSON */
  }
  const haystack = `${message} ${body}`;

  if (/verify a domain|only send testing emails|own email address|not verified|domain.*verif/i.test(haystack)) {
    return "Email isn't set up to send to this recipient yet — the sending domain isn't verified in Resend. Verify helmsmart.ai at resend.com/domains, then try again.";
  }
  if (status === 401 || status === 403) {
    return message || "Email couldn't be sent — Resend rejected the request (check the API key and verified sending domain).";
  }
  if (status === 429) {
    return "Email is being rate-limited right now — wait a moment and try again.";
  }
  return message ? `Email send failed: ${message}` : `Email send failed (Resend ${status}).`;
}

function bufferToBase64(bytes: Uint8Array): string {
  // Node and modern browsers both support Buffer in server contexts.
  // The helper is server-only (callers import it under `import "server-only"`),
  // so Buffer is always available.
  return Buffer.from(bytes).toString("base64");
}

