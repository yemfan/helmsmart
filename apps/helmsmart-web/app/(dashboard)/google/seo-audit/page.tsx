import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CheckCircle2, AlertCircle, XCircle, Search } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.seoAudit") };
}

type Status = "pass" | "warn" | "fail";

interface AuditItem {
  id: string;
  title: string;
  description: string;
  status: Status;
  recommendation?: string;
}

export default async function SEOAuditPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getServerT("marketing"), getServerLocale()]);

  const { data: org } = await supabase
    .from("organizations")
    .select("name, auto_request_reviews")
    .eq("id", orgId)
    .single();

  const { data: profile } = await supabase
    .from("google_business_profiles")
    .select("business_name, rating, review_count")
    .eq("organization_id", orgId)
    .single();

  const { count: reviewCount } = await supabase
    .from("google_reviews")
    .select("id", { count: "exact" })
    .eq("organization_id", orgId);

  // Generate audit items
  const auditItems: AuditItem[] = [
    {
      id: "profile",
      title: t("google.seo.profileTitle"),
      description: t("google.seo.profileDesc"),
      status: profile ? "pass" : "fail",
      recommendation: !profile ? t("google.seo.profileRec") : undefined,
    },
    {
      id: "reviews",
      title: t("google.seo.reviewsTitle"),
      description: t("google.seo.reviewsDesc", { count: reviewCount || 0 }),
      status: (reviewCount ?? 0) >= 5 ? "pass" : (reviewCount ?? 0) > 0 ? "warn" : "fail",
      recommendation: (reviewCount ?? 0) < 5 ? t("google.seo.reviewsRec") : undefined,
    },
    {
      id: "rating",
      title: t("google.seo.ratingTitle"),
      description: profile?.rating
        ? t("google.seo.ratingDesc", {
            rating: profile.rating.toLocaleString(intlLocale(locale), {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          })
        : t("google.seo.ratingNone"),
      status: (profile?.rating ?? 0) >= 4.0 ? "pass" : (profile?.rating ?? 0) > 0 ? "warn" : "fail",
      recommendation: (profile?.rating ?? 0) < 4.0 ? t("google.seo.ratingRec") : undefined,
    },
    {
      id: "autoRequest",
      title: t("google.seo.autoRequestTitle"),
      description: org?.auto_request_reviews
        ? t("google.seo.autoRequestOn")
        : t("google.seo.autoRequestOff"),
      status: org?.auto_request_reviews ? "pass" : "warn",
      recommendation: !org?.auto_request_reviews ? t("google.seo.autoRequestRec") : undefined,
    },
    {
      id: "schema",
      title: t("google.seo.schemaTitle"),
      description: t("google.seo.schemaDesc"),
      status: "pass",
      recommendation: undefined,
    },
    {
      id: "sitemap",
      title: t("google.seo.sitemapTitle"),
      description: t("google.seo.sitemapDesc"),
      status: "pass",
      recommendation: undefined,
    },
    {
      id: "robots",
      title: t("google.seo.robotsTitle"),
      description: t("google.seo.robotsDesc"),
      status: "pass",
      recommendation: undefined,
    },
  ];

  const passCount = auditItems.filter((item) => item.status === "pass").length;
  const warnCount = auditItems.filter((item) => item.status === "warn").length;
  const failCount = auditItems.filter((item) => item.status === "fail").length;
  const score = Math.round(((passCount * 1 + warnCount * 0.5) / auditItems.length) * 100);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/google" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          {t("google.seo.back")}
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{t("google.seo.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("google.seo.subtitle")}</p>
      </div>

      {/* Score Card */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 p-8 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700 uppercase">{t("google.seo.score")}</p>
            <p className="text-5xl font-bold text-indigo-900 mt-2">{score}%</p>
            <p className="text-sm text-indigo-600 mt-2">
              {t("google.seo.summary", { pass: passCount, warn: warnCount, fail: failCount })}
            </p>
          </div>
          <div className="text-6xl font-bold text-indigo-200">
            {Math.round(score / 20)}/{5}
          </div>
        </div>
      </div>

      {/* Audit Items */}
      <div className="space-y-4">
        {auditItems.map((item) => (
          <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-4">
              {item.status === "pass" && (
                <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
              )}
              {item.status === "warn" && (
                <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              )}
              {item.status === "fail" && (
                <XCircle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
              )}

              <div className="flex-1">
                <p className="font-medium text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                {item.recommendation && (
                  <p className="text-sm text-amber-700 mt-2 p-2 bg-amber-50 rounded border border-amber-100">
                    💡 {item.recommendation}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SEO Tips */}
      <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-6">
        <div className="flex gap-3">
          <Search className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900">{t("google.seo.tipsTitle")}</h3>
            <ul className="text-sm text-blue-800 mt-2 space-y-2">
              {(["tip1", "tip2", "tip3", "tip4", "tip5", "tip6"] as const).map((key) => (
                <li key={key}>✓ {t(`google.seo.${key}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
