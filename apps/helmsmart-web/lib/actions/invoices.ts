"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { insertInvoiceWithLines } from "@helm/dna-finance";
import { revalidatePath } from "next/cache";
import { checkActionPermission } from "@/components/role-guard";
import { sendEmail, FROM_ADDRESS } from "@/lib/email";
import { createNotification } from "@/lib/actions/notifications";
import { refreshClientLifetimeValue } from "@/lib/actions/clients";
import { runAutomations } from "@/lib/automation-engine";
import { sendReminderForInvoice, type ReminderInvoice } from "@/lib/invoice-reminders";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  coa_account_id?: string | null;
  sort_order?: number;
}

// ─── Create invoice ───────────────────────────────────────────────────────────
// Pure persistence (numbering, totals, invoice + lines insert) lives in
// @helm/dna-finance. This server action owns org resolution + revalidation.

export async function createInvoice(data: {
  clientId: string | null;
  dueDate: string;
  taxRate: number;
  notes: string;
  lines: InvoiceLine[];
}) {
  const denied = await checkActionPermission("invoices.write");
  if (denied) throw new Error(denied.error);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  const id = await insertInvoiceWithLines(supabase, orgId, data);

  revalidatePath("/books/invoices");
  return id;
}

// ─── Send invoice ─────────────────────────────────────────────────────────────

export async function sendInvoice(invoiceId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select(`
      *,
      clients(first_name, last_name, email),
      invoice_lines(description, quantity, unit_price, amount, sort_order)
    `)
    .eq("id", invoiceId)
    .eq("organization_id", orgId)
    .single();

  if (!inv) throw new Error("Invoice not found");

  const clientRaw = inv.clients as { first_name: string | null; last_name: string | null; email: string | null } | null;
  const clientArr = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
  if (!clientArr?.email) throw new Error("Client has no email address");

  const clientName = [clientArr.first_name, clientArr.last_name].filter(Boolean).join(" ") || "there";
  const lines = (Array.isArray(inv.invoice_lines) ? inv.invoice_lines : []) as {
    description: string; quantity: number; unit_price: number; amount: number; sort_order?: number;
  }[];

  const sortedLines = lines.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalUrl = `${appUrl}/pay/${invoiceId}`;

  // Plain-text fallback
  const textLineRows = sortedLines
    .map((l) => `  ${l.description} x${l.quantity}  $${Number(l.unit_price).toFixed(2)}  $${Number(l.amount).toFixed(2)}`)
    .join("\n");
  const body = `Hi ${clientName},\n\nInvoice #${inv.invoice_number} — $${Number(inv.total).toFixed(2)} due ${inv.due_date}\n\n${textLineRows}\n\nTotal: $${Number(inv.total).toFixed(2)}${inv.notes ? `\n\nNotes: ${inv.notes}` : ""}\n\nPay online: ${portalUrl}\n\nThank you for your business!`;

  // HTML invoice email
  const htmlLineRows = sortedLines.map((l) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:14px">${l.description}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;text-align:center">${l.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;text-align:right">$${Number(l.unit_price).toFixed(2)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;text-align:right;font-weight:600">$${Number(l.amount).toFixed(2)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#4f46e5;padding:28px 40px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">${inv.invoice_number}</div>
                <div style="font-size:13px;color:#c7d2fe;margin-top:2px">Invoice</div>
              </td>
              <td align="right">
                <div style="font-size:28px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums">$${Number(inv.total).toFixed(2)}</div>
                <div style="font-size:12px;color:#c7d2fe;margin-top:2px">Due ${new Date(inv.due_date + "T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:32px 40px 0">
          <p style="margin:0;font-size:15px;color:#334155">Hi ${clientName},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b">Please find your invoice details below. You can pay securely online using the button at the bottom of this email.</p>
        </td></tr>

        <!-- Dates -->
        <tr><td style="padding:24px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;overflow:hidden">
            <tr>
              <td style="padding:14px 20px">
                <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Issue date</div>
                <div style="font-size:14px;color:#334155;margin-top:4px">${new Date(inv.issue_date + "T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
              </td>
              <td style="padding:14px 20px;border-left:1px solid #e2e8f0">
                <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Due date</div>
                <div style="font-size:14px;color:#334155;margin-top:4px">${new Date(inv.due_date + "T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Line items -->
        <tr><td style="padding:24px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <thead>
              <tr style="border-bottom:2px solid #e2e8f0">
                <th style="padding:0 0 8px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Description</th>
                <th style="padding:0 0 8px;text-align:center;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Qty</th>
                <th style="padding:0 0 8px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Price</th>
                <th style="padding:0 0 8px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Amount</th>
              </tr>
            </thead>
            <tbody>${htmlLineRows}</tbody>
          </table>
        </td></tr>

        <!-- Totals -->
        <tr><td style="padding:16px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="right">
                <table cellpadding="0" cellspacing="0" style="width:220px">
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding:4px 0">Subtotal</td>
                    <td style="font-size:13px;color:#334155;text-align:right;padding:4px 0;font-variant-numeric:tabular-nums">$${Number(inv.subtotal).toFixed(2)}</td>
                  </tr>
                  ${Number(inv.tax_rate) > 0 ? `<tr><td style="font-size:13px;color:#64748b;padding:4px 0">Tax (${(Number(inv.tax_rate)*100).toFixed(0)}%)</td><td style="font-size:13px;color:#334155;text-align:right;padding:4px 0;font-variant-numeric:tabular-nums">$${Number(inv.tax_amount).toFixed(2)}</td></tr>` : ""}
                  <tr style="border-top:2px solid #e2e8f0">
                    <td style="font-size:15px;font-weight:700;color:#0f172a;padding:10px 0 0">Total due</td>
                    <td style="font-size:15px;font-weight:700;color:#0f172a;text-align:right;padding:10px 0 0;font-variant-numeric:tabular-nums">$${Number(inv.total).toFixed(2)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>

        ${inv.notes ? `<tr><td style="padding:20px 40px 0"><p style="margin:0;font-size:13px;color:#64748b"><strong style="color:#334155">Notes:</strong> ${inv.notes}</p></td></tr>` : ""}

        <!-- CTA -->
        <tr><td style="padding:32px 40px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="${portalUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:10px">Pay $${Number(inv.total).toFixed(2)} online →</a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Secure payment powered by Stripe · ${inv.invoice_number}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const fromEmail = FROM_ADDRESS;

  // Throws if Resend rejects the send, so the messages row and the
  // invoice's "sent" status below are only written for mail that left.
  await sendEmail({
    to: clientArr.email,
    subject: `Invoice ${inv.invoice_number} — $${Number(inv.total).toFixed(2)} due ${inv.due_date}`,
    html,
    text: body,
  });

  // Log outbound email in messages
  await supabase.from("messages").insert({
    organization_id: orgId,
    client_id: inv.client_id,
    channel: "email",
    direction: "outbound",
    from_address: fromEmail,
    to_address: clientArr.email,
    subject: `Invoice ${inv.invoice_number}`,
    body,
    read: true,
    sent_at: new Date().toISOString(),
  });

  await supabase
    .from("invoices")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", invoiceId);

  revalidatePath("/books/invoices");
  revalidatePath(`/books/invoices/${invoiceId}`);
}

// ─── Send payment reminder (manual) ───────────────────────────────────────────

export async function sendInvoiceReminder(invoiceId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, total, due_date, client_id, reminder_count, organization_id, clients(first_name, last_name, email)"
    )
    .eq("id", invoiceId)
    .eq("organization_id", orgId)
    .single();

  if (!inv) throw new Error("Invoice not found");

  const res = await sendReminderForInvoice(supabase, inv as ReminderInvoice);
  if (!res.sent) throw new Error(res.reason ?? "Could not send reminder");

  revalidatePath("/books/invoices");
  revalidatePath(`/books/invoices/${invoiceId}`);
}

// ─── Mark paid → post journal entry ──────────────────────────────────────────

export async function markInvoicePaid(invoiceId: string, bankAccountId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  // Load invoice + lines + bank account CoA
  const [invRes, bankRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(`*, invoice_lines(description, amount, coa_account_id, sort_order)`)
      .eq("id", invoiceId)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("bank_accounts")
      .select("coa_account_id, name")
      .eq("id", bankAccountId)
      .eq("organization_id", orgId)
      .single(),
  ]);

  const inv  = invRes.data;
  const bank = bankRes.data;

  if (!inv)  throw new Error("Invoice not found");
  if (!bank) throw new Error("Bank account not found");
  if (!bank.coa_account_id) throw new Error("Bank account has no CoA mapping — set it in Settings first");

  const lines = (Array.isArray(inv.invoice_lines) ? inv.invoice_lines : []) as {
    description: string; amount: number; coa_account_id: string | null;
  }[];

  // Get a default revenue account if lines don't specify
  const revenueLines = lines.filter((l) => l.coa_account_id);
  if (revenueLines.length === 0) {
    const { data: defaultRev } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("type", "revenue")
      .order("code")
      .limit(1)
      .single();
    if (defaultRev) {
      lines.forEach((l) => { l.coa_account_id = defaultRev.id; });
    }
  }

  const total = Number(inv.total);

  // Post journal entry: DR bank / CR revenue (per line)
  const { data: je, error: jeErr } = await supabase
    .from("journal_entries")
    .insert({
      organization_id: orgId,
      date: new Date().toISOString().slice(0, 10),
      memo: `Invoice ${inv.invoice_number} — payment received`,
      source_type: "invoice",
    })
    .select("id")
    .single();

  if (jeErr || !je) throw new Error(jeErr?.message ?? "Failed to create journal entry");

  // One DR line for the bank (full total)
  const journalLines = [
    {
      journal_entry_id: je.id,
      account_id: bank.coa_account_id,
      debit: total,
      credit: 0,
      description: `Payment — Invoice ${inv.invoice_number}`,
    },
  ];

  // CR lines per invoice line (grouped by coa_account_id)
  const byAccount = new Map<string, number>();
  for (const l of lines) {
    if (!l.coa_account_id) continue;
    byAccount.set(l.coa_account_id, (byAccount.get(l.coa_account_id) ?? 0) + Number(l.amount));
  }

  // If tax, the credit total might differ — use total for the single credit if no lines have accounts
  if (byAccount.size === 0) {
    // Fallback: credit the bank debit to avoid imbalance — shouldn't normally happen
  } else {
    // Scale credits to match total (handles rounding + tax)
    const creditSum = Array.from(byAccount.values()).reduce((s, v) => s + v, 0);
    const scale = creditSum > 0 ? total / creditSum : 1;

    for (const [acctId, amt] of byAccount) {
      journalLines.push({
        journal_entry_id: je.id,
        account_id: acctId,
        debit: 0,
        credit: +(amt * scale).toFixed(2),
        description: `Invoice ${inv.invoice_number}`,
      });
    }
  }

  await supabase.from("journal_lines").insert(journalLines);

  // Mark invoice paid
  await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      journal_entry_id: je.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  revalidatePath("/books/invoices");
  revalidatePath(`/books/invoices/${invoiceId}`);

  // Update client lifetime value
  if (inv.client_id) {
    await refreshClientLifetimeValue(inv.client_id, orgId);
    revalidatePath(`/clients/${inv.client_id}`);
  }

  // Fire notification
  await createNotification({
    type: "invoice_paid",
    title: `Payment received: $${total.toFixed(2)}`,
    body: `Invoice ${inv.invoice_number} marked as paid`,
    link: `/books/invoices/${invoiceId}`,
  });

  // Run automation rules
  await runAutomations("invoice_paid", {
    orgId,
    clientId: inv.client_id ?? null,
    invoiceId,
    invoiceNumber: inv.invoice_number,
    amount: total,
  });
}

// ─── Void invoice ─────────────────────────────────────────────────────────────

export async function voidInvoice(invoiceId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("organization_id", orgId);

  revalidatePath("/books/invoices");
  revalidatePath(`/books/invoices/${invoiceId}`);
}
