import { notFound } from "next/navigation";
import type { Metadata } from "next";

import CmaShareView from "@/components/cma/CmaShareView";
import { getPublicCma } from "@/lib/cma/service";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";

export const metadata: Metadata = {
  title: "Comparative Market Analysis",
  robots: { index: false },
};

/**
 * Public, shareable CMA — read by id (no auth; share-by-link), same posture
 * as the Deep Report public page. Renders the dedicated CmaShareView.
 */
export default async function PublicCmaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cma = await getPublicCma(id);
  if (!cma) return notFound();

  const agent = await loadPresentationAgent(String(cma.agentId)).catch(() => null);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <CmaShareView snapshot={cma.snapshot} agent={agent} title={cma.title} />
      </div>
    </div>
  );
}
