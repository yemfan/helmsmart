"use server";

import { sendEmail } from "@/lib/email";
import { getServerT } from "@/lib/i18n/server";

export interface ContactState {
  success?: boolean;
  error?: string;
}

export async function submitContactForm(
  _: ContactState,
  formData: FormData
): Promise<ContactState> {
  // What the VISITOR reads comes back in their language. The notification
  // below goes to the HelmSmart team, so it stays English.
  const t = await getServerT("site");

  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("body") as string;

    if (!name || !email || !subject || !message) {
      return { error: t("contact.errors.required") };
    }

    if (!email.includes("@")) {
      return { error: t("contact.errors.email") };
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

    /*
     * The VISITOR reads this, and they just filled in a form on a page that
     * was in their language — so it follows their locale, which the
     * translator above already holds. The notification to the HelmSmart team
     * stays English on purpose: we read it, not them.
     */
    await sendEmail({
      to: email,
      subject: t("contact.confirmationEmail.subject"),
      html: `
        <h2>${t("contact.confirmationEmail.heading")}</h2>
        <p>${t("contact.confirmationEmail.greeting", { name })}</p>
        <p>${t("contact.confirmationEmail.body")}</p>
        <p><strong>${t("contact.confirmationEmail.subjectLabel")}</strong> ${subject}</p>
        <hr />
        <p>${t("contact.confirmationEmail.signoff")}<br />${t("contact.confirmationEmail.team")}</p>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("Contact form error:", error);
    return { error: t("contact.errors.failed") };
  }
}
