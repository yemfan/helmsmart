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
  const fromAddress =
    from?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "LeadSmart AI <contact@leadsmart-ai.com>";

  const payload: Record<string, unknown> = {
    from: fromAddress,
    to: recipients,
    subject,
    text,
  };
  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;
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
    throw new Error(`Resend error ${res.status}: ${errText || res.statusText}`);
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: json.id };
}

function bufferToBase64(bytes: Uint8Array): string {
  // Node and modern browsers both support Buffer in server contexts.
  // The helper is server-only (callers import it under `import "server-only"`),
  // so Buffer is always available.
  return Buffer.from(bytes).toString("base64");
}

