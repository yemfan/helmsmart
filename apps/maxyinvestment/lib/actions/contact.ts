"use server";

import { Resend } from "resend";
import { company } from "@/lib/content";

export type ContactState = {
  success?: boolean;
  error?: string;
  /** Field-level errors, keyed by input name, so the form can mark the culprit. */
  fieldErrors?: Record<string, string>;
};

/**
 * realtybossai.com is the ONLY verified sending domain on the Resend account —
 * helmsmart.ai and maxyinvestment.com both 403 as unverified. So mail leaves
 * from there while replyTo carries the enquirer's address. Only the MAXY team
 * ever sees this sender, since they're the recipient. To send from the brand's
 * own domain: verify maxyinvestment.com in Resend, then set RESEND_FROM_EMAIL.
 */
const FROM = process.env.RESEND_FROM_EMAIL?.trim() || "noreply@realtybossai.com";
const TO = company.email;

const MAX = { name: 100, email: 200, subject: 150, message: 5000 } as const;

/** Escape before interpolating into the email HTML — this is untrusted input. */
function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Deliberately loose: the real check is whether the reply lands.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContactForm(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const get = (k: string) => (formData.get(k) as string | null)?.trim() ?? "";

  // Honeypot: hidden from humans, catnip for bots. Claim success so they don't retry.
  if (get("website")) return { success: true };

  const name = get("name");
  const email = get("email");
  const subject = get("subject") || "Website enquiry";
  const message = get("message");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please tell us your name.";
  if (!email) fieldErrors.email = "Please add an email so we can reply.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "That email address doesn't look right.";
  if (!message) fieldErrors.message = "Please include a message.";

  for (const [k, limit] of Object.entries(MAX)) {
    const v = get(k);
    if (v.length > limit) fieldErrors[k] = `Please keep this under ${limit} characters.`;
  }

  if (Object.keys(fieldErrors).length) {
    return { error: "Please check the highlighted fields.", fieldErrors };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // Misconfiguration, not user error — don't blame the sender.
    console.error("[contact] RESEND_API_KEY is not set; cannot send.");
    return { error: `Our contact form is temporarily unavailable. Please email ${TO} directly.` };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `MAXY Website <${FROM}>`,
      to: TO,
      replyTo: `${name} <${email}>`,
      subject: `MAXY enquiry: ${subject} — from ${name}`,
      text: [
        `From: ${name} <${email}>`,
        `Subject: ${subject}`,
        "",
        message,
        "",
        "— sent from the maxyinvestment.com contact form",
      ].join("\n"),
      html: `
        <h2 style="font-family:Georgia,serif;color:#0b1f44;margin:0 0 16px">New enquiry from maxyinvestment.com</h2>
        <p style="margin:0 0 4px"><strong>From:</strong> ${esc(name)} (<a href="mailto:${esc(email)}">${esc(email)}</a>)</p>
        <p style="margin:0 0 16px"><strong>Subject:</strong> ${esc(subject)}</p>
        <hr style="border:none;border-top:1px solid #e6eaf0" />
        <p style="white-space:pre-wrap;line-height:1.6">${esc(message)}</p>
      `,
    });

    if (error) {
      console.error("[contact] Resend rejected the send:", error);
      return { error: `We couldn't send that. Please email ${TO} directly.` };
    }

    return { success: true };
  } catch (err) {
    console.error("[contact] send threw:", err);
    return { error: `We couldn't send that. Please email ${TO} directly.` };
  }
}
