"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  insertEstimateWithLines,
  setEstimateStatus as setEstimateStatusFinance,
  convertEstimateToInvoice as convertEstimateToInvoiceFinance,
} from "@helm/dna-finance";
import { maybeTrigerEstimateWorkflow } from "@/lib/integrations/workflow-triggers";
import { checkActionPermission } from "@/components/role-guard";
import { sendEmail } from "@/lib/email";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EstimateLine {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order?: number;
}

// ─── Create estimate ──────────────────────────────────────────────────────────

export async function createEstimate(data: {
  clientId: string | null;
  expiryDate: string;
  taxRate: number;
  notes: string;
  lines: EstimateLine[];
}) {
  const denied = await checkActionPermission("invoices.write");
  if (denied) throw new Error(denied.error);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  const id = await insertEstimateWithLines(supabase, orgId, data);

  // Compute total for workflow threshold check
  const total = data.lines.reduce((s, l) => s + l.amount, 0);
  const taxAmount = total * (data.taxRate / 100);
  const grandTotal = total + taxAmount;

  // Auto-trigger any configured approval workflows (fire-and-forget)
  void maybeTrigerEstimateWorkflow(
    orgId,
    id,
    grandTotal,
    `Estimate — ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(grandTotal)}`,
    { total: grandTotal, clientId: data.clientId }
  );

  revalidatePath("/books/estimates");
  return id;
}

// ─── Send estimate ────────────────────────────────────────────────────────────

export async function sendEstimate(estimateId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  const { data: est } = await supabase
    .from("estimates")
    .select(`
      *,
      clients(first_name, last_name, email),
      estimate_lines(description, quantity, unit_price, amount, sort_order),
      organizations(name)
    `)
    .eq("id", estimateId)
    .eq("organization_id", orgId)
    .single();

  if (!est) throw new Error("Estimate not found");

  const clientRaw = est.clients as {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
  if (!client?.email) throw new Error("Client has no email address");

  const clientName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") || "there";

  const lines = (
    Array.isArray(est.estimate_lines) ? est.estimate_lines : []
  ) as EstimateLine[];
  const sortedLines = [...lines].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const orgRaw = est.organizations;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    name: string;
  } | null;
  const orgName = org?.name ?? "Us";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const acceptUrl = `${appUrl}/accept/${estimateId}`;

  // HTML email
  const htmlLineRows = sortedLines
    .map(
      (l) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-size:14px">${l.description}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;text-align:center">${l.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px;text-align:right">$${Number(l.unit_price).toFixed(2)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;text-align:right;font-weight:600">$${Number(l.amount).toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const expiryFormatted = new Date(
    est.expiry_date + "T00:00:00"
  ).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="background:#0f172a;padding:28px 40px">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:22px;font-weight:700;color:#fff">${est.estimate_number}</div>
              <div style="font-size:13px;color:#94a3b8;margin-top:2px">Estimate from ${orgName}</div>
            </td>
            <td align="right">
              <div style="font-size:28px;font-weight:700;color:#fff">$${Number(est.total).toFixed(2)}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px">Valid until ${expiryFormatted}</div>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:32px 40px 0">
          <p style="margin:0;font-size:15px;color:#334155">Hi ${clientName},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b">Please find your estimate below. Click the button to accept or request changes.</p>
        </td></tr>

        <tr><td style="padding:24px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <thead><tr style="border-bottom:2px solid #e2e8f0">
              <th style="padding:0 0 8px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Description</th>
              <th style="padding:0 0 8px;text-align:center;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Qty</th>
              <th style="padding:0 0 8px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Price</th>
              <th style="padding:0 0 8px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">Amount</th>
            </tr></thead>
            <tbody>${htmlLineRows}</tbody>
          </table>
        </td></tr>

        <tr><td style="padding:16px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="right">
            <table cellpadding="0" cellspacing="0" style="width:220px">
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0">Subtotal</td>
                <td style="font-size:13px;color:#334155;text-align:right;padding:4px 0">$${Number(est.subtotal).toFixed(2)}</td>
              </tr>
              ${Number(est.tax_rate) > 0 ? `<tr><td style="font-size:13px;color:#64748b;padding:4px 0">Tax (${(Number(est.tax_rate) * 100).toFixed(0)}%)</td><td style="font-size:13px;color:#334155;text-align:right;padding:4px 0">$${Number(est.tax_amount).toFixed(2)}</td></tr>` : ""}
              <tr style="border-top:2px solid #e2e8f0">
                <td style="font-size:15px;font-weight:700;color:#0f172a;padding:10px 0 0">Total</td>
                <td style="font-size:15px;font-weight:700;color:#0f172a;text-align:right;padding:10px 0 0">$${Number(est.total).toFixed(2)}</td>
              </tr>
            </table>
          </td></tr></table>
        </td></tr>

        ${est.notes ? `<tr><td style="padding:20px 40px 0"><p style="margin:0;font-size:13px;color:#64748b"><strong style="color:#334155">Notes:</strong> ${est.notes}</p></td></tr>` : ""}

        <tr><td style="padding:32px 40px">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:10px">Review &amp; Accept Estimate →</a>
          </td></tr></table>
        </td></tr>

        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">This estimate is valid until ${expiryFormatted} · ${est.estimate_number}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const plainText = `Hi ${clientName},\n\nEstimate ${est.estimate_number} — $${Number(est.total).toFixed(2)}, valid until ${est.expiry_date}\n\nReview and accept: ${acceptUrl}\n\nThank you!`;

  // Throws if Resend rejects the send, so the estimate's "sent" status
  // below is only written for mail that left.
  await sendEmail({
    to: client.email,
    subject: `Estimate ${est.estimate_number} — $${Number(est.total).toFixed(2)}`,
    html,
    text: plainText,
  });

  await supabase
    .from("estimates")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", estimateId);

  revalidatePath("/books/estimates");
  revalidatePath(`/books/estimates/${estimateId}`);
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function setEstimateStatus(
  estimateId: string,
  status: "accepted" | "declined" | "expired"
) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  await setEstimateStatusFinance(supabase, orgId, estimateId, status);

  revalidatePath("/books/estimates");
  revalidatePath(`/books/estimates/${estimateId}`);
}

// ─── Convert to invoice ───────────────────────────────────────────────────────

export async function convertEstimateToInvoice(
  estimateId: string
): Promise<string> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();
  const { invoiceId } = await convertEstimateToInvoiceFinance(
    supabase,
    orgId,
    estimateId
  );

  revalidatePath("/books/estimates");
  revalidatePath(`/books/estimates/${estimateId}`);
  revalidatePath("/books/invoices");

  return invoiceId;
}

// ─── Convert to project ───────────────────────────────────────────────────────
// Spins up a delivery project from a won estimate: budget = estimate total,
// same client, name from the first line item. Idempotent — returns the existing
// project id if the estimate was already converted.

export async function convertEstimateToProject(
  estimateId: string
): Promise<string> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  const { data: est } = await supabase
    .from("estimates")
    .select("*, estimate_lines(description, sort_order)")
    .eq("id", estimateId)
    .eq("organization_id", orgId)
    .single();

  if (!est) throw new Error("Estimate not found");
  if (est.converted_project_id) return est.converted_project_id as string;

  const lines = (
    Array.isArray(est.estimate_lines) ? est.estimate_lines : []
  ) as { description: string; sort_order: number }[];
  const firstLine = [...lines].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )[0];
  const projectName = (
    firstLine?.description?.trim() || `Project ${est.estimate_number}`
  ).slice(0, 120);

  const { data: proj, error } = await supabase
    .from("projects")
    .insert({
      organization_id: orgId,
      client_id: est.client_id,
      name: projectName,
      description: est.notes ?? null,
      status: "active",
      color: "indigo",
      budget_amount: est.total,
    })
    .select("id")
    .single();

  if (error || !proj) throw new Error(error?.message ?? "Failed to create project");

  await supabase
    .from("estimates")
    .update({
      status: "accepted",
      converted_project_id: proj.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", estimateId)
    .eq("organization_id", orgId);

  revalidatePath("/books/estimates");
  revalidatePath(`/books/estimates/${estimateId}`);
  revalidatePath("/projects");

  return proj.id;
}

// ─── AI estimate drafter (Week 53) ────────────────────────────────────────────

export interface GeneratedEstimate {
  lines: { description: string; quantity: number; unit_price: number }[];
  note: string;
}

function parseEstimate(raw: string): GeneratedEstimate {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(t) as { lines?: unknown; note?: unknown };
    const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
    const lines = rawLines
      .map((l) => {
        const o = l as { description?: unknown; quantity?: unknown; unit_price?: unknown };
        return {
          description: String(o.description ?? "").trim(),
          quantity: Number(o.quantity) || 1,
          unit_price: Number(o.unit_price) || 0,
        };
      })
      .filter((l) => l.description);
    return { lines, note: String(obj.note ?? "").trim() };
  } catch {
    return { lines: [], note: "" };
  }
}

export async function generateEstimateLines(input: { prompt: string }): Promise<GeneratedEstimate> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");
  if (!input.prompt.trim()) throw new Error("Describe the job to estimate");

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = org?.name ?? "our business";

  const prompt = `You are preparing a price estimate for the business "${orgName}".
Job description: ${input.prompt}

Produce a clear, itemized estimate. Respond with ONLY a JSON object — no markdown, no commentary:
{"lines":[{"description":"...","quantity":1,"unit_price":0}],"note":"..."}

Rules:
- 1–8 line items. Each has a short description, a quantity (number), and a unit_price in USD (number, no currency symbol).
- Price realistically for a US small business; round to sensible amounts.
- "note" is a brief one-sentence scope/assumptions caption (or an empty string).
- quantity and unit_price MUST be plain numbers — no strings, no "$".`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text ?? "";
  const parsed = parseEstimate(text);
  if (!parsed.lines.length) throw new Error("Couldn't draft an estimate — try adding more detail");
  return parsed;
}
