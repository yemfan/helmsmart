import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { GoogleBusinessConnect } from "@/components/google-business-connect";
import { GoogleBusinessSettings } from "@/components/google-business-settings";
import { StarIcon, MessageSquare, Link as LinkIcon, RefreshCw, TrendingUp } from "lucide-react";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.google") };
}

export default async function GoogleBusinessPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getServerT("marketing"), getServerLocale()]);

  const { data: profile } = await supabase
    .from("google_business_profiles")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  const { data: org } = await supabase
    .from("organizations")
    .select("auto_request_reviews")
    .eq("id", orgId)
    .single();

  const { data: reviews } = await supabase
    .from("google_reviews")
    .select("*")
    .eq("organization_id", orgId)
    .order("review_created_at", { ascending: false })
    .limit(10);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{t("google.page.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {t("google.page.subtitle")}
        </p>
      </div>

      {!profile ? (
        <GoogleBusinessConnect />
      ) : (
        <>
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{profile.business_name}</h2>
                {profile.address && <p className="text-sm text-slate-600 mt-1">{profile.address}</p>}
                {profile.phone && <p className="text-sm text-slate-600">{profile.phone}</p>}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-lg">
                  <StarIcon className="w-5 h-5 text-amber-400 fill-amber-400" />
                  <span className="font-semibold text-slate-900">{profile.rating?.toFixed(1) || "—"}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{t("google.page.reviews", { count: profile.review_count ?? 0 })}</p>
              </div>
            </div>

            {profile.sync_status === "failed" && profile.sync_error && (
              <div className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg mb-4">
                {t("google.page.syncFailed", { error: profile.sync_error })}
              </div>
            )}

            <div className="flex gap-2">
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  {t("google.page.visitProfile")}
                </a>
              )}
              <Link
                href="/google/seo-audit"
                className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-lg"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                {t("google.page.seoAudit")}
              </Link>
            </div>
          </div>

          {/* Reviews Section */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-800">{t("google.page.recentReviews")}</h2>
              </div>
              <Link
                href="/google/reviews"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {t("google.page.viewAll")}
              </Link>
            </div>

            {reviews && reviews.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {reviews.map((review) => (
                  <div key={review.id} className="px-6 py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-900">{review.reviewer_name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <StarIcon
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          review.response_status === "replied"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {review.response_status === "replied" ? t("google.page.replied") : t("google.page.noReply")}
                      </span>
                    </div>

                    {review.review_text && (
                      <p className="text-sm text-slate-600 mb-3 line-clamp-2">{review.review_text}</p>
                    )}

                    {review.response_status === "replied" && review.response_text && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3 text-sm">
                        <p className="text-xs font-medium text-blue-900 mb-1">{t("google.page.yourResponse")}</p>
                        <p className="text-blue-800">{review.response_text}</p>
                      </div>
                    )}

                    <p className="text-xs text-slate-400 mt-2">
                      {new Date(review.review_created_at).toLocaleDateString(intlLocale(locale), {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-600">{t("google.page.noReviews")}</p>
              </div>
            )}
          </div>

          {/* Last Sync Info */}
          {profile.last_synced_at && (
            <div className="mt-4 text-xs text-slate-500 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              {t("google.page.lastSynced", {
                date: new Date(profile.last_synced_at).toLocaleDateString(intlLocale(locale), {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </div>
          )}

          {/* Settings */}
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("google.page.settings")}</h2>
            <GoogleBusinessSettings autoRequestEnabled={org?.auto_request_reviews ?? false} />
          </div>
        </>
      )}
    </div>
  );
}
