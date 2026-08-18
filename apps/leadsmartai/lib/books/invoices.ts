import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { getReceptionistConfig } from "@/lib/voice-receptionist/settings";
import { sendEmail } from "@/lib/email";
import { computeTotals, lineAmount, formatMoney } from "./money";
import { renderInvoicePdf } from "./pdf";

/**
 * Invoice service for the LeadSmart "Books" feature. Agent-scoped via
 * getCurrentAgentContext(); all access goes through supabaseAdmin (the new
 * invoices / invoice_lines tables carry no RLS policies) filtered by agent_id.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export type InvoiceRow = {
  id: string;
  agent_id: number | string;
  contact_id: string | null;
  client_name: string | null;
  client_email: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  payment_url: string | null;
  paid_at: string | null;
  sent_at: string | null;
  last_sent_at: string | null;
  created_at: string;
};

export type InvoiceLineRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
};

export type InvoiceLineInput = { description: string; quantity: number; unitPrice: number };

/** Next per-agent invoice number, e.g. INV-0001. Count-based — fine for a single
 *  realtor; a same-number race is caught by the unique (agent_id, number) index. */
async function nextInvoiceNumber(agentId: string): Promise<string> {
  const { count } = await supabaseAdmin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId as never);
  return `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function listInvoices(limit = 100): Promise<InvoiceRow[]> {
  const { agentId } = await getCurrentAgentContext();
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("agent_id", agentId as never)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[books] listInvoices:", error.message);
    return [];
  }
  return (data ?? []) as unknown as InvoiceRow[];
}

export async function getInvoice(
  id: string,
): Promise<{ invoice: InvoiceRow; lines: InvoiceLineRow[] } | null> {
  const { agentId } = await getCurrentAgentContext();
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId as never)
    .maybeSingle();
  if (!inv) return null;
  const { data: lines } = await supabaseAdmin
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });
  return {
    invoice: inv as unknown as InvoiceRow,
    lines: (lines ?? []) as unknown as InvoiceLineRow[],
  };
}

export type CreateInvoiceInput = {
  contactId?: string | null;
  clientName?: string;
  clientEmail?: string;
  dueDate?: string | null;
  taxRate?: number;
  notes?: string;
  paymentUrl?: string;
  lines: InvoiceLineInput[];
};

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ ok: true; id: string; invoiceNumber: string } | { ok: false; error: string }> {
  const { agentId } = await getCurrentAgentContext();

  const cleanLines = (input.lines || [])
    .map((l) => ({
      description: String(l.description ?? "").trim(),
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }))
    .filter((l) => l.description.length > 0);
  if (cleanLines.length === 0) return { ok: false, error: "Add at least one line item." };

  const taxRate = Math.max(0, Number(input.taxRate) || 0);
  const { subtotal, taxAmount, total } = computeTotals(cleanLines, taxRate);
  const invoiceNumber = await nextInvoiceNumber(agentId);

  const { data: inv, error } = await supabaseAdmin
    .from("invoices")
    .insert({
      agent_id: agentId,
      contact_id: input.contactId ?? null,
      client_name: input.clientName?.trim() || null,
      client_email: input.clientEmail?.trim() || null,
      invoice_number: invoiceNumber,
      status: "draft",
      due_date: input.dueDate || null,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      notes: input.notes?.trim() || null,
      payment_url: input.paymentUrl?.trim() || null,
    } as never)
    .select("id")
    .single();

  if (error || !inv) {
    console.error("[books] createInvoice:", error?.message);
    return { ok: false, error: error?.message || "Could not create the invoice." };
  }
  const invoiceId = String((inv as { id: unknown }).id);

  const lineRows = cleanLines.map((l, i) => ({
    invoice_id: invoiceId,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    amount: lineAmount(l.quantity, l.unitPrice),
    sort_order: i,
  }));
  const { error: lerr } = await supabaseAdmin.from("invoice_lines").insert(lineRows as never);
  if (lerr) console.error("[books] invoice_lines insert:", lerr.message);

  return { ok: true, id: invoiceId, invoiceNumber };
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Email the invoice (HTML) to its client and mark it sent. Replies route to the
 *  agent. Agent-scoped; needs RESEND_API_KEY + a client email on the invoice. */
export async function sendInvoiceEmail(id: string): Promise<{ ok: boolean; error?: string }> {
  const { agentId, email: agentEmail } = await getCurrentAgentContext();

  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId as never)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  const invoice = inv as unknown as InvoiceRow;
  const to = (invoice.client_email || "").trim();
  if (!to) return { ok: false, error: "This invoice has no client email — add one first." };

  const { data: lineData } = await supabaseAdmin
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });
  const lines = (lineData ?? []) as unknown as InvoiceLineRow[];

  const cfg = await getReceptionistConfig(agentId);
  const business = cfg.businessName?.trim() || "Your real estate agent";
  const cur = invoice.currency || "USD";

  const rowsHtml = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(l.description)}</td>` +
        `<td align="right" style="padding:8px;border-bottom:1px solid #eee">${esc(l.quantity)}</td>` +
        `<td align="right" style="padding:8px;border-bottom:1px solid #eee">${esc(formatMoney(Number(l.unit_price), cur))}</td>` +
        `<td align="right" style="padding:8px;border-bottom:1px solid #eee">${esc(formatMoney(Number(l.amount), cur))}</td></tr>`,
    )
    .join("");

  const totalsRow = (label: string, value: string, bold = false) =>
    `<tr><td colspan="2"></td><td align="right" style="padding:6px 8px;${bold ? "font-weight:700;border-top:2px solid #222" : "color:#555"}">${esc(label)}</td>` +
    `<td align="right" style="padding:6px 8px;${bold ? "font-weight:700;border-top:2px solid #222" : "color:#555"}">${esc(value)}</td></tr>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222">
    <h2 style="margin:0 0 4px">${esc(business)}</h2>
    <p style="margin:0 0 16px;color:#666">Invoice <strong>${esc(invoice.invoice_number)}</strong>${invoice.due_date ? ` &middot; Due ${esc(invoice.due_date)}` : ""}</p>
    <p style="margin:0 0 16px">Hi ${esc(invoice.client_name || "there")}, please find your invoice below.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="text-align:left;color:#888">
        <th style="padding:8px;border-bottom:2px solid #222">Description</th>
        <th align="right" style="padding:8px;border-bottom:2px solid #222">Qty</th>
        <th align="right" style="padding:8px;border-bottom:2px solid #222">Unit</th>
        <th align="right" style="padding:8px;border-bottom:2px solid #222">Amount</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        ${totalsRow("Subtotal", formatMoney(Number(invoice.subtotal), cur))}
        ${Number(invoice.tax_amount) > 0 ? totalsRow(`Tax (${(Number(invoice.tax_rate) * 100).toFixed(2)}%)`, formatMoney(Number(invoice.tax_amount), cur)) : ""}
        ${totalsRow("Total", formatMoney(Number(invoice.total), cur), true)}
      </tfoot>
    </table>
    ${invoice.payment_url ? `<p style="margin:20px 0"><a href="${esc(invoice.payment_url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">Pay ${esc(formatMoney(Number(invoice.total), cur))} online</a></p>` : ""}
    ${invoice.notes ? `<p style="margin:16px 0;color:#444;white-space:pre-wrap">${esc(invoice.notes)}</p>` : ""}
    <p style="margin:20px 0 0;color:#888;font-size:12px">Reply to this email with any questions. — ${esc(business)}</p>
  </div>`;

  const text =
    `Invoice ${invoice.invoice_number} from ${business}\n\n` +
    lines.map((l) => `${l.description} — ${l.quantity} x ${formatMoney(Number(l.unit_price), cur)} = ${formatMoney(Number(l.amount), cur)}`).join("\n") +
    `\n\nSubtotal: ${formatMoney(Number(invoice.subtotal), cur)}` +
    (Number(invoice.tax_amount) > 0 ? `\nTax: ${formatMoney(Number(invoice.tax_amount), cur)}` : "") +
    `\nTotal: ${formatMoney(Number(invoice.total), cur)}` +
    (invoice.due_date ? `\nDue: ${invoice.due_date}` : "") +
    (invoice.payment_url ? `\n\nPay online: ${invoice.payment_url}` : "") +
    (invoice.notes ? `\n\n${invoice.notes}` : "");

  // Attach a PDF copy of the invoice (best-effort — send without it if it fails).
  let pdf: Uint8Array | undefined;
  try {
    pdf = await renderInvoicePdf({
      business,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      clientName: invoice.client_name,
      clientEmail: invoice.client_email,
      currency: cur,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        amount: Number(l.amount),
      })),
      subtotal: Number(invoice.subtotal),
      taxRate: Number(invoice.tax_rate),
      taxAmount: Number(invoice.tax_amount),
      total: Number(invoice.total),
      notes: invoice.notes,
      paymentUrl: invoice.payment_url,
    });
  } catch (e) {
    console.error("[books] invoice PDF render failed (sending without attachment):", e);
  }

  let sendResult: { id?: string } | undefined;
  try {
    sendResult = await sendEmail({
      to,
      subject: `Invoice ${invoice.invoice_number} from ${business}`,
      html,
      text,
      replyTo: agentEmail || undefined,
      attachments: pdf
        ? [{ filename: `Invoice-${invoice.invoice_number}.pdf`, contentType: "application/pdf", content: pdf }]
        : undefined,
    });
  } catch (e) {
    console.error("[books] sendInvoiceEmail:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not send the email." };
  }
  // sendEmail returns undefined (silently) when RESEND_API_KEY isn't set — don't
  // mark the invoice sent in that case, so the status stays honest.
  if (!sendResult) {
    return { ok: false, error: "Email isn't configured on this account yet — the invoice was not sent." };
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("invoices")
    // Preserve the original send moment on a resend — sent_at is "when it first
    // went out"; last_sent_at moves forward every time (drives the chase cooldown).
    .update({ status: "sent", sent_at: invoice.sent_at ?? now, last_sent_at: now, updated_at: now } as never)
    .eq("id", id)
    .eq("agent_id", agentId as never);

  // CloseBoss activity feed (fire-and-forget — never fails the send).
  void logAssistantActivity({
    agentId: String(agentId),
    assistantType: "accountant",
    activityType: "invoice_sent",
    summary: `Sent invoice ${invoice.invoice_number}${invoice.client_name ? ` to ${invoice.client_name}` : ""}`,
    outcome: invoice.total != null ? `$${Math.round(Number(invoice.total)).toLocaleString()} now outstanding` : "Sent",
    relatedEntityType: "invoice",
    relatedEntityId: id,
  });

  return { ok: true };
}

/** Build a PDF for an invoice (agent-scoped) — used by the download endpoint. */
export async function buildInvoicePdf(
  id: string,
): Promise<{ pdf: Uint8Array; invoiceNumber: string } | null> {
  const { agentId } = await getCurrentAgentContext();
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("agent_id", agentId as never)
    .maybeSingle();
  if (!inv) return null;
  const invoice = inv as unknown as InvoiceRow;
  const { data: lineData } = await supabaseAdmin
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });
  const lines = (lineData ?? []) as unknown as InvoiceLineRow[];
  const cfg = await getReceptionistConfig(agentId);
  const business = cfg.businessName?.trim() || "Your real estate agent";

  const pdf = await renderInvoicePdf({
    business,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    clientName: invoice.client_name,
    clientEmail: invoice.client_email,
    currency: invoice.currency || "USD",
    lines: lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      amount: Number(l.amount),
    })),
    subtotal: Number(invoice.subtotal),
    taxRate: Number(invoice.tax_rate),
    taxAmount: Number(invoice.tax_amount),
    total: Number(invoice.total),
    notes: invoice.notes,
  });
  return { pdf, invoiceNumber: invoice.invoice_number };
}

const VALID_STATUS: InvoiceStatus[] = ["draft", "sent", "paid", "overdue", "void"];

/** Update an invoice's status (sets paid_at when moving to paid). Agent-scoped. */
export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!VALID_STATUS.includes(status)) return { ok: false, error: "Invalid status." };
  const { agentId } = await getCurrentAgentContext();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  patch.paid_at = status === "paid" ? new Date().toISOString() : null;
  // "Mark sent" (an invoice with no client email) still records a send time.
  if (status === "sent") {
    const nowIso = new Date().toISOString();
    patch.sent_at = nowIso;
    patch.last_sent_at = nowIso;
  }
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .update(patch as never)
    .eq("id", id)
    .eq("agent_id", agentId as never)
    .select("invoice_number, client_name, total")
    .maybeSingle();
  if (error) {
    console.error("[books] setInvoiceStatus:", error.message);
    return { ok: false, error: error.message };
  }

  // CloseBoss activity feed — a payment landing is the Accountant's
  // win condition; log it (fire-and-forget).
  if (status === "paid" && data) {
    const row = data as { invoice_number: string; client_name: string | null; total: number | null };
    void logAssistantActivity({
      agentId: String(agentId),
      assistantType: "accountant",
      activityType: "invoice_paid",
      summary: `Invoice ${row.invoice_number}${row.client_name ? ` from ${row.client_name}` : ""} was paid`,
      outcome: row.total != null ? `$${Math.round(Number(row.total)).toLocaleString()} collected` : "Paid",
      relatedEntityType: "invoice",
      relatedEntityId: id,
    });
  }
  return { ok: true };
}
