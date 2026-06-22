import { buildCmaReportPdf } from "@/lib/cma/buildCmaReportPdf";
import { loadAgentIdentity } from "@/lib/cma/loadAgentIdentity";
import { getCmaForAgent } from "@/lib/cma/service";
import { fetchSubjectPhoto } from "@/lib/cma/streetViewPhoto";
import { getCurrentAgentContext } from "@/lib/dashboardService";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/cma/[id]/report
 *
 * Streams the presentation-grade CMA report — branded cover with a
 * single Street View photo of the subject, hero value range, listing
 * strategies, comps, and cited sources. Distinct from /pdf (the plain
 * quick export). RLS gates ownership; we re-check via getCmaForAgent.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const cma = await getCmaForAgent(String(agentId), id);
    if (!cma) {
      return new Response("Not found", { status: 404 });
    }

    const [agent, photo] = await Promise.all([
      loadAgentIdentity(String(agentId)),
      fetchSubjectPhoto(cma.snapshot.subject.address || cma.subjectAddress),
    ]);

    const bytes = buildCmaReportPdf({
      snapshot: cma.snapshot,
      title: cma.title,
      agent,
      photo,
      generatedAtIso: cma.createdAt,
    });

    const addrSlug =
      cma.subjectAddress
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .slice(0, 60) || "cma";
    const filename = `cma-report-${addrSlug}-${cma.createdAt.slice(0, 10)}.pdf`;

    const pdfBlob = new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/pdf",
    });
    return new Response(pdfBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("cma report:", err);
    return new Response(message, { status: 500 });
  }
}
