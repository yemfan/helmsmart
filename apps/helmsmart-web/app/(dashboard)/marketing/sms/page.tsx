import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Plus, MessageCircle, TrendingUp } from "lucide-react";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.smsCampaigns") };
}

export default async function SMSCampaignsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getServerT("marketing"), getServerLocale()]);
  const intl = intlLocale(locale);

  const { data: campaigns } = await supabase
    .from("sms_campaigns")
    .select(
      `id, name, target_segment, status,
       total_recipients, delivered_count, click_count,
       scheduled_for, sent_at, created_at`
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  const draft = campaigns?.filter((c) => c.status === "draft") ?? [];
  const sent = campaigns?.filter((c) => c.status === "sent") ?? [];
  const scheduled = campaigns?.filter((c) => c.status === "scheduled") ?? [];

  const totalSent = sent.reduce((sum, c) => sum + (c.delivered_count ?? 0), 0);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("sms.list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("sms.list.subtitle")}
          </p>
        </div>
        <Link
          href="/marketing/sms/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("sms.list.new")}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 uppercase">{t("sms.list.totalSent")}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalSent.toLocaleString(intl)}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 uppercase">{t("sms.list.drafts")}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{draft.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 uppercase">{t("sms.list.campaigns")}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{campaigns?.length ?? 0}</p>
        </div>
      </div>

      {/* Scheduled Campaigns */}
      {scheduled.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-900 mb-3">
            {t("sms.list.scheduled", { count: scheduled.length })}
          </p>
          <div className="space-y-2">
            {scheduled.map((campaign) => (
              <div key={campaign.id} className="flex items-center justify-between text-sm">
                <span className="text-blue-800">{campaign.name}</span>
                <span className="text-blue-600">
                  {new Date(campaign.scheduled_for).toLocaleDateString(intl, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft Campaigns */}
      {draft.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            {t("sms.list.draftsHeading", { count: draft.length })}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {draft.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/marketing/sms/${campaign.id}`}
                className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{campaign.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("sms.list.draftMeta", {
                      segment: campaign.target_segment,
                      date: new Date(campaign.created_at).toLocaleDateString(intl, {
                        month: "short",
                        day: "numeric",
                      }),
                    })}
                  </p>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded">
                  {t("sms.list.draftBadge")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sent Campaigns */}
      {sent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            {t("sms.list.sentHeading", { count: sent.length })}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {sent.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{campaign.name}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
                    <span>{t("sms.list.delivered", { count: campaign.delivered_count ?? 0 })}</span>
                    {campaign.click_count ? (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {t("sms.list.clicks", { count: campaign.click_count })}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {new Date(campaign.sent_at).toLocaleDateString(intl, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!campaigns || campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <MessageCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">{t("sms.list.emptyTitle")}</p>
          <p className="text-xs text-slate-400 mt-1 mb-5">
            {t("sms.list.emptyBody")}
          </p>
          <Link
            href="/marketing/sms/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("sms.list.emptyCta")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
