import type { CmaSnapshot } from "@/lib/cma/types";
import { getServerT } from "@/lib/i18n/server";
import { cmaBasis, confidenceBand } from "@/lib/cma/confidence";

/**
 * Read-only, presentation-grade render of a saved CMA snapshot — used by the
 * public /cma/[id] share page (share-by-link). Purpose-built for sharing, so
 * it stays a plain server component (no dashboard-only actions like delete /
 * email-to-seller). The dashboard keeps its own richer CmaDetailClient.
 */

export type CmaShareAgent = {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
};

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString()}`;

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </section>
  );
}

export default async function CmaShareView({
  snapshot,
  agent,
  title,
}: {
  snapshot: CmaSnapshot;
  agent: CmaShareAgent | null;
  title?: string | null;
}) {
  const t = await getServerT("dashboard");
  const s = snapshot.subject;
  const v = snapshot.valuation;
  const strat = snapshot.strategies;

  const subjectFacts = [
    s.beds ? `${s.beds} bd` : null,
    s.baths ? `${s.baths} ba` : null,
    s.sqft ? `${s.sqft.toLocaleString()} sqft` : null,
    s.propertyType,
    s.yearBuilt ? `built ${s.yearBuilt}` : null,
  ].filter(Boolean);

  const bands: Array<{ key: string; label: string; price: number; dom: number }> = strat
    ? [
        { key: "aggressive", label: "Aggressive", price: strat.aggressive, dom: strat.daysOnMarket.aggressive },
        { key: "market", label: "Market", price: strat.market, dom: strat.daysOnMarket.market },
        { key: "premium", label: "Premium", price: strat.premium, dom: strat.daysOnMarket.premium },
      ]
    : [];

  return (
    <div className="space-y-5 bg-slate-50 p-1">
      {/* Agent header */}
      {agent && (agent.name || agent.brokerage) ? (
        <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {agent.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{agent.name ?? t("pages.cmaShareView.yourAgent", { ns: "dashboard" })}</div>
            <div className="text-xs text-slate-600">
              {[agent.brokerage, agent.licenseNumber ? `Lic #${agent.licenseNumber}` : null].filter(Boolean).join(" · ")}
            </div>
            <div className="text-xs text-slate-500">{[agent.phone, agent.email].filter(Boolean).join(" · ")}</div>
          </div>
        </section>
      ) : null}

      {/* Hero: address + value range */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.cmaShare.title")}</div>
        <div className="mt-1 text-2xl font-bold text-slate-900">{s.address}</div>
        {subjectFacts.length ? (
          <div className="mt-0.5 text-xs text-slate-500">{subjectFacts.join(" · ")}</div>
        ) : null}
        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
          {[
            ["Low", v.low, "text-slate-700"],
            ["Estimated", v.estimatedValue, "text-emerald-700"],
            ["High", v.high, "text-slate-700"],
          ].map(([label, val, tone]) => (
            <div key={label as string} className="bg-white p-4 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label as string}</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${tone as string}`}>{money(val as number)}</div>
            </div>
          ))}
        </div>
        {v.avgPricePerSqft ? (
          <p className="mt-2 text-xs text-slate-500">~${Math.round(v.avgPricePerSqft)}/sqft</p>
        ) : null}
        {(() => {
            const band = confidenceBand(v.confidenceScore ?? null);
            const basis = cmaBasis(v, snapshot.comps);
            const tone =
              band === "high" ? "text-emerald-700" : band === "medium" ? "text-amber-700" : band === "low" ? "text-rose-700" : "text-slate-500";
            const recency =
              basis.newestSoldMonthsAgo == null
                ? null
                : basis.newestSoldMonthsAgo === 0
                  ? t("pages.cmaConfidence.recencyThisMonth")
                  : basis.newestSoldMonthsAgo === 1
                    ? t("pages.cmaConfidence.recencyOneMonth")
                    : t("pages.cmaConfidence.recencyMonths", { count: basis.newestSoldMonthsAgo });
            return (
              <p className="mt-2 text-xs text-slate-600">
                <span className={`font-semibold ${tone}`}>
                  {band ? t(`pages.cmaConfidence.${band}`, { score: v.confidenceScore ?? null }) : t("pages.cmaConfidence.unknown")}
                </span>
                {" · "}
                {basis.compCount === 0
                  ? t("pages.cmaConfidence.basisNoComps")
                  : t("pages.cmaConfidence.basis", {
                      count: basis.compCount,
                      miles: basis.maxDistanceMiles ?? "—",
                      recency: recency ?? t("pages.cmaConfidence.recencyUnknown"),
                      spread: basis.spreadPct ?? "—",
                    })}
              </p>
            );
          })()}
        {snapshot.summary ? <p className="mt-3 text-sm text-slate-600">{snapshot.summary}</p> : null}
      </section>

      {/* Listing strategies */}
      {bands.length ? (
        <Card title={t("pages.cmaShare.strategies")}>
          <ul className="divide-y divide-slate-100">
            {bands.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-4 py-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                  {b.label}
                </span>
                <span className="text-xs text-slate-500">~{b.dom} {t("pages.dashFragments.daysOnMarketLower")}</span>
                <span className="text-base font-bold tabular-nums text-slate-900">{money(b.price)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Comps */}
      <Card title={`Comparable sales (${snapshot.comps.length})`}>
        {snapshot.comps.length === 0 ? (
          <p className="text-sm text-slate-500">{t("pages.cmaShare.noComps")}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {snapshot.comps.slice(0, 12).map((c, i) => {
                const facts = [
                  c.beds != null ? `${c.beds} bd` : null,
                  c.baths != null ? `${c.baths} ba` : null,
                  c.sqft ? `${c.sqft.toLocaleString()} sqft` : null,
                  c.propertyType,
                  c.yearBuilt ? `built ${c.yearBuilt}` : null,
                ].filter(Boolean);
                return (
                  <tr key={i} className="border-t border-slate-100 align-top first:border-0">
                    <td className="py-1.5 pr-3 text-slate-800">
                      <div>{c.address}</div>
                      {facts.length ? <div className="mt-0.5 text-xs text-slate-500">{facts.join(" · ")}</div> : null}
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right text-slate-600">{c.soldDate || "—"}</td>
                    <td className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold text-slate-900">
                      {money(c.price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Sources */}
      {snapshot.sources && snapshot.sources.length ? (
        <Card title={t("pages.cmaShare.sources")}>
          <ul className="space-y-1 text-xs">
            {snapshot.sources.slice(0, 12).map((src, i) => (
              <li key={i} className="truncate">
                <a href={src.url} target="_blank" rel="noreferrer" className="text-[#0066b3] underline">
                  {src.title || src.url}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {snapshot.disclaimer ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {t("disclaimers.aiCma")}
        </p>
      ) : null}
    </div>
  );
}
