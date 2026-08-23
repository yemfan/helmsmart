import { notFound } from "next/navigation";
import type { Metadata } from "next";

import MarketReportShareView from "@/components/marketReport/MarketReportShareView";
import { getPublicMarketReport } from "@/lib/marketReport/service";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.marketReportShare.title", { ns: "web_marketing" });
  return {
  title,
  // Private client shares — keep them out of the index.
  robots: { index: false, follow: false },
};
}

/**
 * Public, shareable market report — read by id (no auth; share-by-link), same
 * posture as the CMA share page. Renders the client-facing MarketReportShareView
 * with the agent's branding. The snapshot is frozen at creation time.
 */
export default async function PublicMarketReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getServerT();
  const { id } = await params;
  const report = await getPublicMarketReport(id);
  if (!report) return notFound();

  const agent = await loadPresentationAgent(report.agentId).catch(() => null);

  const cityLabel =
    (report.subjectCity ?? "").trim() ||
    report.snapshot.geoName ||
    "Your local";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <MarketReportShareView
          snapshot={report.snapshot}
          agent={agent}
          cityLabel={cityLabel}
        />
      </div>
    </div>
  );
}
