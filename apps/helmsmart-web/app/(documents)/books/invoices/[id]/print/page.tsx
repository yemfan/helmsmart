/**
 * Print-friendly invoice view — /books/invoices/[id]/print
 *
 * Opens in a new tab. User clicks "Print" or uses browser print-to-PDF.
 * No sidebar, no auth guards beyond the org cookie (same as detail page) —
 * `proxy.ts` gates `/books` by URL, so living outside `(dashboard)` changes
 * nothing about who can open it.
 *
 * WHY `(documents)`, NOT `(dashboard)`. This page used to sit in `(dashboard)`
 * and return its own `<html>`, `<head>` and `<body>`. But the root layout
 * already renders `<html>`, and the dashboard layout wraps every page in the
 * sidebar and a `<main>` — so the invoice arrived as a second `<html>` nested
 * inside `<main>`, which is not a document React can hydrate. Production threw
 * React #418, the invoice existed only in the RSC payload, and `<main>` had
 * no children: a blank page in every language. `(documents)` has no layout of
 * its own, so this renders straight into the root layout's `<body>` with
 * nothing around it.
 *
 * TWO READERS, ON ONE PAGE. The document is the thing the CLIENT receives, so
 * every word inside it — and its `lang` — comes from that client's
 * `preferred_language`, per `docs/i18n-design.md`. The toolbar above it is
 * `.no-print`: the owner is the only person who ever sees it, so it speaks the
 * owner's UI locale like the rest of Books, and inherits the owner's
 * `<html lang>` from the root layout. The document's language is declared on
 * the `<article>`, which is where it is true.
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
import { cache } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { translatorFor } from "@/lib/i18n/translator";
import { contactLocale } from "@/lib/i18n/contactLocale";
import { orgCurrency } from "@/lib/books-currency";
import { orgTimezone } from "@/lib/org-timezone";
import { calendarDate } from "@/lib/org-date";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { PrintButton } from "./print-button";

/** One read per request, shared by the title and the page. */
const loadInvoice = cache(async (id: string) => {
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

  const clientRaw = inv?.clients;
  const client = ((Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) ?? null) as {
    first_name: string | null; last_name: string | null;
    company: string | null; email: string | null; phone: string | null;
    preferred_language: string | null;
  } | null;

  // The document speaks the client's language; the toolbar speaks the owner's.
  // `coerceContactLocale` maps the stored "en" | "es" | "zh" onto app locales —
  // a bare "zh" resolves to nothing and would render English at a Chinese reader.
  const docLocale = contactLocale(client?.preferred_language) ?? DEFAULT_LOCALE;

  return { orgId, inv, org, client, docLocale };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { inv, docLocale } = await loadInvoice(id);
  if (!inv) return {};
  // The title belongs to the document, not the dashboard: print-to-PDF names
  // the file after it, and that file goes to the client. So it is in their
  // language, and `absolute` keeps the product's suffix off an invoice that is
  // the org's, not ours.
  const doc = translatorFor(docLocale, "public");
  return { title: { absolute: doc("invoice.documentTitle", { number: inv.invoice_number }) } };
}

const STYLES = `
  .invoice-doc {
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: 13px;
  }
  :where(.invoice-doc *) { box-sizing: border-box; margin: 0; padding: 0; }
  .invoice-doc .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 48px;
  }
  .invoice-doc .no-print {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0 28px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 40px;
  }
  .invoice-doc .no-print button {
    background: #1e88e5;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .invoice-doc .no-print a {
    font-size: 13px;
    color: #64748b;
    text-decoration: none;
  }
  .invoice-doc .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 40px;
  }
  .invoice-doc .org-name { font-size: 20px; font-weight: 700; color: #0f172a; }
  .invoice-doc .inv-num  { font-size: 28px; font-weight: 800; color: #1e88e5; font-variant-numeric: tabular-nums; }
  .invoice-doc .label    { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 3px; }
  .invoice-doc .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 40px;
    padding-bottom: 32px;
    border-bottom: 1px solid #e2e8f0;
  }
  .invoice-doc .dates { display: flex; gap: 32px; }
  .invoice-doc .date-val { font-size: 14px; color: #334155; }
  .invoice-doc .overdue-val { color: #dc2626; font-weight: 600; }
  .invoice-doc table { width: 100%; border-collapse: collapse; }
  .invoice-doc th {
    text-align: left; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .06em;
    color: #94a3b8; padding: 0 0 10px; border-bottom: 2px solid #e2e8f0;
  }
  .invoice-doc th.r, .invoice-doc td.r { text-align: right; }
  .invoice-doc td {
    padding: 11px 0;
    font-size: 13px;
    color: #334155;
    border-bottom: 1px solid #f1f5f9;
  }
  .invoice-doc .totals {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
  }
  .invoice-doc .totals-inner { width: 260px; }
  .invoice-doc .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: 13px;
    color: #64748b;
  }
  .invoice-doc .totals-total {
    display: flex;
    justify-content: space-between;
    padding: 12px 0 0;
    margin-top: 8px;
    border-top: 2px solid #0f172a;
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
  }
  .invoice-doc .notes {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #e2e8f0;
  }
  .invoice-doc .notes p { font-size: 13px; color: #64748b; margin-top: 6px; white-space: pre-wrap; }
  .invoice-doc .footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 11px;
    color: #94a3b8;
  }
  .invoice-doc .paid-stamp {
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
  /* On a phone the document narrows and the line table scrolls inside itself. */
  .invoice-doc .table-wrap { overflow-x: auto; }
  .invoice-doc .table-wrap table { min-width: 420px; }
  @media screen and (max-width: 640px) {
    .invoice-doc .page { padding: 24px 16px; }
    .invoice-doc .header { flex-wrap: wrap; gap: 16px; }
    .invoice-doc .meta-grid { grid-template-columns: 1fr; }
    .invoice-doc .dates { flex-wrap: wrap; gap: 16px; }
  }
  @media print {
    .invoice-doc .no-print { display: none !important; }
    .invoice-doc { min-height: 0; font-size: 12px; }
    .invoice-doc .page { padding: 0; }
  }
`;

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, inv, org, client, docLocale } = await loadInvoice(id);

  if (!inv) notFound();

  const linesRaw = Array.isArray(inv.invoice_lines) ? inv.invoice_lines : [];
  const lines = (linesRaw as {
    id: string; description: string; quantity: number;
    unit_price: number; amount: number; sort_order: number;
  }[]).sort((a, b) => a.sort_order - b.sort_order);

  const doc = translatorFor(docLocale, "public");
  const [owner, currency] = await Promise.all([getServerT("books"), orgCurrency(orgId)]);

  const fmt = moneyFormatter(docLocale, currency);
  const fmtDate = dateFormatter(docLocale, { month: "long", day: "numeric", year: "numeric" });

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || "—"
    : "—";

  // Both dates below are the BUSINESS's, never UTC. `issue_date` and `due_date`
  // are date columns and carry their own day, but `paid_at` is an instant: a
  // payment taken at 5 PM Pacific is 00:00 UTC the next day, and printing that
  // on the invoice tells the client they paid a day after they did.
  const tz = await orgTimezone(orgId);
  const today = calendarDate(tz);
  const isOverdue = inv.status === "sent" && inv.due_date < today;

  // These styles share `<body>` with the root layout now, so every rule is
  // scoped to the page: a bare `body {}` loses to the layout's Tailwind classes,
  // and a bare `*` reset would outrank nothing but still reach everything.
  return (
    <main id="main-content" className="invoice-doc">
      <style>{STYLES}</style>
      <div className="page">
        {/* Print toolbar — the owner's, in the owner's language */}
        <div className="no-print">
          <a href={`/books/invoices/${id}`}>{owner("invoices.printToolbar.back")}</a>
          <PrintButton />
        </div>

        <article lang={docLocale}>
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
                <div>
                  <div className="label">{doc("invoice.issueDate")}</div>
                  <div className="date-val">{fmtDate(inv.issue_date)}</div>
                </div>
                <div>
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
                    {fmtDate(calendarDate(tz, new Date(inv.paid_at)))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="table-wrap">
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
          </div>

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
              date: fmtDate(today),
            })}
          </div>
        </article>
      </div>
    </main>
  );
}
