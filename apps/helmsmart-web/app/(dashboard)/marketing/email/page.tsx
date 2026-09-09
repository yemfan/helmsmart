import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Mail, TrendingUp, Eye, Repeat } from "lucide-react";
import { listEmailCampaigns } from "@/lib/actions/email-campaigns";
import { describeRecurrence, type RecurrenceInterval } from "@/lib/recurrence";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.emailCampaigns") };
}

function pct(a: number, b: number) {
  if (!b) return "—";
  return `${((a / b) * 100).toFixed(0)}%`;
}

export default async function EmailCampaignsPage() {
  const [campaigns, t, locale] = await Promise.all([
    listEmailCampaigns(),
    getServerT("marketing"),
    getServerLocale(),
  ]);
  const intl = intlLocale(locale);

  const draft     = campaigns.filter((c) => c.status === "draft");
  const scheduled = campaigns.filter((c) => c.status === "scheduled");
  const sent      = campaigns.filter((c) => c.status === "sent");
  const recurring = campaigns.filter((c) => c.status === "recurring" || c.is_recurring);
  const totalSent = sent.reduce((s, c) => s + (c.delivered_count ?? 0), 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("email.list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("email.list.subtitle")}
          </p>
        </div>
        <Link
          href="/marketing/email/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("email.list.new")}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 uppercase">{t("email.list.totalSent")}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalSent.toLocaleString(intl)}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 uppercase">{t("email.list.drafts")}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{draft.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 uppercase">{t("email.list.campaigns")}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{campaigns.length}</p>
        </div>
      </div>

      {/* Recurring newsletters */}
      {recurring.length > 0 && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="text-sm font-medium text-indigo-900 mb-3 flex items-center gap-1.5">
            <Repeat className="w-4 h-4" />
            {t("email.list.recurring", { count: recurring.length })}
          </p>
          <div className="space-y-2">
            {recurring.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-indigo-800 font-medium">{c.name}</span>
                <span className="text-indigo-600 text-xs">
                  {c.recurrence_interval
                    ? describeRecurrence(
                        c.recurrence_interval as RecurrenceInterval,
                        c.recurrence_day ?? 1,
                        c.recurrence_hour ?? 9
                      )
                    : t("email.list.recurringFallback")}
                  {c.next_run_at && (
                    <>
                      {" "}
                      {t("email.list.next", {
                        date: new Date(c.next_run_at).toLocaleDateString(intl, { month: "short", day: "numeric" }),
                      })}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduled */}
      {scheduled.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-900 mb-2">
            {t("email.list.scheduled", { count: scheduled.length })}
          </p>
          {scheduled.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-blue-800">{c.name}</span>
              <span className="text-blue-600">
                {new Date(c.scheduled_for!).toLocaleDateString(intl, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Drafts */}
      {draft.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            {t("email.list.draftsHeading", { count: draft.length })}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {draft.map((c) => (
              <Link
                key={c.id}
                href={`/marketing/email/${c.id}`}
                className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("email.list.draftMeta", { subject: c.subject, segment: c.target_segment })}
                  </p>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded">
                  {t("email.list.draftBadge")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sent */}
      {sent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            {t("email.list.sentHeading", { count: sent.length })}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {sent.map((c) => (
              <Link
                key={c.id}
                href={`/marketing/email/${c.id}`}
                className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{c.subject}</p>
                </div>
                <div className="flex items-center gap-5 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {t("email.list.delivered", { count: c.delivered_count ?? 0 })}
                  </span>
                  {(c.open_count ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {t("email.list.openRate", { value: pct(c.open_count ?? 0, c.delivered_count ?? 0) })}
                    </span>
                  )}
                  {(c.click_count ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {t("email.list.clickRate", { value: pct(c.click_count ?? 0, c.delivered_count ?? 0) })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(c.sent_at!).toLocaleDateString(intl, {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Mail className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">{t("email.list.emptyTitle")}</p>
          <p className="text-xs text-slate-400 mt-1 mb-5">
            {t("email.list.emptyBody")}
          </p>
          <Link
            href="/marketing/email/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("email.list.emptyCta")}
          </Link>
        </div>
      )}
    </div>
  );
}
