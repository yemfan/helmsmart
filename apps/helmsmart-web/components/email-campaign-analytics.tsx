"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { ArrowLeft, Mail, Eye, TrendingUp, XCircle, CheckCircle2 } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  preview_text?: string;
  target_segment: string;
  status: string;
  total_recipients: number;
  delivered_count: number;
  failed_count: number;
  open_count: number;
  click_count: number;
  unsubscribe_count: number;
  sent_at: string;
}

interface Recipient {
  id: string;
  email: string;
  recipient_name?: string;
  sent_at?: string;
  failed_at?: string;
  failure_reason?: string;
  opened_at?: string;
  unsubscribed_at?: string;
}

function pct(a: number, b: number): string {
  if (!b) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

export function EmailCampaignAnalytics({
  campaign,
  recipients,
}: {
  campaign: Campaign;
  recipients: Recipient[];
}) {
  const { t, i18n } = useTranslation("marketing");
  const intl = intlLocale(i18n.language);
  const delivered   = campaign.delivered_count ?? 0;
  const opens       = campaign.open_count ?? 0;
  const clicks      = campaign.click_count ?? 0;
  const unsubs      = campaign.unsubscribe_count ?? 0;
  const failed      = campaign.failed_count ?? 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/marketing/email" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{campaign.name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("email.analytics.sentAt", {
              date: new Date(campaign.sent_at).toLocaleDateString(intl, {
                month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
              }),
              segment: campaign.target_segment,
            })}
          </p>
        </div>
        <span className="ml-2 text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full">
          {t("email.analytics.statusSent")}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { key: "delivered",    label: t("email.analytics.delivered"),    value: delivered.toLocaleString(intl), sub: t("email.analytics.deliveredSub", { total: campaign.total_recipients }), icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { key: "openRate",     label: t("email.analytics.openRate"),     value: pct(opens, delivered),          sub: t("email.analytics.opensSub", { count: opens }),                        icon: Eye,          color: "text-blue-600",    bg: "bg-blue-50" },
          { key: "clickRate",    label: t("email.analytics.clickRate"),    value: pct(clicks, delivered),         sub: t("email.analytics.clicksSub", { count: clicks }),                      icon: TrendingUp,   color: "text-indigo-600",  bg: "bg-indigo-50" },
          { key: "unsubscribed", label: t("email.analytics.unsubscribed"), value: pct(unsubs, delivered),         sub: t("email.analytics.unsubsSub", { count: unsubs }),                      icon: XCircle,      color: "text-amber-600",   bg: "bg-amber-50" },
          { key: "failed",       label: t("email.analytics.failed"),       value: failed.toLocaleString(intl),    sub: t("email.analytics.failedSub"),                                         icon: XCircle,      color: "text-rose-600",    bg: "bg-rose-50" },
        ].map(({ key, label, value, sub, icon: Icon, color, bg }) => (
          <div key={key} className={`rounded-xl border border-slate-200 ${bg} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Subject preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-800">{campaign.subject}</p>
        </div>
        {campaign.preview_text && (
          <p className="text-xs text-slate-400 ml-6">{campaign.preview_text}</p>
        )}
      </div>

      {/* Recipient table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">
            {t("email.analytics.recipientsTitle", { count: recipients.length })}
          </h2>
          <div className="text-xs text-slate-500">
            {[t("email.analytics.summaryDelivered", { count: delivered }), t("email.analytics.summaryOpened", { count: opens }), t("email.analytics.summaryClicked", { count: clicks })].join(" · ")}
          </div>
        </div>
        {recipients.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">{t("email.analytics.noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("email.analytics.table.recipient")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("email.analytics.table.status")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("email.analytics.table.sentAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recipients.map((r) => {
                  const status = r.unsubscribed_at ? { key: "unsubscribed", color: "bg-amber-100 text-amber-700" }
                    : r.failed_at              ? { key: "failed",       color: "bg-rose-100 text-rose-700" }
                    : r.opened_at             ? { key: "opened",       color: "bg-blue-100 text-blue-700" }
                    : r.sent_at               ? { key: "delivered",    color: "bg-emerald-100 text-emerald-700" }
                    : { key: "pending", color: "bg-slate-100 text-slate-500" };
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <p className="font-medium text-slate-800">{r.recipient_name || "—"}</p>
                        <p className="text-xs text-slate-400">{r.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                          {t(`email.analytics.recipientStatus.${status.key}`)}
                        </span>
                        {r.failure_reason && (
                          <p className="text-xs text-rose-500 mt-0.5">{r.failure_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {r.sent_at ? new Date(r.sent_at).toLocaleDateString(intl, {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
