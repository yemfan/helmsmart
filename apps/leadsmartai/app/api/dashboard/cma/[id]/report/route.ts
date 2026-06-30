import { buildCmaReportPdf } from "@/lib/cma/buildCmaReportPdf";
import { getCmaForAgent } from "@/lib/cma/service";
import { isCredibleCmaValuation } from "@/lib/cma/types";
import {
  fetchListingPhoto,
  fetchPhotoFromListingPage,
  fetchSubjectPhoto,
} from "@/lib/cma/streetViewPhoto";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { generatePresentationAISections } from "@/lib/presentationAI";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";

export const runtime = "nodejs";
// Agent images + a schools/neighborhood web search run alongside the photo.
export const maxDuration = 300;

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

    // Don't build a presentation report on a non-credible ($0 / no-band) value.
    if (!isCredibleCmaValuation(cma.snapshot.valuation)) {
      return new Response(
        "This CMA didn't return a reliable valuation. Regenerate it before building a report.",
        { status: 422 },
      );
    }

    const subjectAddress = cma.snapshot.subject.address || cma.subjectAddress;
    const v = cma.snapshot.valuation;
    const [profile, listingPhoto, aiSections] = await Promise.all([
      loadPresentationAgent(String(agentId)),
      // The real listing photo (og:image) from the subject's listing page.
      fetchPhotoFromListingPage(cma.snapshot.subject.listingUrl),
      // Web-search grounded neighborhood + schools for the professional report.
      generatePresentationAISections({
        address: subjectAddress,
        estimate: {
          estimatedValue: v.estimatedValue ?? null,
          low: v.low ?? null,
          high: v.high ?? null,
          avgPricePerSqft: v.avgPricePerSqft ?? null,
          summary: cma.snapshot.summary ?? "",
        },
        comps: cma.snapshot.comps.map((c) => ({
          address: c.address,
          price: c.price,
          sqft: c.sqft,
          soldDate: c.soldDate,
          distanceMiles: c.distanceMiles,
        })),
      }),
    ]);

    // Fall back to a Street View shot when there's no usable listing photo.
    const photo = listingPhoto ?? (await fetchSubjectPhoto(subjectAddress));
    // Agent headshot + brokerage logo (fetched + embedded; null hides them).
    const [agentPhoto, agentLogo] = await Promise.all([
      fetchListingPhoto(profile.photoUrl),
      fetchListingPhoto(profile.logoUrl),
    ]);

    const bytes = buildCmaReportPdf({
      snapshot: cma.snapshot,
      title: cma.title,
      agent: {
        name: profile.name,
        brokerage: profile.brokerage,
        phone: profile.phone,
        email: profile.email,
        licenseNumber: profile.licenseNumber,
      },
      photo,
      agentPhoto,
      agentLogo,
      schools: aiSections.schools,
      neighborhood: aiSections.neighborhood,
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
