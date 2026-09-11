/**
 * Print-friendly client account statement — /clients/[id]/statement
 *
 * Lists the client's invoices (excluding drafts/voids) with status and amount,
 * plus billed / paid / balance totals. Mirrors the invoice print page, including
 * why it lives in `(documents)` rather than `(dashboard)`: it used to return its
 * own `<html>` from inside the dashboard's `<main>`, and rendered blank.
 *
 * Same two readers as the invoice, too. The statement is what the CLIENT
 * receives, so it follows their `preferred_language` — it used to take the
 * owner's locale for the whole page, which handed an English-speaking client a
 * Chinese statement whenever their contractor read the dashboard in Chinese.
 * The `.no-print` toolbar is the owner's and stays in the owner's locale. Money
 * is in the org's own currency, not the reader's, as on the invoice.
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
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { PrintButton } from "./print-button";

/** One read per request, shared by the title and the page. */
const loadStatement = cache(async (id: string) => {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ data: client }, { data: org }, { data: invoices }] = await Promise.all([
    supabase
      .from("clients")
      .select("first_name, last_name, company, email, phone, preferred_language")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single(),
    supabase.from("organizations").select("name, entity_type").eq("id", orgId).single(),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, paid_at")
      .eq("client_id", id)
      .eq("organization_id", orgId)
      .in("status", ["sent", "paid", "overdue"])
      .order("issue_date", { ascending: true }),
  ]);

  const docLocale = contactLocale(client?.preferred_language) ?? DEFAULT_LOCALE;
  const doc = translatorFor(docLocale, "public");
  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
      client.company ||
      doc("statement.fallbackName")
    : "";

  return { orgId, client, org, invoices, docLocale, doc, clientName };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { client, doc, clientName } = await loadStatement(id);
  if (!client) return {};
  // The document's title, in the client's language and without the product
  // suffix — print-to-PDF names the file after it. See the invoice page.
  return { title: { absolute: doc("statement.documentTitle", { name: clientName }) } };
}

const STATUS_COLOR: Record<string, string> = {
  paid: "#16a34a",
  overdue: "#dc2626",
  sent: "#2563eb",
};

// Scoped to the page because it shares `<body>` with the root layout.
const STYLES = `
  .statement-doc { min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #fff; font-size: 13px; }
  :where(.statement-doc *) { box-sizing: border-box; margin: 0; padding: 0; }
  .statement-doc .page { max-width: 720px; margin: 0 auto; padding: 48px; }
  .statement-doc .no-print { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 28px; border-bottom: 1px solid #e2e8f0; margin-bottom: 40px; }
  .statement-doc .no-print button { background: #1e88e5; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .statement-doc .no-print a { font-size: 13px; color: #64748b; text-decoration: none; }
  .statement-doc .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .statement-doc .org-name { font-size: 20px; font-weight: 700; color: #0f172a; }
  .statement-doc .title { font-size: 24px; font-weight: 800; color: #1e88e5; }
  .statement-doc .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 3px; }
  .statement-doc .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 36px; padding-bottom: 28px; border-bottom: 1px solid #e2e8f0; }
  .statement-doc table { width: 100%; border-collapse: collapse; }
  .statement-doc th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; padding: 0 0 10px; border-bottom: 2px solid #e2e8f0; }
  .statement-doc th.r, .statement-doc td.r { text-align: right; }
  .statement-doc td { padding: 11px 0; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }
  .statement-doc .status { font-weight: 600; text-transform: capitalize; }
  .statement-doc .totals { display: flex; justify-content: flex-end; margin-top: 28px; }
  .statement-doc .totals-inner { width: 280px; }
  .statement-doc .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #64748b; }
  .statement-doc .totals-total { display: flex; justify-content: space-between; padding: 12px 0 0; margin-top: 8px; border-top: 2px solid #0f172a; font-size: 18px; font-weight: 800; color: #0f172a; }
  .statement-doc .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
  .statement-doc .empty { text-align: center; color: #94a3b8; padding: 48px 0; font-size: 14px; }
  /* On a phone the document narrows and the invoice table scrolls inside itself. */
  .statement-doc .table-wrap { overflow-x: auto; }
  .statement-doc .table-wrap table { min-width: 460px; }
  @media screen and (max-width: 640px) {
    .statement-doc .page { padding: 24px 16px; }
    .statement-doc .header { flex-wrap: wrap; gap: 16px; }
    .statement-doc .meta-grid { grid-template-columns: 1fr; }
    .statement-doc .totals-inner { width: 100%; max-width: 280px; }
  }
  @media print { .statement-doc .no-print { display: none !important; } .statement-doc { min-height: 0; font-size: 12px; } .statement-doc .page { padding: 0; } }
`;

export default async function ClientStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, client, org, invoices, docLocale, doc, clientName } = await loadStatement(id);

  if (!client) notFound();

  const [owner, currency] = await Promise.all([getServerT("clients"), orgCurrency(orgId)]);
  const fmt = moneyFormatter(docLocale, currency);
  const fmtDate = dateFormatter(docLocale, { month: "short", day: "numeric", year: "numeric" });

  const today = new Date().toISOString().slice(0, 10);
  const rows = (invoices ?? []).map((inv) => ({
    ...inv,
    effectiveStatus: inv.status === "sent" && (inv.due_date as string) < today ? "overdue" : (inv.status as string),
  }));

  const totalBilled = rows.reduce((s, r) => s + Number(r.total), 0);
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.total), 0);
  const balanceDue = totalBilled - totalPaid;

  const statementDate = dateFormatter(docLocale, { month: "long", day: "numeric", year: "numeric" })(new Date());

  return (
    <main id="main-content" className="statement-doc">
      <style>{STYLES}</style>
      <div className="page">
        {/* Toolbar — the owner's, in the owner's language */}
        <div className="no-print">
          <a href={`/clients/${id}`}>{owner("statement.back")}</a>
          <PrintButton />
        </div>

        <article lang={docLocale}>
          <div className="header">
            <div>
              <div className="org-name">{org?.name ?? "—"}</div>
              {org?.entity_type && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{org.entity_type}</div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label">{doc("statement.label")}</div>
              <div className="title">{doc("statement.title")}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{doc("statement.asOf", { date: statementDate })}</div>
            </div>
          </div>

          <div className="meta-grid">
            <div>
              <div className="label">{doc("statement.statementFor")}</div>
              <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{clientName}</div>
                {client.company && [client.first_name, client.last_name].filter(Boolean).length > 0 && (
                  <div style={{ color: "#64748b" }}>{client.company}</div>
                )}
                {client.email && <div style={{ color: "#64748b" }}>{client.email}</div>}
                {client.phone && <div style={{ color: "#64748b" }}>{client.phone}</div>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label">{doc("statement.balanceDue")}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: balanceDue > 0 ? "#dc2626" : "#16a34a", fontVariantNumeric: "tabular-nums" }}>
                {fmt(balanceDue)}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="empty">{doc("statement.empty")}</div>
          ) : (
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>{doc("statement.columns.date")}</th>
                  <th style={{ width: "22%" }}>{doc("statement.columns.invoice")}</th>
                  <th style={{ width: "18%" }}>{doc("statement.columns.due")}</th>
                  <th style={{ width: "20%" }}>{doc("statement.columns.status")}</th>
                  <th className="r" style={{ width: "24%" }}>{doc("statement.columns.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.issue_date as string)}</td>
                    <td style={{ fontFamily: "monospace" }}>{r.invoice_number}</td>
                    <td style={{ color: "#64748b" }}>{fmtDate(r.due_date as string)}</td>
                    <td className="status" style={{ color: STATUS_COLOR[r.effectiveStatus] ?? "#64748b" }}>
                      {doc(`statement.status.${r.effectiveStatus}`, { defaultValue: r.effectiveStatus })}
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmt(Number(r.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="totals">
              <div className="totals-inner">
                <div className="totals-row">
                  <span>{doc("statement.totalBilled")}</span>
                  <span>{fmt(totalBilled)}</span>
                </div>
                <div className="totals-row">
                  <span>{doc("statement.totalPaid")}</span>
                  <span style={{ color: "#16a34a" }}>−{fmt(totalPaid)}</span>
                </div>
                <div className="totals-total">
                  <span>{doc("statement.balanceDue")}</span>
                  <span>{fmt(balanceDue)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="footer">
            {doc("statement.footer", { org: org?.name ?? "", name: clientName, date: statementDate })}
          </div>
        </article>
      </div>
    </main>
  );
}
