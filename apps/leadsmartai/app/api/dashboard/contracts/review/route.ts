import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { reviewContract } from "@/lib/contracts/reviewContract";
import { getServerLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
// Reading a multi-page contract PDF can take 20-50s.
export const maxDuration = 60;

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 120_000;

/**
 * POST /api/dashboard/contracts/review
 *   - multipart/form-data with field `file` (a PDF), OR
 *   - application/json { text }
 *
 * Returns an AI plain-English contract review (summary, key terms, deadlines,
 * risk flags, blank/missing fields, questions) — explicitly not legal advice.
 */
export async function POST(req: Request) {
  try {
    await getAgentContextFromRequest(req); // auth gate (dual: cookie + mobile bearer)
    // The review explains the contract to the AGENT, so it follows their UI
    // language. The contract's own text is untouched.
    const locale = await getServerLocale();

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ ok: false, error: "Attach a contract PDF." }, { status: 400 });
      }
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json({ ok: false, error: "PDF must be 8 MB or smaller." }, { status: 400 });
      }
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const review = await reviewContract({ kind: "pdf", pdfBytes }, locale);
      return NextResponse.json({ ok: true, review });
    }

    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "Paste the contract text or attach a PDF." }, { status: 400 });
    }
    const review = await reviewContract({ kind: "text", text: text.slice(0, MAX_TEXT) }, locale);
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/contracts/review:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
