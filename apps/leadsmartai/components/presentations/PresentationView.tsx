"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import ShareReport from "@/components/share/ShareReport";

/**
 * Single source of truth for rendering a seller listing presentation —
 * used by both the dashboard generator (PresentationsClient) and the
 * public share page (PresentationPublicClient), so the two can't drift
 * (they used to be separate copies, which caused a render crash).
 *
 * Normalizes any historical `data` shape into one safe view model:
 *   - current: { property, estimate, comps, pricing_strategy, market_insights,
 *       marketing_plan, neighborhood, schools, agent, sources }
 *   - legacy "seller_comparison": subject nested in properties[0], narrative in
 *       executive_summary / market_overview / recommendation.
 */

type RawData = Record<string, any> | null | undefined;

type School = { name: string; level: string | null; rating: string | null; distance: string | null };

type Agent = {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
};

type VM = {
  address: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  lotSizeSqft: number | null;
  hoaMonthly: number | null;
  estimatedValue: number | null;
  low: number | null;
  high: number | null;
  avgPricePerSqft: number | null;
  comps: Array<{ address: string; price: number | null; sqft: number | null; pricePerSqft: number | null; soldDate: string | null }>;
  pricing_strategy: string;
  market_insights: string;
  marketing_plan: string;
  neighborhood: string;
  schools: School[];
  agent: Agent | null;
  sources: Array<{ title: string; url: string }>;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
const money = (n: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString()}`;
function lot(n: number | null, propertyType: string | null): string {
  if (propertyType && /condo|town/i.test(propertyType)) return "—";
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return n >= 43560 ? `${(n / 43560).toFixed(2)} ac` : `${Math.round(n).toLocaleString()} sf`;
}
const hoa = (n: number | null) =>
  n == null || !Number.isFinite(n) || n <= 0 ? "—" : `$${Math.round(n).toLocaleString()}/mo`;

function normalize(data: RawData, fallbackAddress: string): VM {
  const d = (data ?? {}) as Record<string, any>;
  const legacy = Array.isArray(d.properties) ? d.properties[0] : undefined;
  const p = (d.property ?? legacy ?? {}) as Record<string, any>;
  const est = (d.estimate ?? legacy ?? {}) as Record<string, any>;
  const rawComps = Array.isArray(d.comps) ? d.comps : Array.isArray(legacy?.comps) ? legacy.comps : [];

  const comps = rawComps
    .filter((c: any) => c && typeof c === "object")
    .map((c: any) => ({
      address: str(c.address) || "—",
      price: num(c.price ?? c.soldPrice ?? c.sold_price),
      sqft: num(c.sqft),
      pricePerSqft: num(c.pricePerSqft ?? c.price_per_sqft),
      soldDate: c.soldDate ?? c.sold_date ?? null,
    }));

  const rawSchools = Array.isArray(d.schools) ? d.schools : [];
  const schools: School[] = rawSchools
    .filter((s: any) => s && typeof s === "object" && str(s.name))
    .map((s: any) => ({
      name: str(s.name),
      level: s.level == null ? null : String(s.level),
      rating: s.rating == null ? null : String(s.rating),
      distance: s.distance == null ? null : String(s.distance),
    }));

  const a = (d.agent ?? null) as Record<string, any> | null;
  const agent: Agent | null = a
    ? {
        name: a.name ?? null,
        brokerage: a.brokerage ?? null,
        phone: a.phone ?? null,
        email: a.email ?? null,
        licenseNumber: a.licenseNumber ?? null,
        photoUrl: a.photoUrl ?? null,
        logoUrl: a.logoUrl ?? null,
      }
    : null;

  const rawSources = Array.isArray(d.sources) ? d.sources : [];
  const sources = rawSources
    .filter((s: any) => s && typeof s === "object" && str(s.url))
    .map((s: any) => ({ title: str(s.title) || str(s.url), url: str(s.url) }));

  return {
    address: str(p.address) || fallbackAddress || "Listing Presentation",
    beds: num(p.beds),
    baths: num(p.baths),
    sqft: num(p.sqft),
    propertyType: p.propertyType ?? p.property_type ?? null,
    yearBuilt: num(p.yearBuilt ?? p.year_built),
    lotSizeSqft: num(p.lotSizeSqft ?? p.lot_size_sqft ?? p.lotSize),
    hoaMonthly: num(p.hoaMonthly ?? p.hoa_monthly),
    estimatedValue: num(est.estimatedValue ?? est.estimated_value),
    low: num(est.low),
    high: num(est.high),
    avgPricePerSqft: num(est.avgPricePerSqft ?? est.avg_price_per_sqft),
    comps,
    pricing_strategy: str(d.pricing_strategy || d.recommendation),
    market_insights: str(d.market_insights || d.market_overview || d.executive_summary),
    marketing_plan: str(d.marketing_plan || d.executive_summary),
    neighborhood: str(d.neighborhood),
    schools,
    agent,
    sources,
  };
}

export function buildPresentationPdf(vm: VM, jsPDF: any) {
  const doc = new jsPDF();
  const money2 = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
  let y = 12;
  const line = (t: string, size = 10, dy = 5) => {
    doc.setFontSize(size);
    doc.splitTextToSize(t, 185).forEach((ln: string) => {
      if (y > 280) {
        doc.addPage();
        y = 12;
      }
      doc.text(ln, 12, y);
      y += dy;
    });
  };
  const heading = (t: string) => {
    y += 3;
    line(t, 13, 6);
  };

  doc.setFontSize(16);
  doc.text("Listing Presentation", 12, y);
  y += 8;
  line(vm.address, 11, 6);
  if (vm.agent?.name) line(`Prepared by ${vm.agent.name}${vm.agent.brokerage ? ` · ${vm.agent.brokerage}` : ""}`, 9, 6);

  heading("Property Details");
  line(
    `${vm.beds ?? "—"} bd • ${vm.baths ?? "—"} ba • ${vm.sqft ? vm.sqft.toLocaleString() : "—"} sqft • ${vm.propertyType ?? "—"}` +
      ` • built ${vm.yearBuilt ?? "—"} • lot ${lot(vm.lotSizeSqft, vm.propertyType)} • HOA ${hoa(vm.hoaMonthly)}`,
  );

  heading("Estimated Value");
  line(`Estimate: ${money2(vm.estimatedValue)}   Range: ${money2(vm.low)} – ${money2(vm.high)}`);

  heading("Pricing Strategy");
  line(vm.pricing_strategy || "—");
  heading("Market Insights");
  line(vm.market_insights || "—");
  heading("Marketing Plan");
  line(vm.marketing_plan || "—");
  if (vm.neighborhood) {
    heading("Neighborhood");
    line(vm.neighborhood);
  }
  if (vm.schools.length) {
    heading("Schools");
    vm.schools.forEach((s) =>
      line(`• ${s.name}${s.level ? ` (${s.level})` : ""}${s.rating ? ` — ${s.rating}` : ""}${s.distance ? ` · ${s.distance}` : ""}`),
    );
  }
  heading(`Comparable Sales (${vm.comps.length})`);
  vm.comps.slice(0, 8).forEach((c, i) =>
    line(`${i + 1}. ${c.address} — ${money2(c.price)}${c.soldDate ? ` (${c.soldDate})` : ""}`),
  );

  if (vm.agent && (vm.agent.name || vm.agent.email || vm.agent.phone)) {
    heading("Your Agent");
    line(
      [vm.agent.name, vm.agent.brokerage, vm.agent.licenseNumber ? `Lic #${vm.agent.licenseNumber}` : null]
        .filter(Boolean)
        .join(" · ") || "—",
    );
    const contact = [vm.agent.phone, vm.agent.email].filter(Boolean).join(" · ");
    if (contact) line(contact);
  }
  return doc;
}

export default function PresentationView({
  data,
  propertyAddress,
  shareUrl = null,
}: {
  data: RawData;
  propertyAddress?: string;
  /** Public share URL (dashboard only) → enables the full Share menu. */
  shareUrl?: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const vm = useMemo(() => normalize(data, propertyAddress ?? ""), [data, propertyAddress]);

  const onDownloadPdf = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      buildPresentationPdf(vm, jsPDF).save("listing-presentation.pdf");
    } catch (e) {
      console.error(e);
      alert("Could not generate the PDF. Please try again.");
    }
  };

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );

  const detail = (label: string, value: string) => (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Agent header */}
      {vm.agent && (vm.agent.name || vm.agent.brokerage || vm.agent.email) ? (
        <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {vm.agent.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vm.agent.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-lg font-bold text-white">
              {(vm.agent.name ?? "A").trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{vm.agent.name ?? "Your Agent"}</div>
            <div className="text-xs text-slate-600">
              {[vm.agent.brokerage, vm.agent.licenseNumber ? `Lic #${vm.agent.licenseNumber}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {[vm.agent.phone, vm.agent.email].filter(Boolean).join(" · ")}
            </div>
          </div>
          {vm.agent.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vm.agent.logoUrl} alt="" className="hidden h-9 max-w-[120px] object-contain sm:block" />
          ) : null}
        </section>
      ) : null}

      {/* Hero: address + value */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.presentationView.title")}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{vm.address}</div>
          </div>
          <div className="shrink-0">
            <ShareReport
              shareUrl={shareUrl}
              onDownloadPdf={onDownloadPdf}
              subject={`Listing Presentation — ${vm.address}`}
              resourceLabel={`the listing presentation for ${vm.address}`}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
          {[
            ["Low", vm.low, "text-slate-700"],
            ["Estimated", vm.estimatedValue, "text-emerald-700"],
            ["High", vm.high, "text-slate-700"],
          ].map(([label, val, tone]) => (
            <div key={label as string} className="bg-white p-4 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label as string}</div>
              <div className={`mt-1 text-xl font-bold tabular-nums ${tone as string}`}>{money(val as number | null)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Property details */}
      <Card title={t("pages.presentationView.propertyDetails")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {detail("Beds", vm.beds != null ? String(vm.beds) : "—")}
          {detail("Baths", vm.baths != null ? String(vm.baths) : "—")}
          {detail("Sqft", vm.sqft ? vm.sqft.toLocaleString() : "—")}
          {detail("Type", vm.propertyType ?? "—")}
          {detail("Year built", vm.yearBuilt ? String(vm.yearBuilt) : "—")}
          {detail("Lot", lot(vm.lotSizeSqft, vm.propertyType))}
          {detail("HOA", hoa(vm.hoaMonthly))}
          {detail("$/sqft", vm.avgPricePerSqft ? `$${Math.round(vm.avgPricePerSqft).toLocaleString()}` : "—")}
        </div>
      </Card>

      {/* Narrative */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title={t("pages.presentationView.pricingStrategy")}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{vm.pricing_strategy || "—"}</p>
        </Card>
        <Card title={t("pages.presentationView.marketInsights")}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{vm.market_insights || "—"}</p>
        </Card>
        <Card title={t("pages.presentationView.marketingPlan")}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{vm.marketing_plan || "—"}</p>
        </Card>
      </div>

      {/* Neighborhood + Schools */}
      {vm.neighborhood ? (
        <Card title={t("pages.presentationView.neighborhood")}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{vm.neighborhood}</p>
        </Card>
      ) : null}

      {vm.schools.length ? (
        <Card title={t("pages.presentationView.schools")}>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="text-left">
                <th className="py-1 font-semibold">{t("pages.presentationView.school")}</th>
                <th className="py-1 font-semibold">{t("pages.presentationView.level")}</th>
                <th className="py-1 font-semibold">{t("pages.presentationView.rating")}</th>
                <th className="py-1 text-right font-semibold">{t("pages.presentationView.distance")}</th>
              </tr>
            </thead>
            <tbody>
              {vm.schools.map((s, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-800">{s.name}</td>
                  <td className="py-1.5 text-slate-600">{s.level ?? "—"}</td>
                  <td className="py-1.5 text-slate-600">{s.rating ?? "—"}</td>
                  <td className="py-1.5 text-right text-slate-600">{s.distance ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* Comps */}
      <Card title={`Comparable Sales (${vm.comps.length})`}>
        {vm.comps.length === 0 ? (
          <p className="text-sm text-slate-500">{t("pages.presentationView.noComps")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr className="text-left">
                  <th className="py-1 font-semibold">{t("pages.presentationView.address")}</th>
                  <th className="py-1 text-right font-semibold">{t("pages.presentationView.sqft")}</th>
                  <th className="py-1 text-right font-semibold">$/sqft</th>
                  <th className="py-1 text-right font-semibold">{t("pages.presentationView.sold")}</th>
                  <th className="py-1 text-right font-semibold">{t("pages.presentationView.price")}</th>
                </tr>
              </thead>
              <tbody>
                {vm.comps.slice(0, 8).map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 text-slate-800">{c.address}</td>
                    <td className="py-1.5 text-right text-slate-600">{c.sqft ? c.sqft.toLocaleString() : "—"}</td>
                    <td className="py-1.5 text-right text-slate-600">
                      {c.pricePerSqft ? `$${Math.round(c.pricePerSqft)}` : "—"}
                    </td>
                    <td className="py-1.5 text-right text-slate-600">{c.soldDate ?? "—"}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">{money(c.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Sources */}
      {vm.sources.length ? (
        <Card title={t("pages.presentationView.sources")}>
          <ul className="space-y-1 text-xs text-slate-500">
            {vm.sources.slice(0, 12).map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
