import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CampaignDetailActions } from "./campaign-detail-actions";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";
import {
  ArrowLeft, Mail, CheckCircle2, Clock, XCircle,
} from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.campaign") };
}

// Enum → chip styling + icon; the label comes from `campaigns.status.<status>`.
const STATUS_CONFIG = {
  draft:   { color: "bg-slate-100 text-slate-600",     icon: Mail },
  sending: { color: "bg-blue-100 text-blue-700",       icon: Clock },
  sent:    { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  failed:  { color: "bg-rose-100 text-rose-700",       icon: XCircle },
} as const;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getServerT("marketing"), getServerLocale()]);

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (!campaign) notFound();

  const statusKey =
    campaign.status in STATUS_CONFIG
      ? (campaign.status as keyof typeof STATUS_CONFIG)
      : "draft";
  const cfg = STATUS_CONFIG[statusKey];
  const StatusIcon = cfg.icon;
  const statusLabel = t(`campaigns.status.${statusKey}`);
  const segmentLabel = t(`campaigns.detail.segments.${campaign.recipient_filter}`, {
    defaultValue: campaign.recipient_filter,
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              {campaign.name}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-slate-500">{campaign.subject}</p>
        </div>
        <Link
          href="/marketing"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("campaigns.detail.back")}
        </Link>
      </div>

      <div className="grid grid-cols-[1fr_260px] gap-6">
        {/* Left: campaign body */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              {t("campaigns.detail.messagePreview")}
            </h2>
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              {/* Email header mock */}
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                <p className="text-xs text-slate-500">
                  <span className="font-medium">{t("campaigns.detail.subject")}</span> {campaign.subject}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="font-medium">{t("campaigns.detail.to")}</span>{" "}
                  {segmentLabel}
                </p>
              </div>
              <div className="px-4 py-4 space-y-2">
                <p className="text-sm text-slate-600">{t("campaigns.detail.greeting")}</p>
                {campaign.body.split("\n").map((line: string, i: number) =>
                  line.trim() ? (
                    <p key={i} className="text-sm text-slate-700 leading-relaxed">
                      {line}
                    </p>
                  ) : (
                    <div key={i} className="h-1" />
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: stats + actions */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t("campaigns.detail.statsTitle")}
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("campaigns.detail.segment")}</dt>
                <dd className="font-medium text-slate-800">{segmentLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("campaigns.detail.recipients")}</dt>
                <dd className="font-medium text-slate-800 tabular-nums">
                  {campaign.recipient_count ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("campaigns.detail.status")}</dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {statusLabel}
                  </span>
                </dd>
              </div>
              {campaign.sent_at && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("campaigns.detail.sent")}</dt>
                  <dd className="text-slate-800">
                    {new Date(campaign.sent_at).toLocaleDateString(intlLocale(locale), {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">{t("campaigns.detail.created")}</dt>
                <dd className="text-slate-800">
                  {new Date(campaign.created_at).toLocaleDateString(intlLocale(locale), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          <CampaignDetailActions
            campaignId={campaign.id}
            status={campaign.status}
          />
        </div>
      </div>
    </div>
  );
}
