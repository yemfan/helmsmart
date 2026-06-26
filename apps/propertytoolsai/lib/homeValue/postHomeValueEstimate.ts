/**
 * Shared POST handler for home value estimate APIs (`/api/home-value-estimate`
 * and `/api/home-value/estimate`).
 *
 * Valuation now runs on the shared @repo/valuation engine (Claude + live web
 * search, cited comps) instead of RentCast. Because each estimate is a
 * ~15-40s billable AI call on a public/guest page, this handler enforces:
 *   1. a durable per-address cache (instant + free on repeat lookups),
 *   2. the token flow for signed-in users (estimator),
 *   3. a per-IP daily cap for guests.
 * The old RentCast pipeline (runEstimate.ts) is retained but no longer called.
 */
import { NextResponse } from "next/server";
import { consumeTokensForTool } from "@/lib/consumeTokens";
import { normalizeHomeValueEstimateRequestBody } from "@/lib/homeValue/normalizeEstimateRequestBody";
import { runAiHomeValueEstimate, AiEstimateError } from "@/lib/homeValue/aiEstimate";
import {
  addressKey,
  getCachedAiEstimate,
  getClientIp,
  checkAndBumpIpUsage,
} from "@/lib/homeValue/aiCache";

export async function handleHomeValueEstimatePost(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const body = normalizeHomeValueEstimateRequestBody(raw);
    const address = (body.address ?? "").trim();
    if (!address) {
      return NextResponse.json({ ok: false, error: "address is required" }, { status: 400 });
    }

    // 1) Cache hit → instant, costs no token and no IP quota.
    if (!body.refresh) {
      const cached = await getCachedAiEstimate(addressKey(address));
      if (cached) return NextResponse.json(cached);
    }

    // 2) Gate. Signed-in users consume an estimator token; guests pass through
    //    here (Infinity) and are bounded by the per-IP cap below.
    const gate = await consumeTokensForTool({ req, tool: "estimator", requireAuth: false });
    if (!gate.ok) {
      // strict:false → no union narrowing on !gate.ok; read via cast.
      const fail = gate as { error?: string; status?: number; plan?: string; tokensRemaining?: number };
      return NextResponse.json(
        { ok: false, error: fail.error ?? "Upgrade required", plan: fail.plan, tokens_remaining: fail.tokensRemaining },
        { status: fail.status ?? 402 },
      );
    }
    const ok = gate as { userId?: string };
    const userId = ok.userId && ok.userId !== "guest" ? ok.userId : null;

    // 3) Guest per-IP daily cap.
    if (!userId) {
      const { allowed, used } = await checkAndBumpIpUsage(getClientIp(req));
      if (!allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: `You've used your ${used} free estimates for today. Create a free account to run more.`,
          },
          { status: 429 },
        );
      }
    }

    // 4) Run the AI estimate (also persists + caches the response).
    const result = await runAiHomeValueEstimate(body, { userId });
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof AiEstimateError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "address is required") {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    console.error("home-value-estimate", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
