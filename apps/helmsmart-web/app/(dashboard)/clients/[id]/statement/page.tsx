/**
 * Print-friendly client account statement — /clients/[id]/statement
 *
 * Lists the client's invoices (excluding drafts/voids) with status and amount,
 * plus billed / paid / balance totals. Mirrors the invoice print page pattern:
 * a self-contained document with inline styles + a print button.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("clients");
  return { title: t("meta.statementTitle") };
}

function fmt(n: number, locale: string) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(iso: string, locale: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  paid: "#16a34a",
  overdue: "#dc2626",
  sent: "#2563eb",
};

export default async function ClientStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getServerT("clients"), getServerLocale()]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ data: client }, { data: org }, { data: invoices }] = await Promise.all([
    supabase
      .from("clients")
      .select("first_name, last_name, company, email, phone")
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

  if (!client) notFound();

  const clientName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") ||
    client.company ||
    t("detail.fallbackName");

  const today = new Date().toISOString().slice(0, 10);
  const rows = (invoices ?? []).map((inv) => ({
    ...inv,
    effectiveStatus: inv.status === "sent" && (inv.due_date as string) < today ? "overdue" : (inv.status as string),
  }));

  const totalBilled = rows.reduce((s, r) => s + Number(r.total), 0);
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.total), 0);
  const balanceDue = totalBilled - totalPaid;

  const statementDate = new Date().toLocaleDateString(intlLocale(locale), { month: "long", day: "numeric", year: "numeric" });

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{t("statement.documentTitle", { name: clientName })}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #fff; font-size: 13px; }
          .page { max-width: 720px; margin: 0 auto; padding: 48px; }
          .no-print { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 28px; border-bottom: 1px solid #e2e8f0; margin-bottom: 40px; }
          .no-print button { background: #1e88e5; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
          .no-print a { font-size: 13px; color: #64748b; text-decoration: none; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
          .org-name { font-size: 20px; font-weight: 700; color: #0f172a; }
          .title { font-size: 24px; font-weight: 800; color: #1e88e5; }
          .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 3px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 36px; padding-bottom: 28px; border-bottom: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; padding: 0 0 10px; border-bottom: 2px solid #e2e8f0; }
          th.r, td.r { text-align: right; }
          td { padding: 11px 0; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }
          .status { font-weight: 600; text-transform: capitalize; }
          .totals { display: flex; justify-content: flex-end; margin-top: 28px; }
          .totals-inner { width: 280px; }
          .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #64748b; }
          .totals-total { display: flex; justify-content: space-between; padding: 12px 0 0; margin-top: 8px; border-top: 2px solid #0f172a; font-size: 18px; font-weight: 800; color: #0f172a; }
          .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
          .empty { text-align: center; color: #94a3b8; padding: 48px 0; font-size: 14px; }
          @media print { .no-print { display: none !important; } body { font-size: 12px; } .page { padding: 0; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          <div className="no-print">
            <a href={`/clients/${id}`}>{t("statement.back")}</a>
            <PrintButton />
          </div>

          <div className="header">
            <div>
              <div className="org-name">{org?.name ?? "—"}</div>
              {org?.entity_type && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{org.entity_type}</div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label">{t("statement.label")}</div>
              <div className="title">{t("statement.title")}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{t("statement.asOf", { date: statementDate })}</div>
            </div>
          </div>

          <div className="meta-grid">
            <div>
              <div className="label">{t("statement.statementFor")}</div>
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
              <div className="label">{t("statement.balanceDue")}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: balanceDue > 0 ? "#dc2626" : "#16a34a", fontVariantNumeric: "tabular-nums" }}>
                {fmt(balanceDue, locale)}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="empty">{t("statement.empty")}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>{t("statement.columns.date")}</th>
                  <th style={{ width: "22%" }}>{t("statement.columns.invoice")}</th>
                  <th style={{ width: "18%" }}>{t("statement.columns.due")}</th>
                  <th style={{ width: "20%" }}>{t("statement.columns.status")}</th>
                  <th className="r" style={{ width: "24%" }}>{t("statement.columns.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.issue_date as string, locale)}</td>
                    <td style={{ fontFamily: "monospace" }}>{r.invoice_number}</td>
                    <td style={{ color: "#64748b" }}>{fmtDate(r.due_date as string, locale)}</td>
                    <td className="status" style={{ color: STATUS_COLOR[r.effectiveStatus] ?? "#64748b" }}>
                      {t(`invoiceStatus.${r.effectiveStatus}`, { defaultValue: r.effectiveStatus })}
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmt(Number(r.total), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {rows.length > 0 && (
            <div className="totals">
              <div className="totals-inner">
                <div className="totals-row">
                  <span>{t("statement.totalBilled")}</span>
                  <span>{fmt(totalBilled, locale)}</span>
                </div>
                <div className="totals-row">
                  <span>{t("statement.totalPaid")}</span>
                  <span style={{ color: "#16a34a" }}>−{fmt(totalPaid, locale)}</span>
                </div>
                <div className="totals-total">
                  <span>{t("statement.balanceDue")}</span>
                  <span>{fmt(balanceDue, locale)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="footer">
            {t("statement.footer", { org: org?.name ?? "", name: clientName, date: statementDate })}
          </div>
        </div>
      </body>
    </html>
  );
}
