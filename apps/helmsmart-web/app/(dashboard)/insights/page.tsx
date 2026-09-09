import type { Metadata } from "next";
import { getLatestInsight, listInsights } from "@/lib/actions/business-insights";
import { TimInsights } from "@/components/tim-insights";
import type { InsightItem } from "@/lib/business-insights";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { dateFormatter } from "@/lib/books-format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("home");
  return { title: t("insights.metaTitle") };
}

export default async function InsightsPage() {
  const t = await getServerT("home");
  const locale = await getServerLocale();
  const fmtDay = dateFormatter(locale, { month: "short", day: "numeric" });

  const [latest, history] = await Promise.all([
    getLatestInsight(),
    listInsights(12),
  ]);

  // History excludes the latest (shown in the main card)
  const past = latest
    ? history.filter((h) => h.period_start !== latest.periodStart)
    : history;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t("insights.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("insights.subtitle")}</p>
      </div>

      <TimInsights initialInsight={latest} />

      {/* History */}
      {past.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">{t("insights.pastDigests")}</h2>
          <div className="space-y-3">
            {past.map((h) => {
              const items = (h.insights ?? []) as InsightItem[];
              return (
                <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-slate-900">{h.headline}</p>
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-3">
                      {t("insights.dateRange", {
                        start: fmtDay(h.period_start),
                        end: fmtDay(h.period_end),
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{h.summary}</p>
                  {items.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">{t("insights.insightCount", { count: items.length })}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
