import { ResponsibleEmployee } from "@/components/responsible-employee";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Plus, Mail, Clock, CheckCircle2, XCircle } from "lucide-react";
import { MarketingOverview } from "@/components/marketing-overview";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.marketing") };
}

// Enum → chip styling + icon. The label comes from the bundle
// (`campaigns.status.<status>`), so the status keys stay the data vocabulary.
const STATUS_CONFIG = {
  draft:   { color: "bg-slate-100 text-slate-600",     icon: Mail },
  sending: { color: "bg-blue-100 text-blue-700",       icon: Clock },
  sent:    { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  failed:  { color: "bg-rose-100 text-rose-700",       icon: XCircle },
} as const;

export default async function MarketingPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getServerT("marketing"), getServerLocale()]);

  const [{ data: campaigns }, { data: org }, { count: callsHandled }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, subject, status, recipient_filter, recipient_count, sent_at, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("twilio_number, voice_agent_enabled, auto_reply").eq("id", orgId).single(),
    supabase.from("voice_sessions").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
  ]);

  const all = campaigns ?? [];
  const sentCampaigns = all.filter((c) => c.status === "sent");
  const totalReached = sentCampaigns.reduce(
    (s, c) => s + (c.recipient_count ?? 0),
    0
  );

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <ResponsibleEmployee slug="emily" className="mb-3" />
          <h1 className="text-2xl font-semibold text-slate-900">{t("campaigns.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("campaigns.subtitle")}
          </p>
        </div>
      </div>

      <MarketingOverview
        voice={{ configured: Boolean(org?.twilio_number), callsHandled: callsHandled ?? 0 }}
        sms={{ active: org?.auto_reply ?? false, number: org?.twilio_number ?? null }}
        email={{ sent: sentCampaigns.length, reached: totalReached }}
      />

      <h2 id="email-campaigns" className="text-sm font-semibold text-slate-700 mb-3 scroll-mt-8">
        {t("campaigns.emailSection")}
      </h2>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { key: "sent", label: t("campaigns.stats.sentLabel"), value: String(sentCampaigns.length), sub: t("campaigns.stats.sentSub", { count: all.length }) },
          { key: "reached", label: t("campaigns.stats.reachedLabel"), value: String(totalReached), sub: t("campaigns.stats.reachedSub") },
          { key: "drafts", label: t("campaigns.stats.draftsLabel"), value: String(all.filter((c) => c.status === "draft").length), sub: t("campaigns.stats.draftsSub") },
        ].map(({ key, label, value, sub }) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              {label}
            </p>
            <p className="text-2xl font-semibold text-slate-800">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Campaigns list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {!all.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
              <Mail className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">{t("campaigns.empty.title")}</p>
            <p className="text-xs text-slate-400 max-w-xs mb-5">
              {t("campaigns.empty.body")}
            </p>
            <Link
              href="/marketing/new"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t("campaigns.empty.cta")}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px_100px_120px_100px] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <span>{t("campaigns.table.campaign")}</span>
              <span>{t("campaigns.table.segment")}</span>
              <span className="text-center">{t("campaigns.table.reached")}</span>
              <span>{t("campaigns.table.sent")}</span>
              <span className="text-right">{t("campaigns.table.status")}</span>
            </div>

            <div className="divide-y divide-slate-50">
              {all.map((campaign) => {
                const statusKey =
                  campaign.status in STATUS_CONFIG
                    ? (campaign.status as keyof typeof STATUS_CONFIG)
                    : "draft";
                const cfg = STATUS_CONFIG[statusKey];
                const StatusIcon = cfg.icon;

                const segmentLabel = t(`campaigns.segments.${campaign.recipient_filter}`, {
                  defaultValue: campaign.recipient_filter,
                });

                return (
                  <Link
                    key={campaign.id}
                    href={`/marketing/${campaign.id}`}
                    className="grid grid-cols-[1fr_120px_100px_120px_100px] gap-4 px-6 py-4 hover:bg-slate-50 transition-colors items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {campaign.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {campaign.subject}
                      </p>
                    </div>
                    <span className="text-sm text-slate-600">{segmentLabel}</span>
                    <span className="text-sm text-slate-700 font-medium text-center tabular-nums">
                      {campaign.recipient_count ?? "—"}
                    </span>
                    <span className="text-sm text-slate-500">
                      {campaign.sent_at
                        ? new Date(campaign.sent_at).toLocaleDateString(intlLocale(locale), {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                    <div className="flex justify-end">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {t(`campaigns.status.${statusKey}`)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
