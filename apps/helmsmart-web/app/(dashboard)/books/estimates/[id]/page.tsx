import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { dateFormatter, moneyFormatter, numberFormatter } from "@/lib/books-format";
import { orgCurrency } from "@/lib/books-currency";
import { EstimateActions } from "./estimate-actions";
import {
  ArrowLeft, Building2, Mail, FileSignature,
  CheckCircle2, Send, XCircle, Clock, FileText, FolderOpen,
} from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("estimates.meta.detail") };
}

// Colour and icon per status; the LABEL lives in the bundle under
// `estimates.status.<status>`, so every enum value is translated in one place.
const STATUS_CONFIG = {
  draft:    { color: "bg-slate-100 text-slate-600",     icon: FileSignature },
  sent:     { color: "bg-blue-100 text-blue-700",       icon: Send },
  accepted: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  declined: { color: "bg-rose-100 text-rose-700",       icon: XCircle },
  expired:  { color: "bg-amber-100 text-amber-700",     icon: Clock },
} as const;

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const currency = await orgCurrency(orgId);
  const fmt = moneyFormatter(locale, currency);
  const num = numberFormatter(locale);
  const fmtDate = dateFormatter(locale, { month: "long", day: "numeric", year: "numeric" });
  const fmtShortDate = dateFormatter(locale, { month: "short", day: "numeric", year: "numeric" });
  const supabase = await createClient();

  const { data: est } = await supabase
    .from("estimates")
    .select(`
      *,
      clients(id, first_name, last_name, company, email),
      estimate_lines(id, description, quantity, unit_price, amount, sort_order),
      organizations(name)
    `)
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (!est) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const effectiveStatus =
    est.status === "sent" && est.expiry_date < today
      ? "expired"
      : (est.status as keyof typeof STATUS_CONFIG);

  const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;

  const clientRaw = est.clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    email: string | null;
  } | null;

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
      client.company ||
      t("estimates.detail.unknownClient")
    : t("estimates.detail.noClient");

  const lines = (
    Array.isArray(est.estimate_lines) ? est.estimate_lines : []
  ) as {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    sort_order: number;
  }[];

  const sortedLines = [...lines].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const orgRaw = est.organizations;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    name: string;
  } | null;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <PageTitle base="Books" />
          <p className="text-sm text-slate-500 mt-0.5">{t("estimates.subtitle")}</p>
        </div>
        <Link
          href="/books/estimates"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("estimates.detail.back")}
        </Link>
      </div>

      <BooksNav />

      {/* Estimate body */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        {/* Left: estimate document */}
        <div className="space-y-6">
          {/* Estimate card */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header bar */}
            <div className="bg-slate-900 px-6 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-semibold text-lg">
                    {est.estimate_number}
                  </p>
                  <p className="text-slate-400 text-sm mt-0.5">
                    {org?.name ?? t("estimates.detail.orgFallback")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white text-2xl font-bold font-mono">
                    {fmt(Number(est.total))}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full mt-1 ${cfg.color}`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {t(`estimates.status.${effectiveStatus}`)}
                  </span>
                </div>
              </div>
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
                  {t("estimates.detail.issueDate")}
                </p>
                <p className="text-sm text-slate-800">{fmtDate(est.issue_date)}</p>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
                  {t("estimates.detail.validUntil")}
                </p>
                <p
                  className={`text-sm ${
                    effectiveStatus === "expired"
                      ? "text-amber-600 font-medium"
                      : "text-slate-800"
                  }`}
                >
                  {fmtDate(est.expiry_date)}
                </p>
              </div>
            </div>

            {/* Client */}
            {client && (
              <div className="px-6 py-4 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  {t("estimates.detail.client")}
                </p>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <Link
                    href={`/clients/${client.id}`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {clientName}
                  </Link>
                </div>
                {client.email && (
                  <div className="flex items-center gap-2 mt-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">{client.email}</span>
                  </div>
                )}
              </div>
            )}

            {/* Line items */}
            <div className="px-6 py-4">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {t("estimates.detail.columns.description")}
                    </th>
                    <th className="text-center pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">
                      {t("estimates.detail.columns.qty")}
                    </th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">
                      {t("estimates.detail.columns.price")}
                    </th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">
                      {t("estimates.detail.columns.amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-50">
                      <td className="py-3 text-slate-700">{line.description}</td>
                      <td className="py-3 text-center text-slate-500">
                        {num(Number(line.quantity))}
                      </td>
                      <td className="py-3 text-right text-slate-500">
                        {fmt(Number(line.unit_price))}
                      </td>
                      <td className="py-3 text-right font-medium text-slate-800">
                        {fmt(Number(line.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end mt-4">
                <div className="w-56 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>{t("estimates.detail.subtotal")}</span>
                    <span className="tabular-nums">{fmt(Number(est.subtotal))}</span>
                  </div>
                  {Number(est.tax_rate) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>
                        {t("estimates.detail.taxWithRate", {
                          rate: (Number(est.tax_rate) * 100).toFixed(0),
                        })}
                      </span>
                      <span className="tabular-nums">
                        {fmt(Number(est.tax_amount))}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200 pt-2">
                    <span>{t("estimates.detail.total")}</span>
                    <span className="tabular-nums font-mono">
                      {fmt(Number(est.total))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {est.notes && (
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                    {t("estimates.detail.notes")}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {est.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Converted invoice link */}
          {est.converted_invoice_id && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 text-sm text-emerald-800">
                {t("estimates.detail.convertedToInvoice")}
              </div>
              <Link
                href={`/books/invoices/${est.converted_invoice_id}`}
                className="text-sm font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
              >
                {t("estimates.detail.viewInvoice")}
              </Link>
            </div>
          )}

          {/* Converted project link */}
          {est.converted_project_id && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
              <FolderOpen className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <div className="flex-1 text-sm text-indigo-800">
                {t("estimates.detail.convertedToProject")}
              </div>
              <Link
                href={`/projects/${est.converted_project_id}`}
                className="text-sm font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
              >
                {t("estimates.detail.viewProject")}
              </Link>
            </div>
          )}
        </div>

        {/* Right: actions panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              {t("estimates.detail.actionsHeading")}
            </h3>
            <EstimateActions
              estimateId={est.id}
              status={effectiveStatus}
              hasClientEmail={!!client?.email}
              convertedInvoiceId={est.converted_invoice_id}
              convertedProjectId={est.converted_project_id}
            />
          </div>

          {/* Estimate info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {t("estimates.detail.detailsHeading")}
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("estimates.detail.number")}</dt>
                <dd className="font-mono text-slate-800">{est.estimate_number}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("estimates.detail.statusLabel")}</dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {t(`estimates.status.${effectiveStatus}`)}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("estimates.detail.issued")}</dt>
                <dd className="text-slate-800">{fmtShortDate(est.issue_date)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("estimates.detail.expires")}</dt>
                <dd className="text-slate-800">{fmtShortDate(est.expiry_date)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
