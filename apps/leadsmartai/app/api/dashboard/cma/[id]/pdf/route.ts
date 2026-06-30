import { buildCmaPdf } from "@/lib/cma/buildCmaPdf";
import { loadAgentIdentity } from "@/lib/cma/loadAgentIdentity";
import { getCmaForAgent } from "@/lib/cma/service";
import { isCredibleCmaValuation } from "@/lib/cma/types";
import { getCurrentAgentContext } from "@/lib/dashboardService";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/cma/[id]/pdf
 *
 * Streams a printable / shareable CMA PDF for a saved report. Agent
 * identity (name, brokerage, license, contact info) is best-effort:
 * the PDF still generates with blank fields if any of them are
 * missing. RLS gates ownership at the DB layer; we double-check by
 * fetching with `getCmaForAgent` (returns null for unauthorized).
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

    // Don't export a non-credible ($0 / no-band) valuation as a PDF.
    if (!isCredibleCmaValuation(cma.snapshot.valuation)) {
      return new Response(
        "This CMA didn't return a reliable valuation. Regenerate it before exporting.",
        { status: 422 },
      );
    }

    const agent = await loadAgentIdentity(String(agentId));

    const bytes = buildCmaPdf({
      snapshot: cma.snapshot,
      title: cma.title,
      agent,
      generatedAtIso: cma.createdAt,
    });

    const addrSlug = cma.subjectAddress
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 60) || "cma";
    const filename = `cma-${addrSlug}-${cma.createdAt.slice(0, 10)}.pdf`;

    // jsPDF returns a Uint8Array; wrap to satisfy the Blob constructor's
    // strict BodyInit typing under lib.dom.
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
    console.error("cma pdf:", err);
    return new Response(message, { status: 500 });
  }
}
