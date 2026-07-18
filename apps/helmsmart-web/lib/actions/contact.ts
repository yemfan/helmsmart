"use server";

import { sendEmail } from "@/lib/email";

export interface ContactState {
  success?: boolean;
  error?: string;
}

export async function submitContactForm(
  _: ContactState,
  formData: FormData
): Promise<ContactState> {
  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("body") as string;

    if (!name || !email || !subject || !message) {
      return { error: "All fields are required" };
    }

    if (!email.includes("@")) {
      return { error: "Please provide a valid email address" };
    }

    // Send to support email
    await sendEmail({
      to: "contact@helmsmart.ai",
      replyTo: email,
      subject: `HelmSmart Contact: ${subject} — from ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <p>${message.replace(/\n/g, "<br />")}</p>
      `,
    });

    // Send confirmation to user
    await sendEmail({
      to: email,
      subject: "We received your message — HelmSmart",
      html: `
        <h2>Thanks for reaching out!</h2>
        <p>Hi ${name},</p>
        <p>We received your message and will get back to you within one business day.</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <p>Best,<br />The HelmSmart team</p>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("Contact form error:", error);
    return {
      error:
        "Failed to send message. Please try again or email contact@helmsmart.ai",
    };
  }
}
