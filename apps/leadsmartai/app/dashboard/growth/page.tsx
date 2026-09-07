"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { AiActionGateBanner } from "@/components/entitlements/AiActionGateBanner";
import {
  detectAiActionGate,
  type AiActionGate,
} from "@/lib/entitlements/aiActionGate";
import type { GrowthOpportunity, OpportunityCategory, OpportunityPriority } from "@/lib/growth/opportunityTypes";

/**
 * Growth & Opportunities.
 *
 * Top: AI-generated growth opportunities — 3-5 concrete actions the
 * agent should take this week. Cached server-side for 1h; regenerate
 * button bypasses cache.
 *
 * Below: supporting growth metrics + referral code tracking. Kept
 * minimal — the old full-dashboard version had several mismatched
 * fields that crashed render (API returns camelCase, UI read snake).
 */

type OpportunitiesResponse = {
  ok: boolean;
  opportunities: GrowthOpportunity[];
  generatedAtIso: string;
  fromCache: boolean;
  aiConfigured: boolean;
  error?: string;
};

type MetricsResponse = {
  ok: boolean;
  traffic: { pageViews: number; conversions: number; conversionRate: number; toolUsage: number };
  referrals: {
    codes: number;
    eventsSignups: number;
    eventsShares: number;
    eventsConversions: number;
  };
  viral: {
    invitesPerSharer: number;
    referralShare: number;
    viralCoefficientEstimate: number;
  };
};

type ReferralCodeRow = {
  code: string;
  label: string | null;
  signups_count: number;
  conversions_count: number;
  shares_count: number;
  created_at: string;
};

const CATEGORY_LABEL: Record<OpportunityCategory, string> = {
  stale_sphere: "Stale sphere",
  cold_hot_lead: "Cold hot lead",
  would_offer_idle: "Would-offer idle",
  stalled_offer: "Stalled offer",
  pipeline_gap: "Pipeline gap",
  source_concentration: "Source concentration",
  close_rate: "Close rate",
  anniversary_reach_out: "Anniversary",
  other: "Other",
};

const PRIORITY_BADGE: Record<OpportunityPriority, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

const PRIORITY_EMOJI: Record<OpportunityPriority, string> = {
  high: "🔥",
  medium: "⚡",
  low: "💡",
};

export default function GrowthPage() {
  const { t } = useTranslation("dashboard");
  const [opps, setOpps] = useState<OpportunitiesResponse | null>(null);
  const [oppLoading, setOppLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  // Sticky entitlement gate when /api/dashboard/growth/opportunities
  // returns 402. Surfaced as the shared upgrade banner so the agent
  // sees the same affordance as on every other AI surface.
  const [oppGate, setOppGate] = useState<AiActionGate | null>(null);

  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [codes, setCodes] = useState<ReferralCodeRow[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [creatingCode, setCreatingCode] = useState(false);

  const loadOpportunities = useCallback(async (force = false) => {
    setOppError(null);
    setOppGate(null);
    if (force) setRegenerating(true);
    else setOppLoading(true);
    try {
      const res = await fetch("/api/dashboard/growth/opportunities", {
        method: force ? "POST" : "GET",
      });
      const body = (await res.json().catch(() => null)) as
        | (OpportunitiesResponse & { error?: string; code?: string })
        | null;
      if (!res.ok || !body || !body.ok) {
        const aiGate = detectAiActionGate(res.status, body);
        if (aiGate) {
          setOppGate(aiGate);
          return;
        }
        setOppError(body?.error ?? "Failed to load opportunities.");
        return;
      }
      // Coerce the shape defensively — upstream response changes
      // shouldn't crash the page. Missing fields get safe defaults.
      setOpps({
        ok: true,
        opportunities: Array.isArray(body.opportunities) ? body.opportunities : [],
        generatedAtIso: body.generatedAtIso ?? new Date().toISOString(),
        fromCache: Boolean(body.fromCache),
        aiConfigured: body.aiConfigured !== false,
      });
    } catch (e) {
      setOppError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setOppLoading(false);
      setRegenerating(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/growth/metrics?days=30");
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as MetricsResponse | null;
      // Only accept well-formed responses — the backend can return
      // { ok: false, error } or an empty object on failure, and the old
      // version of this page crashed because it blindly deref'd
      // .traffic.* etc.
      if (
        body &&
        body.ok === true &&
        body.traffic &&
        body.referrals &&
        body.viral
      ) {
        setMetrics(body);
      }
    } catch {
      /* non-fatal — metrics are optional */
    }
  }, []);

  const loadCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/growth/referral-code");
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        codes?: ReferralCodeRow[];
      } | null;
      if (body && Array.isArray(body.codes)) setCodes(body.codes);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void loadOpportunities();
    void loadMetrics();
    void loadCodes();
  }, [loadOpportunities, loadMetrics, loadCodes]);

  async function createCode() {
    if (!newLabel.trim()) return;
    setCreatingCode(true);
    try {
      await fetch("/api/dashboard/growth/referral-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      setNewLabel("");
      void loadCodes();
    } finally {
      setCreatingCode(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.growth.heading")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("pages.growth.claudeReads", { ns: "dashboard" })}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadOpportunities(true)}
          disabled={regenerating || oppLoading}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
        >
          {regenerating ? t("pages.growth.analyzing") : t("pages.growth.refresh")}
        </button>
      </div>

      {oppGate ? (
        <AiActionGateBanner reason={oppGate.reason} />
      ) : (
        <OpportunitiesSection
          loading={oppLoading && !opps}
          error={oppError}
          data={opps}
          regenerating={regenerating}
        />
      )}

      <section className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.growth.traffic")}</h2>

        {metrics?.traffic ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("pages.growth.pageViews")} value={String(metrics.traffic.pageViews ?? 0)} />
            <Stat
              label={t("pages.growth.conversions")}
              value={String(metrics.traffic.conversions ?? 0)}
              hint={`${metrics.traffic.conversionRate ?? 0}% rate`}
              tone="green"
            />
            <Stat label={t("pages.growth.toolUsage")} value={String(metrics.traffic.toolUsage ?? 0)} />
            <Stat
              label={t("pages.growth.referralSignups")}
              value={String(metrics.referrals?.eventsSignups ?? 0)}
              tone="blue"
            />
          </div>
        ) : (
          <div className="text-xs text-slate-500">{t("pages.growth.metricsUnavailable")}</div>
        )}

        {metrics?.viral ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400">{t("pages.growth.viralReach")}</h3>
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {(metrics.viral.invitesPerSharer ?? 0).toFixed(1)}
                </p>
                <p className="text-[10px] text-slate-500">{t("pages.growth.invitesPerSharer")}</p>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {(metrics.viral.referralShare ?? 0).toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-500">{t("pages.growth.referralShare")}</p>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {(metrics.viral.viralCoefficientEstimate ?? 0).toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-500">{t("pages.growth.viralK")}</p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.growth.referralCodes")}</h2>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("pages.growth.codeLabelPlaceholder")}
              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void createCode()}
              disabled={creatingCode || !newLabel.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {creatingCode ? t("pages.growth.creating") : t("pages.growth.createCode")}
            </button>
          </div>
          {codes.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t("pages.growth.colCode")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("pages.growth.colLabel")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("pages.growth.colSignups")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("pages.growth.colConversions")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("pages.growth.colShares")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {codes.map((c) => (
                    <tr key={c.code} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100">{c.code}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.label ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.signups_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.conversions_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.shares_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t("pages.growth.noCodes")}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function OpportunitiesSection({
  loading,
  error,
  data,
  regenerating,
}: {
  loading: boolean;
  error: string | null;
  data: OpportunitiesResponse | null;
  regenerating: boolean;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-8 text-center text-sm text-slate-500">
        {t("pages.growth.loadingOpportunities")}
      </div>
    );
  }
  if (error) {
    // Surface the common Anthropic failure modes with clearer guidance.
    // Any message containing "credit balance" means the agent's plan
    // needs more credits — point them directly at billing rather than
    // showing a raw JSON error.
    const looksLikeCreditsIssue = /credit balance|low (on|) credits|purchase credits/i.test(error);
    const looksLikeRateLimit = /rate limit|overloaded/i.test(error);
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">
          {looksLikeCreditsIssue
            ? t("pages.growth.errCredits")
            : looksLikeRateLimit
              ? t("pages.growth.errRateLimit")
              : t("pages.growth.errGeneric")}
        </div>
        <p className="mt-1 text-[13px] text-amber-800">
          {looksLikeCreditsIssue ? (
            <>
              {t("pages.growth.addCreditsPre")}{" "}
              <a
                href="https://console.anthropic.com/settings/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                console.anthropic.com/settings/billing
              </a>
              {t("pages.growth.addCreditsPost")}
            </>
          ) : looksLikeRateLimit ? (
            t("pages.growth.retryMinute")
          ) : (
            error
          )}
        </p>
      </div>
    );
  }
  if (!data) return null;

  if (!data.aiConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="font-medium">{t("pages.growth.aiNotConfigured")}</div>
        <div className="mt-1 text-[12px] text-amber-700">
          {t("pages.growth.aiNotConfiguredPre")}{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5">ANTHROPIC_API_KEY</code>{" "}
          {t("pages.growth.aiNotConfiguredHint")}
        </div>
      </div>
    );
  }

  if (data.opportunities.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center shadow-sm">
        <div className="text-lg">✨</div>
        <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{t("pages.growth.nothingUrgent")}</div>
        <p className="mt-1 text-xs text-slate-500">
          {t("pages.growth.nothingUrgentHint")}
        </p>
      </div>
    );
  }

  const generatedLabel = new Date(data.generatedAtIso).toLocaleString(locale);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.opportunities.map((o) => (
          <OpportunityCard key={o.id} opp={o} regenerating={regenerating} />
        ))}
      </div>
      <div className="text-[11px] text-slate-500">
        {t("pages.growth.generatedAt", { when: generatedLabel })}
        {data.fromCache ? t("pages.growth.cached") : ""}
      </div>
    </div>
  );
}

function OpportunityCard({
  opp,
  regenerating,
}: {
  opp: GrowthOpportunity;
  regenerating: boolean;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-sm ${regenerating ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[opp.priority]}`}
            >
              <span>{PRIORITY_EMOJI[opp.priority]}</span>
              <span className="uppercase tracking-wide">{opp.priority}</span>
            </span>
            <span className="text-[10px] text-slate-500">{CATEGORY_LABEL[opp.category]}</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{opp.title}</h3>
        </div>
      </div>

      <p className="mt-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300">{opp.insight}</p>
      <p className="mt-2 text-[13px] leading-5 text-slate-900 dark:text-slate-100">
        <span className="font-medium">{t("pages.oneWord.action")}</span> {opp.action}
      </p>

      {Array.isArray(opp.context) && opp.context.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {opp.context.map((c, i) => (
            <span
              key={i}
              className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {opp.actionUrl ? (
        <div className="mt-3">
          <Link
            href={opp.actionUrl}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {opp.actionLabel ?? t("common:actions.take_action")} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "blue";
}) {
  const color =
    tone === "green" ? "text-green-700" : tone === "blue" ? "text-blue-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${color}`}>{value}</div>
      {hint ? <div className="text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
