import { NextResponse } from "next/server";
import { consumeTokensForTool } from "@/lib/consumeTokens";
import { generateAiCma } from "@repo/valuation/server";

export const runtime = "nodejs";
// Claude + web_search over real comparable sales runs ~15-40s.
export const maxDuration = 60;

/**
 * POST /api/cma/generate — AI-grounded Comparative Market Analysis.
 *
 * Replaces the page's sample comps with a real CMA: Claude searches the web
 * for recent comparable sales (each cited with a source URL), derives a value
 * range, and returns a `CmaSnapshot`. Shared engine — `@repo/valuation` — also
 * powers the RealtyBoss agent CMA, so both apps stay in lockstep.
 *
 * Gating: token flow (`cma` = 5 tokens) for signed-in users; guests allowed
 * (matches the existing /api/smart-cma behavior).
 */
export async function POST(req: Request) {
  const gate = await consumeTokensForTool({ req, tool: "cma", requireAuth: false });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error, plan: gate.plan, tokens_remaining: gate.tokensRemaining },
      { status: gate.status },
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

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, snapshot: result.snapshot });
}

/** Coerce a body field to a positive number, else undefined (omit from input). */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
