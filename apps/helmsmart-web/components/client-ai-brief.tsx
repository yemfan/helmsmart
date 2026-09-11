"use client";

import { useState, useTransition } from "react";
import { Sparkles, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { generateClientBrief, type ClientBrief } from "@/lib/actions/client-brief";

/**
 * `health_label` is a code the model picks from a fixed English list, so the
 * badge translates it here; it used to print "Strong" inside a Spanish brief.
 * A value off the list shows as written.
 */
const HEALTH_LABEL_KEYS: Record<string, string> = {
  "At risk": "atRisk",
  "Needs attention": "needsAttention",
  Good: "good",
  Strong: "strong",
  Excellent: "excellent",
};

interface Props {
  clientId: string;
  initialBrief?: ClientBrief | null;
}

function HealthBadge({ score, label, text }: { score?: number; label?: string; text: string }) {
  if (!score || !label) return null;
  const color =
    score >= 8 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    score >= 6 ? "bg-blue-100 text-blue-700 border-blue-200" :
    score >= 4 ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-rose-100 text-rose-700 border-rose-200";
  const Icon =
    score >= 7 ? TrendingUp :
    score >= 4 ? Minus :
    TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${color}`}>
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}

export function ClientAIBrief({ clientId, initialBrief }: Props) {
  const { t, i18n } = useTranslation("clients");
  const [brief, setBrief] = useState<ClientBrief | null | undefined>(initialBrief);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasBrief = !!brief;
  const showStaleWarning = brief?.isStale;

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateClientBrief(clientId);
      if (!result.ok) {
        setError(result.error ?? t("errors.briefFailed"));
      } else if (result.brief) {
        setBrief(result.brief);
        setExpanded(true);
      }
    });
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl border border-indigo-100 overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-5 py-4 ${hasBrief ? "cursor-pointer hover:bg-white/40 transition-colors" : ""}`}
        onClick={hasBrief ? () => setExpanded((v) => !v) : undefined}
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-indigo-900">{t("brief.title")}</p>
            {brief?.healthLabel && (
              <HealthBadge
                score={brief.healthScore}
                label={brief.healthLabel}
                text={t("brief.health", {
                  label: t(`brief.healthLabels.${HEALTH_LABEL_KEYS[brief.healthLabel] ?? "unlisted"}`, {
                    defaultValue: brief.healthLabel,
                  }),
                  score: brief.healthScore,
                })}
              />
            )}
            {showStaleWarning && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t("brief.stale")}
              </span>
            )}
          </div>
          {brief?.headline && !expanded && (
            <p className="text-xs text-indigo-700 mt-0.5 truncate">{brief.headline}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            disabled={isPending}
            title={hasBrief ? t("brief.refresh") : t("brief.generateTitle")}
            className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
          </button>
          {hasBrief && (
            expanded
              ? <ChevronUp className="w-4 h-4 text-indigo-400" />
              : <ChevronDown className="w-4 h-4 text-indigo-400" />
          )}
        </div>
      </div>

      {/* Empty state */}
      {!hasBrief && !isPending && (
        <div className="px-5 pb-5">
          <p className="text-xs text-indigo-600 mb-3">
            {t("brief.intro")}
          </p>
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t("brief.generate")}
          </button>
        </div>
      )}

      {/* Loading */}
      {isPending && (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-3 text-sm text-indigo-600">
            <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            {t("brief.loading")}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 pb-4 text-xs text-rose-600">{error}</div>
      )}

      {/* Brief content */}
      {hasBrief && expanded && brief && (
        <div className="px-5 pb-5 space-y-4 border-t border-indigo-100">
          {/* Key facts grid */}
          {brief.keyFacts.length > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-4">
              {brief.keyFacts.map((fact) => (
                <div key={fact.label} className="bg-white/70 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] font-medium text-indigo-500 uppercase tracking-wide">{fact.label}</p>
                  <p className="text-sm font-semibold text-indigo-900 mt-0.5">{fact.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Headline */}
          <p className="text-sm font-semibold text-indigo-900 leading-snug">{brief.headline}</p>

          {/* Summary paragraphs */}
          <div className="text-sm text-indigo-800 leading-relaxed space-y-2 whitespace-pre-line">
            {brief.summary}
          </div>

          {/* Next action */}
          {brief.nextAction && (
            <div className="bg-indigo-600 rounded-lg px-4 py-3">
              <p className="text-[11px] font-semibold text-indigo-200 uppercase tracking-wide mb-1">
                {t("brief.nextAction")}
              </p>
              <p className="text-sm text-white font-medium leading-snug">{brief.nextAction}</p>
            </div>
          )}

          {/* Generated at */}
          <p className="text-[11px] text-indigo-400">
            {t("brief.generatedAt", {
              date: new Date(brief.generatedAt).toLocaleDateString(intlLocale(i18n.language), {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              }),
            })}
          </p>
        </div>
      )}
    </div>
  );
}
