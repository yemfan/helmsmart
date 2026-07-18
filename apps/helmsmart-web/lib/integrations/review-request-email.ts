/**
 * Review request email template and sending via Resend
 */

import { sendEmail } from "@/lib/email";

interface ReviewRequestParams {
  clientName: string;
  clientEmail: string;
  businessName: string;
  reviewLink: string;
}

export async function sendReviewRequest({
  clientName,
  clientEmail,
  businessName,
  reviewLink,
}: ReviewRequestParams): Promise<{ ok: boolean; error?: string }> {
  try {
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Share Your Experience</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">Hi ${clientName},</h2>

      <p style="font-size: 16px;">We hope you had a great experience with <strong>${businessName}</strong>!</p>

      <p style="font-size: 16px;">
        Your feedback helps us serve you better and guides others in our community.
        We'd love to hear about your experience.
      </p>

      <div style="margin: 32px 0;">
        <a href="${reviewLink}"
           style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
          Share Your Review
        </a>
      </div>

      <p style="font-size: 14px; color: #64748b;">
        Your review takes just 2 minutes and appears on Google Business Profile,
        helping other customers discover us.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">

      <p style="font-size: 13px; color: #94a3b8;">
        This review request was sent because you recently completed a service with us.
        If you have any questions, please reply to this email.
      </p>
    </div>
  </body>
</html>
    `;

    // Throws on a rejected send; the catch below turns it into { ok: false }.
    await sendEmail({
      fromName: businessName,
      to: clientEmail,
      subject: `Share Your Experience with ${businessName}`,
      html,
      headers: {
        "X-Entity-Ref-ID": `review-request-${Date.now()}`,
      },
    });

    return { ok: true };
  } catch (err) {
    console.error("[review-request-email] error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
