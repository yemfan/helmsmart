"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  DealCoachAction,
  DealCoachReport,
  DealStage,
} from "@/lib/dealCoach/types";
import type { RiskLevel, RiskPillar } from "@/lib/risk";

const STAGES: { value: DealStage; label: string; description: string }[] = [
  { value: "drafting", label: "Drafting", description: "Offer not yet sent" },
  { value: "sent", label: "Sent", description: "Waiting on the seller" },
  { value: "countered", label: "Countered", description: "Seller responded with terms" },
  { value: "accepted", label: "Accepted", description: "Under contract" },
  { value: "rejected", label: "Rejected", description: "Offer dead — review what to do next" },
];

const HEAT_OPTIONS = [
  { value: "hot" as const, label: "Hot" },
  { value: "balanced" as const, label: "Balanced" },
  { value: "cool" as const, label: "Cool" },
];

const NEGOTIATION_SECTIONS: { key: "counter_offer" | "multiple_offers" | "seller_pushback"; label: string }[] = [
  { key: "counter_offer", label: "Counter-offer response" },
  { key: "multiple_offers", label: "Multiple-offer scenario" },
  { key: "seller_pushback", label: "Seller pushback" },
];

const RISK_TONE_CLASSES: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  high: "bg-red-50 text-red-700 ring-red-200",
};

const PRIORITY_TONE: Record<DealCoachAction["priority"], string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-slate-50 text-slate-700 ring-slate-200",
};

function fmtMoney(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Per-deal AI Coach surface. Form-driven for v1 (agent enters the deal
 * context), output is a unified report: strategy + risks + negotiation
 * scripts + prioritized action plan. Future PR will hydrate the form
 * from a real `offers/{id}` row when embedded in the offer-detail page.
 */
export default function DealCoachPanel() {
  const { t } = useTranslation("dashboard");
  const [stage, setStage] = useState<DealStage>("drafting");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [comparablesMedian, setComparablesMedian] = useState("");
  const [daysOnMarket, setDaysOnMarket] = useState("");
  const [marketHeat, setMarketHeat] = useState<"hot" | "balanced" | "cool">("balanced");
  const [competingOfferCount, setCompetingOfferCount] = useState("");
  const [hoursSinceLastAgentAction, setHoursSinceLastAgentAction] = useState("");
  const [budgetTight, setBudgetTight] = useState(false);
  const [buyerNotes, setBuyerNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DealCoachReport | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = {
        stage,
        propertyAddress: propertyAddress.trim() || undefined,
        listPrice: listPrice ? Number(listPrice) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        comparablesMedian: comparablesMedian ? Number(comparablesMedian) : undefined,
        daysOnMarket: daysOnMarket ? Number(daysOnMarket) : undefined,
        marketHeat,
        competingOfferCount: competingOfferCount ? Number(competingOfferCount) : undefined,
        hoursSinceLastAgentAction: hoursSinceLastAgentAction
          ? Number(hoursSinceLastAgentAction)
          : undefined,
        budgetTight,
        buyerNotes: buyerNotes.trim() || undefined,
      };
      const res = await fetch("/api/dashboard/deal-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        report?: DealCoachReport;
        error?: string;
      };
      if (!res.ok || data.ok === false || !data.report) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run coach");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* INPUT FORM */}
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"
      >
        <h2 className="text-base font-semibold text-slate-900">{t("pages.dealCoachPanel.dealContext")}</h2>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stage
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {STAGES.map((s) => (
              <label
                key={s.value}
                className={`cursor-pointer rounded-xl border px-3 py-2 transition ${
                  stage === s.value
                    ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="stage"
                  value={s.value}
                  checked={stage === s.value}
                  onChange={() => setStage(s.value)}
                  className="sr-only"
                />
                <div className="text-sm font-semibold text-slate-900">{s.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-600">{s.description}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <Input
          label={t("pages.dealCoachPanel.address")}
          value={propertyAddress}
          onChange={setPropertyAddress}
          placeholder={t("pages.dealCoachPanel.addressPlaceholder")}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t("pages.dealCoachPanel.listPrice")}
            type="number"
            value={listPrice}
            onChange={setListPrice}
            placeholder="950000"
          />
          <Input
            label={t("pages.dealCoachPanel.maxBudget")}
            type="number"
            value={budgetMax}
            onChange={setBudgetMax}
            placeholder="1000000"
          />
          <Input
            label={t("pages.dealCoachPanel.compsMedian")}
            type="number"
            value={comparablesMedian}
            onChange={setComparablesMedian}
            placeholder="935000"
          />
          <Input
            label={t("pages.dealCoachPanel.daysOnMarket")}
            type="number"
            value={daysOnMarket}
            onChange={setDaysOnMarket}
            placeholder="14"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Market heat
            </legend>
            <div className="mt-1.5 inline-flex rounded-full bg-slate-100 p-0.5">
              {HEAT_OPTIONS.map((h) => (
                <button
                  key={h.value}
                  type="button"
                  onClick={() => setMarketHeat(h.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    marketHeat === h.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Input
            label={t("pages.dealCoachPanel.competingOffers")}
            type="number"
            value={competingOfferCount}
            onChange={setCompetingOfferCount}
            placeholder="0"
          />
        </div>

        <Input
          label={t("pages.dealCoachPanel.hoursSince")}
          type="number"
          value={hoursSinceLastAgentAction}
          onChange={setHoursSinceLastAgentAction}
          placeholder="12"
        />

        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={budgetTight}
            onChange={(e) => setBudgetTight(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Buyer is at or near their hard budget ceiling — surface walk-away guidance.
          </span>
        </label>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Buyer notes <span className="font-medium text-slate-400">{t("pages.dealCoachPanel.optional")}</span>
          </label>
          <textarea
            value={buyerNotes}
            onChange={(e) => setBuyerNotes(e.target.value)}
            rows={3}
            placeholder={t("pages.dealCoachPanel.contextPlaceholder")}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? t("pages.dealCoachPanel.running") : t("pages.dealCoachPanel.run")}
        </button>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}
      </form>

      {/* OUTPUT REPORT */}
      <section className="space-y-4 lg:col-span-3">
        {!report ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
            Fill in the deal context and run the coach to see strategy, risks, negotiation scripts, and a prioritized action plan.
          </div>
        ) : (
          <>
            {/* Headline */}
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                AI Deal Coach
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{report.headline}</h2>
            </div>

            {/* Action plan */}
            <SectionCard title={t("pages.dealCoachPanel.doNext")} subtitle="Prioritized — top items first.">
              <ol className="space-y-2">
                {report.actionPlan.actions.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${PRIORITY_TONE[a.priority]}`}
                    >
                      {a.priority}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{a.rationale}</p>
                      <div className="mt-1 text-[11px] text-slate-400">
                        ~{a.estimatedMinutes} min
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </SectionCard>

            {/* Strategy */}
            {report.strategy ? (
              <SectionCard title={t("pages.dealCoachPanel.pricingStrategy")}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi label={t("pages.dealCoachPanel.recommended")} value={fmtMoney(report.strategy.recommendedPrice)} />
                  <Kpi label={t("pages.dealCoachPanel.strategy")} value={report.strategy.strategy} />
                  <Kpi label={t("pages.dealCoachPanel.confidence")} value={`${report.strategy.confidence}%`} />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">
                  {report.strategy.reasoning}
                </p>
              </SectionCard>
            ) : null}

            {/* Risks */}
            {report.risks ? (
              <SectionCard title={t("pages.dealCoachPanel.riskPillars")}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <RiskCard label={t("pages.dealCoachPanel.overpay")} pillar={report.risks.overpay} />
                  <RiskCard label={t("pages.dealCoachPanel.appraisal")} pillar={report.risks.appraisal} />
                  <RiskCard label={t("pages.dealCoachPanel.market")} pillar={report.risks.market} />
                </div>
              </SectionCard>
            ) : null}

            {/* Negotiation scripts */}
            {report.negotiation ? (
              <SectionCard
                title={t("pages.dealCoachPanel.scripts")}
                subtitle="Three scenarios — adapt the wording to your buyer's voice."
              >
                <div className="space-y-4">
                  {NEGOTIATION_SECTIONS.map(({ key, label }) => {
                    const s = report.negotiation?.[key];
                    if (!s) return null;
                    return (
                      <div key={key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                        <div className="text-sm font-semibold text-slate-900">{label}</div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                          {s.suggestedScript}
                        </p>
                        {s.talkingPoints.length > 0 ? (
                          <div className="mt-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Talking points
                            </div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                              {s.talkingPoints.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {s.pitfalls.length > 0 ? (
                          <div className="mt-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                              Pitfalls
                            </div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                              {s.pitfalls.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {props.label}
      <input
        type={props.type ?? "text"}
        inputMode={props.type === "number" ? "numeric" : undefined}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

function SectionCard(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{props.title}</h3>
        {props.subtitle ? (
          <p className="mt-0.5 text-xs text-slate-600">{props.subtitle}</p>
        ) : null}
      </header>
      {props.children}
    </section>
  );
}

function Kpi(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{props.value}</div>
    </div>
  );
}

function RiskCard({ label, pillar }: { label: string; pillar: RiskPillar }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${RISK_TONE_CLASSES[pillar.level]}`}
        >
          {pillar.level}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-700">{pillar.notes}</p>
      <div className="mt-1 text-[10px] text-slate-400">Score {pillar.score}/100</div>
    </div>
  );
}
