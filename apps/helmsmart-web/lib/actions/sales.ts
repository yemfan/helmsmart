"use server";

import { sendEmail } from "@/lib/email";
import { getServerT } from "@/lib/i18n/server";

export interface SalesState {
  success?: boolean;
  error?: string;
}

export async function submitSalesForm(
  _: SalesState,
  formData: FormData
): Promise<SalesState> {
  // What the VISITOR reads comes back in their language. The sales
  // notification below goes to the HelmSmart team, so it stays English.
  const t = await getServerT("site");

  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const company = formData.get("company") as string;
    const interested = formData.getAll("interested") as string[];
    const teamSize = formData.get("teamSize") as string;
    const timeline = formData.get("timeline") as string;
    const message = formData.get("message") as string;

    if (!name || !email || !company) {
      return { error: t("sales.errors.required") };
    }

    if (!email.includes("@")) {
      return { error: t("sales.errors.email") };
    }

    if (interested.length === 0) {
      return { error: t("sales.errors.interest") };
    }

    // Send to sales email
    await sendEmail({
      to: "contact@helmsmart.ai",
      replyTo: email,
      subject: `Sales Inquiry: ${company} — from ${name}`,
      html: `
        <h2>New Sales Inquiry</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Interested in:</strong> ${interested.join(", ")}</p>
        <p><strong>Team size:</strong> ${teamSize || "Not specified"}</p>
        <p><strong>Timeline:</strong> ${timeline || "Not specified"}</p>
        ${
          message
            ? `<hr /><h3>Additional info:</h3><p>${message.replace(/\n/g, "<br />")}</p>`
            : ""
        }
      `,
    });

    /*
     * The VISITOR reads this, and they just filled in a form on a page that
     * was in their language — so it follows their locale, which the
     * translator above already holds. The inquiry sent to the HelmSmart sales
     * team stays English on purpose: we read it, not them.
     */
    await sendEmail({
      to: email,
      subject: t("sales.confirmationEmail.subject"),
      html: `
        <h2>${t("sales.confirmationEmail.heading")}</h2>
        <p>${t("sales.confirmationEmail.greeting", { name })}</p>
        <p>${t("sales.confirmationEmail.body", { company })}</p>
        <p style="margin-top: 24px; color: #666;">${t("sales.confirmationEmail.signoff")}<br />${t("sales.confirmationEmail.team")}</p>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("Sales form error:", error);
    return { error: t("sales.errors.failed") };
  }
}
