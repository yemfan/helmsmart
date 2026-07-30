import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { extractContract, extractListingAgreement } from "@/lib/transactions/extractContract";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { resolveUpload } from "@/lib/uploads/storageUpload";

export const runtime = "nodejs";
// PDF extraction can take 15-40s for complex contracts. Default 10s timeout
// would cut the call short before Claude responds. Bump to 60s.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/dashboard/transactions/extract-contract
 *
 * Accepts a multipart upload with a single `file` field (PDF of a ratified
 * CAR RPA) and returns structured deal facts for the new-transaction form
 * to pre-populate.
 *
 * Intentionally stateless: the PDF is NOT persisted. We read it into
 * memory, extract, and drop it. If the feature grows to include batch
 * re-processing or audit trails, we'll add Supabase Storage then — but
 * minimizing the data surface is good for both privacy and incident
 * response.
 *
 * Errors are returned as 4xx/5xx with a user-visible message that the
 * form renders above the upload zone.
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

    const src = await resolveUpload(req, `contracts/${agentId}/`);
    if (!src.ok) {
      return NextResponse.json({ ok: false, error: src.error }, { status: src.status });
    }

    if (src.size > MAX_BYTES) {
      await src.cleanup();
      return NextResponse.json({ ok: false, error: "PDF too large (max 5 MB)." }, { status: 400 });
    }

    // Content-type check is advisory — some browsers send generic
    // application/octet-stream. File extension is also checked as a
    // secondary signal, but the extractor will surface a confidence-low
    // warning if the doc isn't actually an RPA.
    const looksLikePdf = src.mime.includes("pdf") || src.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      await src.cleanup();
      return NextResponse.json({ ok: false, error: "Only PDF files are supported." }, { status: 400 });
    }

    // `kind=listing` → RLA extractor, anything else → RPA (default).
    const kind = src.field("kind") === "listing" ? "listing" : "purchase";
    const extraction =
      kind === "listing"
        ? await extractListingAgreement(src.bytes)
        : await extractContract(src.bytes);
    await src.cleanup();

    return NextResponse.json({ ok: true, kind, extraction });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/transactions/extract-contract:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
