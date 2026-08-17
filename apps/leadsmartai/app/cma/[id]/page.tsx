import { notFound } from "next/navigation";
import type { Metadata } from "next";

import CmaShareView from "@/components/cma/CmaShareView";
import { getPublicCma } from "@/lib/cma/service";
import { isCredibleCmaValuation } from "@/lib/cma/types";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Comparative Market Analysis",
  robots: { index: false },
};

/**
 * Public, shareable CMA — read by id (no auth; share-by-link), same posture
 * as the Deep Report public page. Renders the dedicated CmaShareView.
 */
export default async function PublicCmaPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getServerT();
  const { id } = await params;
  const cma = await getPublicCma(id);
  if (!cma) return notFound();

  // A failed ($0 / no-band) valuation must never render publicly — a shared
  // link should show an unavailable state, not a $0 home value.
  if (!isCredibleCmaValuation(cma.snapshot.valuation)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{t("pages.dashFragments.reportUnavailable", { ns: "dashboard" })}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("pages.dashFragments.reportUnavailableBody", { ns: "dashboard" })}</p>
        </div>
      </div>
    );
  }

  const agent = await loadPresentationAgent(String(cma.agentId)).catch(() => null);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <CmaShareView snapshot={cma.snapshot} agent={agent} title={cma.title} />
      </div>
    </div>
  );
}
