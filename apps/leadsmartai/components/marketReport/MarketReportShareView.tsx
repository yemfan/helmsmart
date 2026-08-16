import type { MarketReportSnapshot } from "@/lib/marketReport/service";
import { formatPeriod } from "@/lib/research/warehouse/format";
import { useTranslation } from "react-i18next";

/**
 * Read-only, client-facing render of a frozen market-report snapshot — used by
 * the public /market-report/[id] share page (share-by-link). Plain server
 * component, agent-branded, CLIENT voice (plain-English labels + "what this
 * means", not the agent-facing "quote this in your CMA" wording).
 *
 * Mirrors CmaShareView's layout + CloseBoss brand blue (#0072ce).
 */

export type MarketReportShareAgent = {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
};

const BRAND = "#0072ce";

/** Signed, one-decimal percent, e.g. "+3.2%" / "-1.0%". */
function pct(delta: number | null | undefined): string | null {
  if (typeof delta !== "number" || !Number.isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function toneClass(delta: number | null | undefined): string {
  if (typeof delta !== "number" || !Number.isFinite(delta)) return "text-slate-500";
  if (delta > 0.05) return "text-emerald-700";
  if (delta < -0.05) return "text-rose-700";
  return "text-slate-500";
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </section>
  );
}

export default function MarketReportShareView({
  snapshot,
  agent,
  cityLabel,
}: {
  snapshot: MarketReportSnapshot;
  agent: MarketReportShareAgent | null;
  cityLabel: string;
}) {
  const { t } = useTranslation("dashboard");
  const asOf = formatPeriod(snapshot.asOfPeriod);
  const contactBits = agent
    ? [agent.phone, agent.email].filter(Boolean)
    : [];

  return (
    <div className="space-y-5">
      {/* Agent header */}
      {agent && (agent.name || agent.brokerage) ? (
        <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {agent.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{agent.name ?? "Your Agent"}</div>
            <div className="text-xs text-slate-600">
              {[agent.brokerage, agent.licenseNumber ? `Lic #${agent.licenseNumber}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="text-xs text-slate-500">{contactBits.join(" · ")}</div>
          </div>
          {agent.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.logoUrl} alt="" className="hidden h-9 w-auto object-contain sm:block" />
          ) : null}
        </section>
      ) : null}

      {/* Hero */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: BRAND }}
        >{t("pages.marketReportShare.title")}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t("pages.marketReportShare.cityUpdate", { city: cityLabel })}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("pages.marketReportShare.snapshotIntro", { geo: snapshot.geoName })}
        </p>
      </section>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {snapshot.stats.map((stat) => (
          <div
            key={stat.metric}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {stat.label}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
              {stat.formatted}
            </div>
            {stat.yoyPct != null || stat.momPct != null ? (
              <div className="mt-1 space-y-0.5 text-[11px]">
                {stat.yoyPct != null ? (
                  <div className={toneClass(stat.yoyPct)}>
                    {pct(stat.yoyPct)} <span className="text-slate-400">{t("pages.marketReportShare.vsLastYear")}</span>
                  </div>
                ) : null}
                {stat.momPct != null ? (
                  <div className={toneClass(stat.momPct)}>
                    {pct(stat.momPct)} <span className="text-slate-400">{t("pages.marketReportShare.vsLastMonth")}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Data provenance */}
      <p className="text-xs text-slate-500">
        {asOf ? t("pages.marketReportShare.dataAsOf", { date: asOf }) : ""}
        {t("pages.marketReportShare.sourceLine", { source: snapshot.source })}
      </p>

      {/* CTA */}
      {agent && (agent.name || agent.email || agent.phone) ? (
        <Card>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t("pages.marketReportShare.curious")}</div>
              <p className="mt-0.5 text-xs text-slate-600">
                {agent.name
                  ? `${agent.name} can walk you through it — no pressure.`
                  : "I can walk you through it — no pressure."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.email ? (
                <a
                  href={`mailto:${agent.email}`}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: BRAND }}
                >
                  {t("pages.marketReportShare.talkTo", { name: agent.name ?? t("pages.marketReportShare.yourAgent") })}
                </a>
              ) : null}
              {agent.phone ? (
                <a
                  href={`tel:${agent.phone.replace(/[^0-9+]/g, "")}`}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {t("pages.marketReportShare.callNumber", { phone: agent.phone })}
                </a>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <p className="text-[11px] leading-relaxed text-slate-400">{t("pages.marketReportShare.disclaimer")}</p>
    </div>
  );
}
