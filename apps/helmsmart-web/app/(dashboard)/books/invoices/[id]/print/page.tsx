/**
 * Print-friendly invoice view — /books/invoices/[id]/print
 *
 * Opens in a new tab. User clicks "Print" or uses browser print-to-PDF.
 * No sidebar, no auth guards beyond the org cookie (same as detail page).
 *
 * TWO READERS, ON ONE PAGE. The document is the thing the CLIENT receives, so
 * every word inside it — and its `<html lang>` — comes from that client's
 * `preferred_language`, per `docs/i18n-design.md`. The toolbar above it is
 * `.no-print`: the owner is the only person who ever sees it, so it speaks the
 * owner's UI locale like the rest of Books.
 *
 * That split is why `getServerLocale()` cannot serve this page on its own. The
 * request belongs to the OWNER — they clicked Print — so using it for the
 * document would hand an English-speaking client a Chinese invoice the moment
 * their contractor switched the dashboard to Chinese. This route was exempt
 * from `routeCoverage` on the reasoning that a customer document is
 * "deliberately English"; the design doc says the opposite, that it follows the
 * contact. Being English was the bug, not the policy.
 *
 * Money is the one thing that does NOT follow the reader: the amount is in the
 * org's own currency, because relabelling a Canadian total as dollars for a
 * Spanish-speaking client is a lie about the amount rather than a translation
 * of it. Same rule as `/pay/[id]`.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { translatorFor } from "@/lib/i18n/translator";
import { contactLocale } from "@/lib/i18n/contactLocale";
import { orgCurrency } from "@/lib/books-currency";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  // The tab title belongs to the owner's browser, not to the document.
  const t = await getServerT("books");
  return { title: t("invoices.printToolbar.print") };
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ data: inv }, { data: org }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`
        *,
        clients(first_name, last_name, company, email, phone, preferred_language),
        invoice_lines(id, description, quantity, unit_price, amount, sort_order)
      `)
      .eq("id", id)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("organizations")
      .select("name, entity_type")
      .eq("id", orgId)
      .single(),
  ]);

  if (!inv) notFound();

  const clientRaw = inv.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    first_name: string | null; last_name: string | null;
    company: string | null; email: string | null; phone: string | null;
    preferred_language: string | null;
  } | null;

  const linesRaw = Array.isArray(inv.invoice_lines) ? inv.invoice_lines : [];
  const lines = (linesRaw as {
    id: string; description: string; quantity: number;
    unit_price: number; amount: number; sort_order: number;
  }[]).sort((a, b) => a.sort_order - b.sort_order);

  // The document speaks the client's language; the toolbar speaks the owner's.
  // `coerceContactLocale` maps the stored "en" | "es" | "zh" onto app locales —
  // a bare "zh" resolves to nothing and would render English at a Chinese reader.
  const docLocale = contactLocale(client?.preferred_language) ?? DEFAULT_LOCALE;
  const doc = translatorFor(docLocale, "public");
  const [owner, currency] = await Promise.all([getServerT("books"), orgCurrency(orgId)]);

  const fmt = moneyFormatter(docLocale, currency);
  const fmtDate = dateFormatter(docLocale, { month: "long", day: "numeric", year: "numeric" });

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || "—"
    : "—";

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = inv.status === "sent" && inv.due_date < today;

  return (
    <html lang={docLocale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{doc("invoice.documentTitle", { number: inv.invoice_number })}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #0f172a;
            background: #fff;
            font-size: 13px;
          }
          .page {
            max-width: 720px;
            margin: 0 auto;
            padding: 48px 48px;
          }
          .no-print {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0 28px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 40px;
          }
          .no-print button {
            background: #1e88e5;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 9px 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
          }
          .no-print a {
            font-size: 13px;
            color: #64748b;
            text-decoration: none;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
          }
          .org-name { font-size: 20px; font-weight: 700; color: #0f172a; }
          .inv-num  { font-size: 28px; font-weight: 800; color: #1e88e5; font-variant-numeric: tabular-nums; }
          .label    { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 3px; }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 40px;
            padding-bottom: 32px;
            border-bottom: 1px solid #e2e8f0;
          }
          .dates { display: flex; gap: 32px; }
          .date-block {}
          .date-val { font-size: 14px; color: #334155; }
          .overdue-val { color: #dc2626; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; }
          th {
            text-align: left; font-size: 10px; font-weight: 600;
            text-transform: uppercase; letter-spacing: .06em;
            color: #94a3b8; padding: 0 0 10px; border-bottom: 2px solid #e2e8f0;
          }
          th.r, td.r { text-align: right; }
          td {
            padding: 11px 0;
            font-size: 13px;
            color: #334155;
            border-bottom: 1px solid #f1f5f9;
          }
          .totals {
            display: flex;
            justify-content: flex-end;
            margin-top: 24px;
          }
          .totals-inner { width: 260px; }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            font-size: 13px;
            color: #64748b;
          }
          .totals-total {
            display: flex;
            justify-content: space-between;
            padding: 12px 0 0;
            margin-top: 8px;
            border-top: 2px solid #0f172a;
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          .notes {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
          }
          .notes p { font-size: 13px; color: #64748b; margin-top: 6px; white-space: pre-wrap; }
          .footer {
            margin-top: 48px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
          }
          .paid-stamp {
            display: inline-block;
            border: 3px solid #16a34a;
            color: #16a34a;
            font-size: 20px;
            font-weight: 800;
            letter-spacing: .12em;
            padding: 4px 12px;
            border-radius: 4px;
            transform: rotate(-8deg);
            opacity: .7;
          }
          @media print {
            .no-print { display: none !important; }
            body { font-size: 12px; }
            .page { padding: 0; }
          }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Print toolbar */}
          <div className="no-print">
            <a href={`/books/invoices/${id}`}>{owner("invoices.printToolbar.back")}</a>
            <PrintButton label={owner("invoices.printToolbar.print")} />
          </div>

          {/* Header */}
          <div className="header">
            <div>
              <div className="org-name">{org?.name ?? "—"}</div>
              {org?.entity_type && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{org.entity_type}</div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label">{doc("invoice.label")}</div>
              <div className="inv-num">{inv.invoice_number}</div>
              {inv.status === "paid" && (
                <div style={{ marginTop: 8 }}>
                  <span className="paid-stamp">{doc("invoice.paid")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Meta: Bill to + Dates */}
          <div className="meta-grid">
            <div>
              <div className="label">{doc("invoice.billTo")}</div>
              <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{clientName}</div>
                {client?.email && <div style={{ color: "#64748b" }}>{client.email}</div>}
                {client?.phone && <div style={{ color: "#64748b" }}>{client.phone}</div>}
              </div>
            </div>
            <div>
              <div className="dates">
                <div className="date-block">
                  <div className="label">{doc("invoice.issueDate")}</div>
                  <div className="date-val">{fmtDate(inv.issue_date)}</div>
                </div>
                <div className="date-block">
                  <div className="label">{doc("invoice.dueDate")}</div>
                  <div className={`date-val ${isOverdue ? "overdue-val" : ""}`}>
                    {fmtDate(inv.due_date)}
                  </div>
                </div>
              </div>
              {inv.paid_at && (
                <div style={{ marginTop: 12 }}>
                  <div className="label">{doc("invoice.paidOn")}</div>
                  <div className="date-val" style={{ color: "#16a34a" }}>
                    {fmtDate(new Date(inv.paid_at))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <table>
            <thead>
              <tr>
                <th style={{ width: "50%" }}>{doc("invoice.description")}</th>
                <th className="r" style={{ width: "12%" }}>{doc("invoice.qty")}</th>
                <th className="r" style={{ width: "19%" }}>{doc("invoice.unitPrice")}</th>
                <th className="r" style={{ width: "19%" }}>{doc("invoice.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td className="r" style={{ color: "#64748b" }}>{line.quantity}</td>
                  <td className="r" style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{fmt(line.unit_price)}</td>
                  <td className="r" style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals">
            <div className="totals-inner">
              <div className="totals-row">
                <span>{doc("invoice.subtotal")}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(Number(inv.subtotal))}</span>
              </div>
              {Number(inv.tax_rate) > 0 && (
                <div className="totals-row">
                  <span>{doc("invoice.tax", { rate: (Number(inv.tax_rate) * 100).toFixed(2) })}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(Number(inv.tax_amount))}</span>
                </div>
              )}
              <div className="totals-total">
                <span>{doc("invoice.total")}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(Number(inv.total))}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {inv.notes && (
            <div className="notes">
              <div className="label">{doc("invoice.notes")}</div>
              <p>{inv.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="footer">
            {doc("invoice.footer", {
              org: org?.name ?? "",
              number: inv.invoice_number,
              date: fmtDate(new Date().toISOString().slice(0, 10)),
            })}
          </div>
        </div>
      </body>
    </html>
  );
}
