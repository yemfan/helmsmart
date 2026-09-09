"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus, Lightbulb, AlertCircle } from "lucide-react";
import { refreshInsight } from "@/lib/actions/business-insights";
import type { BusinessInsight } from "@/lib/business-insights";

interface InsightItem {
  title: string;
  detail: string;
  sentiment: "positive" | "neutral" | "negative";
  metric?: string;
  recommendation?: string;
}

interface Props {
  initialInsight?: (BusinessInsight & { isStale: boolean }) | null;
}

const SENTIMENT_STYLE = {
  positive: { icon: TrendingUp,   ring: "border-emerald-200", chip: "bg-emerald-100 text-emerald-700", dot: "text-emerald-500" },
  negative: { icon: TrendingDown, ring: "border-rose-200",    chip: "bg-rose-100 text-rose-700",       dot: "text-rose-500" },
  neutral:  { icon: Minus,        ring: "border-slate-200",   chip: "bg-slate-100 text-slate-600",     dot: "text-slate-400" },
} as const;

export function TimInsights({ initialInsight }: Props) {
  const { t, i18n } = useTranslation("home");
  const dayMonth: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const fmtDay = (ymd: string, opts: Intl.DateTimeFormatOptions = dayMonth) =>
    new Date(ymd + "T00:00:00").toLocaleDateString(intlLocale(i18n.language), opts);

  const [insight, setInsight] = useState(initialInsight);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    setError(null);
    startTransition(async () => {
      const result = await refreshInsight();
      if (!result.ok) {
        setError(result.error ?? t("insights.tim.error"));
      } else if (result.insight) {
        setInsight({ ...result.insight, isStale: false });
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Tim header card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-6 h-6 text-cyan-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">Tim</h2>
              <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-slate-300">{t("insights.tim.role")}</span>
            </div>
            {insight ? (
              <>
                <p className="text-sm text-slate-100 mt-2 font-medium leading-snug">{insight.headline}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {t("insights.tim.weekOf", {
                    start: fmtDay(insight.periodStart),
                    end: fmtDay(insight.periodEnd, { ...dayMonth, year: "numeric" }),
                  })}
                  {insight.isStale && (
                    <span className="ml-2 text-amber-400"> {t("insights.tim.refreshRecommended")}</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-300 mt-2">{t("insights.tim.intro")}</p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? t("insights.tim.analysing") : insight ? t("insights.tim.refresh") : t("insights.tim.run")}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Summary */}
      {insight && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-sm text-slate-700 leading-relaxed">{insight.summary}</p>
          </div>

          {/* Insight cards */}
          <div className="space-y-3">
            {(insight.insights as InsightItem[]).map((item, i) => {
              const style = SENTIMENT_STYLE[item.sentiment] ?? SENTIMENT_STYLE.neutral;
              const Icon = style.icon;
              return (
                <div key={i} className={`bg-white rounded-xl border ${style.ring} p-5`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                        {item.metric && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.chip}`}>
                            {item.metric}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.detail}</p>
                      {item.recommendation && (
                        <div className="flex items-start gap-2 mt-3 bg-slate-50 rounded-lg px-3 py-2">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-700 font-medium">{item.recommendation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 text-center">
            {t("insights.tim.footer", {
              date: new Date(insight.generatedAt).toLocaleString(intlLocale(i18n.language), {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </p>
        </>
      )}
    </div>
  );
}
