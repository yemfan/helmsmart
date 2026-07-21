import { NextResponse } from "next/server";
import { consumeTokensForTool } from "@/lib/consumeTokens";
import { generateAiCma, isValuationFailure } from "@repo/valuation/server";

export const runtime = "nodejs";
// Claude + web_search over real comparable sales runs ~15-40s.
export const maxDuration = 60;

/**
 * POST /api/cma/generate — AI-grounded Comparative Market Analysis.
 *
 * Replaces the page's sample comps with a real CMA: Claude searches the web
 * for recent comparable sales (each cited with a source URL), derives a value
 * range, and returns a `CmaSnapshot`. Shared engine — `@repo/valuation` — also
 * powers the CloseBoss agent CMA, so both apps stay in lockstep.
 *
 * Gating: token flow (`cma` = 5 tokens) for signed-in users; guests allowed
 * (matches the existing /api/smart-cma behavior).
 */
export async function POST(req: Request) {
  const gate = await consumeTokensForTool({ req, tool: "cma", requireAuth: false });
  if (!gate.ok) {
    // ConsumeResult is a union; this app compiles with strict:false, which
    // doesn't narrow on `!gate.ok`, so read the failure fields via a cast
    // (same pattern as /api/smart-cma).
    const fail = gate as { error?: string; status?: number; plan?: string; tokensRemaining?: number };
    return NextResponse.json(
      { ok: false, error: fail.error ?? "Access denied", plan: fail.plan, tokens_remaining: fail.tokensRemaining },
      { status: fail.status ?? 402 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body → address check below fails with 400 */
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address) {
    return NextResponse.json({ ok: false, error: "address is required" }, { status: 400 });
  }

  const result = await generateAiCma({
    address,
    beds: posNum(body.beds),
    baths: posNum(body.baths),
    sqft: posNum(body.sqft),
    yearBuilt: posNum(body.yearBuilt),
    condition: typeof body.condition === "string" ? body.condition : undefined,
  });

  // Use the type-guard (not `!result.ok`) so this narrows under strict:false.
  if (isValuationFailure(result)) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, snapshot: result.snapshot });
}

/** Coerce a body field to a positive number, else undefined (omit from input). */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
