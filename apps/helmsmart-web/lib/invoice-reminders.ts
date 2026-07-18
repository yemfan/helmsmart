import { sendEmail, FROM_ADDRESS } from "@/lib/email";
import twilio from "twilio";
import { localizeOutbound, type Lang } from "@/lib/language";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  inv: ReminderInvoice
): Promise<{ sent: boolean; reason?: string }> {
  const clientRaw = inv.clients;
  const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
  if (!client?.email) return { sent: false, reason: "Client has no email address" };

  const clientName = [client.first_name, client.last_name].filter(Boolean).join(" ") || "there";
  const overdue = daysOverdue(inv.due_date);
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

  const fromEmail = FROM_ADDRESS;

  // Org context (Twilio sender + owner English-assist) and the client's language.
  const { data: orgRow } = await db
    .from("organizations")
    .select("twilio_number, owner_english_assist")
    .eq("id", inv.organization_id)
    .single();
  const assist = !!orgRow?.owner_english_assist;
  const lang: Lang = (client.preferred_language as Lang | null) ?? "en";

  // English clients keep the rich HTML email; non-English get a localized text
  // email (bilingual when owner English-assist is on).
  const emailText = lang === "en" ? text : await localizeOutbound(text, lang, assist);
  const emailSubject = lang === "en" ? subject : await localizeOutbound(subject, lang, false);
  if (lang === "en") {
    await sendEmail({ to: client.email, subject, html, text });
  } else {
    await sendEmail({ to: client.email, subject: emailSubject, text: emailText });
  }

  await db.from("messages").insert({
    organization_id: inv.organization_id,
    client_id: inv.client_id,
    channel: "email",
    direction: "outbound",
    from_address: fromEmail,
    to_address: client.email,
    subject: emailSubject,
    body: emailText,
    read: true,
    sent_at: new Date().toISOString(),
  });

  // Also nudge by SMS when the client has a phone and the org has a Twilio
  // number. Texts get read far faster than email — the real "get paid faster"
  // lever. Failure here is non-fatal; the email reminder already went out.
  if (client.phone && orgRow?.twilio_number) {
    const smsFrom = orgRow.twilio_number;
    const smsEnglish = `Hi ${clientName}, invoice ${inv.invoice_number} for $${amount} is ${
      overdue > 0 ? `${overdue} day${overdue === 1 ? "" : "s"} past due` : "due soon"
    }. Pay online: ${payUrl}`;
    const smsBody = lang === "en" ? smsEnglish : await localizeOutbound(smsEnglish, lang, assist);
    try {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
      await twilioClient.messages.create({ from: smsFrom, to: client.phone, body: smsBody });
      await db.from("messages").insert({
        organization_id: inv.organization_id,
        client_id: inv.client_id,
        channel: "sms",
        direction: "outbound",
        from_address: smsFrom,
        to_address: client.phone,
        body: smsBody,
        read: true,
        sent_at: new Date().toISOString(),
      });
    } catch {
      // SMS failed — email reminder already sent, so not fatal.
    }
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
