type SendEmailParams = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  /**
   * SMTP headers passed through to Resend — notably the RFC 8058
   * `List-Unsubscribe` pair, which is what gives Gmail and Outlook their native
   * one-click Unsubscribe button on marketing mail.
   */
  headers?: Record<string, string>;
};

/**
 * Send one email via Resend.
 *
 * RETURNS `{ id }` ON SUCCESS AND `null` ON FAILURE, and logs the rejection.
 * It used to `await fetch(...)` and discard the response entirely, which meant
 * a 403 — the shape Resend returns for an unverified sending domain — was
 * indistinguishable from a delivered message. Callers went on to record
 * `status: 'sent'` for mail that never left. This is the same silent-failure
 * class as the Resend SDK resolving `{ data: null, error }` rather than
 * throwing: nothing surfaces unless you look.
 *
 * Deliberately does NOT throw. Callers here run in crons that process many
 * contacts in a loop, and one bad address should not abort the batch — but it
 * must be visible, and the caller must be able to tell.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
  headers,
}: SendEmailParams): Promise<{ id: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("sendEmail: RESEND_API_KEY not set, skipping email send");
    return null;
  }

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PropertyTools AI <noreply@propertytoolsai.com>",
        to: recipients,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      // The body carries the reason — "The propertytoolsai.com domain is not
      // verified" reads very differently from a rate limit, and neither is
      // visible if the response is thrown away.
      console.error(`sendEmail: Resend rejected (${res.status}):`, body.slice(0, 400));
      return null;
    }

    try {
      const json = JSON.parse(body) as { id?: string };
      return json.id ? { id: json.id } : null;
    } catch {
      return null;
    }
  } catch (e) {
    console.error("sendEmail: request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
