import { outcomeForLog, sendEmailGuarded, sendSmsGuarded } from "@/lib/outbound-send";
import { localizeOutbound, type Lang } from "@/lib/language";
import { orgWriteLocale } from "@/lib/i18n/userLocale";
import { contactLanguageFor } from "@/lib/i18n/contactLocale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween } from "@/lib/org-date";
import type { MessageSender } from "@/lib/message-provenance";

// Plain server module (NOT "use server") so it can take a Supabase client
// argument and be shared by both the manual server action (cookie client) and
// the dunning cron (service client).

export type ReminderInvoice = {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string;
  client_id: string | null;
  reminder_count: number | null;
  organization_id: string;
  clients:
    | { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; preferred_language: string | null }
    | { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; preferred_language: string | null }[]
    | null;
};

export function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00").getTime();
  return Math.floor((Date.now() - due) / 86_400_000);
}

function reminderTone(overdue: number): { label: string; line: string; urgent: boolean } {
  if (overdue <= 0)
    return { label: "Payment reminder", line: "This is a friendly reminder that the invoice below is due soon.", urgent: false };
  if (overdue <= 7)
    return { label: "Payment reminder", line: `This invoice is ${overdue} day${overdue === 1 ? "" : "s"} past due. We'd appreciate prompt payment.`, urgent: false };
  if (overdue <= 30)
    return { label: "Second reminder", line: `This invoice is now ${overdue} days overdue. Please arrange payment at your earliest convenience.`, urgent: true };
  return { label: "Final reminder", line: `This invoice is ${overdue} days overdue. Please settle it promptly to avoid further follow-up.`, urgent: true };
}

/**
 * Emails a payment reminder for one invoice, logs it to messages, and bumps
 * the invoice's reminder tracking. Caller supplies the Supabase client so this
 * works from both a session action and the cron (service role).
 */
export async function sendReminderForInvoice(
  db: SupabaseClient,
  inv: ReminderInvoice,
  opts?: {
    /** The org's date (`YYYY-MM-DD`), so "N days past due" counts in its day, not UTC's. */
    today?: string;
    /**
     * Who the `messages` rows say sent it. An automatic reminder (the manual
     * button, the dunning cron) is "reminder"; one Alex proposed and the owner
     * approved in Ask Mark is "ai_team".
     */
    sentBy?: Extract<MessageSender, "reminder" | "ai_team">;
  }
): Promise<{ sent: boolean; reason?: string }> {
  const sentBy = opts?.sentBy ?? "reminder";
  const clientRaw = inv.clients;
  const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
  if (!client?.email) return { sent: false, reason: "Client has no email address" };

  const clientName = [client.first_name, client.last_name].filter(Boolean).join(" ") || "there";
  const overdue = opts?.today ? daysBetween(inv.due_date, opts.today) : daysOverdue(inv.due_date);
  const nextCount = (inv.reminder_count ?? 0) + 1;
  const amount = Number(inv.total).toFixed(2);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const payUrl = `${appUrl}/pay/${inv.id}`;
  const dueFormatted = new Date(inv.due_date + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const { label, line, urgent } = reminderTone(overdue);
  const accent = urgent ? "#b91c1c" : "#4f46e5";
  const subject = `${label}: Invoice ${inv.invoice_number} — $${amount}`;

  const text = `Hi ${clientName},\n\n${line}\n\nInvoice ${inv.invoice_number}\nAmount due: $${amount}\nDue date: ${dueFormatted}\n\nPay online: ${payUrl}\n\nThank you!`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <tr><td style="background:${accent};padding:28px 40px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><div style="font-size:20px;font-weight:700;color:#fff">${label}</div><div style="font-size:13px;color:#e0e7ff;margin-top:2px">Invoice ${inv.invoice_number}</div></td>
          <td align="right"><div style="font-size:26px;font-weight:700;color:#fff">$${amount}</div><div style="font-size:12px;color:#e0e7ff;margin-top:2px">Due ${dueFormatted}</div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 40px 0">
        <p style="margin:0;font-size:15px;color:#334155">Hi ${clientName},</p>
        <p style="margin:8px 0 0;font-size:14px;color:#64748b">${line}</p>
      </td></tr>
      <tr><td style="padding:28px 40px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${payUrl}" style="display:inline-block;background:${accent};color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:10px">Pay $${amount} online &rarr;</a>
      </td></tr></table></td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
        <p style="margin:0;font-size:12px;color:#94a3b8">Secure payment powered by Stripe &middot; ${inv.invoice_number}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  // Org context (Twilio sender + owner English-assist) and the client's language.
  const { data: orgRow } = await db
    .from("organizations")
    .select("twilio_number, owner_english_assist")
    .eq("id", inv.organization_id)
    .single();
  const assist = !!orgRow?.owner_english_assist;
  const lang: Lang = (client.preferred_language as Lang | null) ?? "en";
  // With multi-language assist on, the owner gets a copy in their own language.
  const verifyIn = assist ? contactLanguageFor(await orgWriteLocale(inv.organization_id, db)) : null;

  // English clients keep the rich HTML email; non-English get a localized text
  // email (with the owner's copy when multi-language assist is on).
  const emailText = lang === "en" ? text : await localizeOutbound(text, lang, verifyIn);
  const emailSubject = lang === "en" ? subject : await localizeOutbound(subject, lang, null);
  /*
   * The email is TRANSACTIONAL: a reminder about an invoice this client was
   * already billed, carrying its payment link. An email opt-out does not stop
   * it (see `optOutCovers` in @helm/dna-communication) — the switch on the
   * client page says so. It is recorded as the automatic reminder it is, not
   * as a message the owner typed.
   */
  const emailOutcome = await sendEmailGuarded({
    db,
    orgId: inv.organization_id,
    clientId: inv.client_id,
    to: client.email,
    ...(lang === "en" ? { subject, html, text } : { subject: emailSubject, text: emailText }),
    purpose: "transactional",
    sentBy,
    logSubject: emailSubject,
    logBody: emailText,
  });
  // Resend refused it: the caller sees the failure, as before.
  if (!emailOutcome.ok) {
    throw new Error(emailOutcome.reason === "provider" ? emailOutcome.detail : outcomeForLog(emailOutcome));
  }

  // Also nudge by SMS when the client has a phone and the org has a Twilio
  // number. Texts get read far faster than email — the real "get paid faster"
  // lever. A text opt-out DOES stop this one: every text passes the guard.
  // Refused or failed is non-fatal; the email reminder already went out.
  if (client.phone && orgRow?.twilio_number) {
    const smsFrom = orgRow.twilio_number;
    const smsEnglish = `Hi ${clientName}, invoice ${inv.invoice_number} for $${amount} is ${
      overdue > 0 ? `${overdue} day${overdue === 1 ? "" : "s"} past due` : "due soon"
    }. Pay online: ${payUrl}`;
    const smsBody = lang === "en" ? smsEnglish : await localizeOutbound(smsEnglish, lang, verifyIn);
    const smsOutcome = await sendSmsGuarded({
      db,
      orgId: inv.organization_id,
      clientId: inv.client_id,
      to: client.phone,
      body: smsBody,
      fromNumber: smsFrom,
      purpose: "transactional",
      sentBy,
    });
    if (!smsOutcome.ok) console.warn("[invoice-reminders] SMS nudge not sent:", outcomeForLog(smsOutcome));
  }

  await db
    .from("invoices")
    .update({
      last_reminder_sent_at: new Date().toISOString(),
      reminder_count: nextCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id);

  return { sent: true };
}
