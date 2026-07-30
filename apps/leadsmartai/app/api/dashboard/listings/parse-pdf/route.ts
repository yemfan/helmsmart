import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { extractListingAgreement } from "@/lib/transactions/extractContract";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { resolveUpload } from "@/lib/uploads/storageUpload";

export const runtime = "nodejs";
// Claude PDF extraction can take 15-40s on dense RLAs.
// Default 10s timeout would cut the call short.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/dashboard/listings/parse-pdf
 *
 * Multipart upload with a single `file` field (a PDF of an executed
 * listing agreement). Returns the same ListingAgreementExtraction
 * shape used by the inbound-pipeline review page so the upload
 * client only renders one review screen regardless of the source
 * (manual upload vs. inbound-email forward → review-page CTA).
 *
 * Stateless: the PDF is NOT persisted. We read it into memory,
 * extract via Claude, and drop it. Same privacy posture as the
 * sibling /offers/parse-pdf route.
 */
export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext(); // auth check — throws on 401

    if (!isAnthropicConfigured()) {
      return NextResponse.json(
        { ok: false, error: "AI extraction isn't enabled on this environment." },
        { status: 503 },
      );
    }

    const src = await resolveUpload(req, `listings/${agentId}/`);
    if (!src.ok) {
      return NextResponse.json({ ok: false, error: src.error }, { status: src.status });
    }

    if (src.size > MAX_BYTES) {
      await src.cleanup();
      return NextResponse.json(
        {
          ok: false,
          error:
            "PDF too large (max 5 MB). Trim to the first 4-6 pages of the RLA — that's where price + parties + commission live.",
        },
        { status: 400 },
      );
    }

    const looksLikePdf = src.mime.includes("pdf") || src.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      await src.cleanup();
      return NextResponse.json(
        { ok: false, error: "Only PDF files are supported." },
        { status: 400 },
      );
    }

    const parsed = await extractListingAgreement(src.bytes);
    await src.cleanup();

    return NextResponse.json({ ok: true, parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/parse-pdf:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
