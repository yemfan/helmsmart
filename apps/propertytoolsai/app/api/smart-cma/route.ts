import { NextResponse } from "next/server";
import { generateAiCma, isValuationFailure } from "@repo/valuation/server";
import { consumeTokensForTool } from "@/lib/consumeTokens";
import { getCmaUsage, incrementCmaUsage } from "@/lib/cmaUsage";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMarketplaceSessionId } from "@/lib/marketplaceSessionId";
import { recordLeadEvent, scoreLead } from "@/lib/leadScoring";

export const runtime = "nodejs";
// Claude + web_search over real comparable sales runs ~15-40s.
export const maxDuration = 60;

type PropertyInput = {
  address: string;
  lead_id?: string | number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  condition?: string;
};

/** Coerce a body field to a positive number, else undefined (omit from input). */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * POST /api/smart-cma — AI-grounded Comparative Market Analysis.
 *
 * Replaces the former Rentcast AVM + warehouse-comp pipeline with the shared
 * `@repo/valuation` engine: Claude searches the web for recent comparable sales
 * (each cited) and returns a `CmaSnapshot`. All non-Rentcast behavior is
 * preserved: daily CMA usage limits, token gating, marketplace opportunity
 * logging, and lead scoring. The response JSON shape is unchanged so the Smart
 * CMA Builder page keeps working. The legacy `?refresh=true` param is now a
 * no-op (there's no warehouse cache to bypass).
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    // Daily CMA limits by role:
    // anonymous=2, user=5, agent=10.
    const preUsage = await getCmaUsage(request);
    if (preUsage.reached) {
      return NextResponse.json(
        {
          error: "You’ve reached your limit",
          usage: preUsage,
        },
        { status: 402 }
      );
    }

    const gate = await consumeTokensForTool({
      req: request,
      tool: "cma",
      requireAuth: false,
    });
    if (!gate.ok) {
      // ConsumeResult is a union; this app compiles with strict:false, which
      // doesn't narrow on `!gate.ok`, so read the failure fields via a cast.
      const fail = gate as {
        error?: string;
        message?: string;
        status?: number;
        plan?: string;
        tokensRemaining?: number;
      };
      return NextResponse.json(
        {
          error: fail.error ?? fail.message ?? "Access denied",
          plan: fail.plan,
          tokens_remaining: fail.tokensRemaining,
        },
        { status: fail.status ?? 402 }
      );
    }

    const postUsage = await incrementCmaUsage(request);

    const body = (await request.json().catch(() => ({}))) as PropertyInput;
    const address = body.address?.trim();
    const leadId = String((body as any).lead_id ?? "").trim();

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    const subjectCondition =
      typeof body.condition === "string" && body.condition.trim()
        ? body.condition
        : "Average";

    const result = await generateAiCma({
      address,
      beds: posNum(body.beds),
      baths: posNum(body.baths),
      sqft: posNum(body.sqft),
      yearBuilt: posNum(body.yearBuilt),
      condition: subjectCondition,
    });

    // Use the type-guard (not `!result.ok`) so this narrows under strict:false.
    if (isValuationFailure(result)) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    const snapshot = result.snapshot;
    const subject = snapshot.subject;
    const valuation = snapshot.valuation;

    const comps = (snapshot.comps ?? []).map((c) => ({
      address: c.address,
      price: c.price,
      sqft: c.sqft,
      beds: c.beds,
      baths: c.baths,
      distanceMiles: c.distanceMiles,
      soldDate: c.soldDate,
      propertyType: c.propertyType,
      pricePerSqft: c.pricePerSqft,
    }));

    const estimatedValue = valuation.estimatedValue;
    const low = valuation.low;
    const high = valuation.high;
    const avgPricePerSqft = valuation.avgPricePerSqft;

    // Strategies may be null when the AI couldn't produce a pricing ladder.
    // Fall back to a simple ±spread around the estimate so the client (which
    // always renders the strategy card) never crashes on missing fields.
    const strategies = snapshot.strategies ?? {
      aggressive: estimatedValue * 0.95,
      market: estimatedValue,
      premium: estimatedValue * 1.03,
      daysOnMarket: { aggressive: 24, market: 30, premium: 45 },
    };

    // Marketplace tracking: log that CMA was generated for this address.
    // Best-effort: failures must not break the tool response.
    try {
      const sessionId = getMarketplaceSessionId(request);
      await supabaseServer.rpc(
        "log_tool_usage_and_update_opportunity",
        {
          p_user_id: user?.id ?? null,
          p_session_id: sessionId,
          p_tool_name: "cma",
          p_property_address: address,
          p_action: "generate",
          p_estimated_value: estimatedValue,
        } as any
      );
    } catch {}

    if (leadId) {
      try {
        await recordLeadEvent({
          lead_id: leadId as any,
          event_type: "cma_run",
          metadata: { address },
        });
        await scoreLead(leadId, true);
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      usage: postUsage,
      subject: {
        address: subject.address,
        beds: subject.beds ?? 0,
        baths: subject.baths ?? 0,
        sqft: subject.sqft ?? posNum(body.sqft) ?? 0,
        propertyType: subject.propertyType ?? null,
        yearBuilt: subject.yearBuilt ?? 0,
        condition: subject.condition ?? subjectCondition,
      },
      comps,
      avgPricePerSqft,
      estimatedValue,
      low,
      high,
      strategies: {
        aggressive: strategies.aggressive,
        market: strategies.market,
        premium: strategies.premium,
        daysOnMarket: {
          aggressive: strategies.daysOnMarket.aggressive,
          market: strategies.daysOnMarket.market,
          premium: strategies.daysOnMarket.premium,
        },
      },
      summary: snapshot.summary ?? "",
    });
  } catch (e: any) {
    console.error("smart-cma error", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
