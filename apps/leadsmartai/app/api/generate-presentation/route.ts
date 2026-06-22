import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateAiCma } from "@/lib/cma/aiCma";
import { generatePresentationAISections } from "@/lib/presentationAI";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { consumeTokensForTool } from "@/lib/consumeTokens";

type Body = {
  address: string;
};

export const runtime = "nodejs";
// The AI CMA runs live web searches across several tool rounds.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const gate = await consumeTokensForTool({
      req,
      tool: "presentation",
      requireAuth: true,
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          success: false,
          message: (gate as any).error ?? (gate as any).message ?? "Access denied",
          plan: gate.plan,
          tokens_remaining: gate.tokensRemaining,
        },
        { status: (gate as any).status ?? 402 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const address = String(body.address ?? "").trim();

    if (!address) {
      return NextResponse.json(
        { success: false, message: "address is required" },
        { status: 400 }
      );
    }

    const ctx = await getCurrentAgentContext();
    const presentationAgentId = ctx.userId;

    // 1) Valuation + comps from the SAME AI CMA engine the CMA feature
    // uses (Claude + live web search), so the presentation's pricing is
    // consistent with the agent's CMA — no separate/legacy comp pipeline.
    const cma = await generateAiCma({ address });
    if (!cma.ok) {
      return NextResponse.json(
        { success: false, message: cma.error },
        { status: cma.status },
      );
    }
    const snap = cma.snapshot;

    const property = {
      address: snap.subject.address,
      city: null as string | null,
      state: null as string | null,
      beds: snap.subject.beds || null,
      baths: snap.subject.baths || null,
      sqft: snap.subject.sqft || null,
      propertyType: snap.subject.propertyType,
      yearBuilt: snap.subject.yearBuilt || null,
    };
    const estimate = {
      estimatedValue: snap.valuation.estimatedValue || null,
      low: snap.valuation.low || null,
      high: snap.valuation.high || null,
      avgPricePerSqft: snap.valuation.avgPricePerSqft || null,
      summary: snap.summary ?? "",
    };
    const comps = snap.comps.map((c) => ({
      address: c.address,
      price: c.price,
      sqft: c.sqft,
      pricePerSqft: c.pricePerSqft,
      distanceMiles: c.distanceMiles,
      soldDate: c.soldDate,
      beds: c.beds,
      baths: c.baths,
      propertyType: c.propertyType,
    }));

    // 2) Narrative sections (pricing strategy / market insights / marketing
    // plan) from the AI valuation + comps.
    const aiSections = await generatePresentationAISections({
      address: property.address,
      estimate,
      comps: comps.map((c) => ({
        address: c.address,
        price: c.price,
        sqft: c.sqft,
        soldDate: c.soldDate,
        distanceMiles: c.distanceMiles,
      })),
    });

    // 3) Combine into structured JSON for storage + preview.
    const presentationData = {
      property,
      estimate,
      comps,
      pricing_strategy: aiSections.pricing_strategy,
      market_insights: aiSections.market_insights,
      marketing_plan: aiSections.marketing_plan,
    };

    // 4) Save to `presentations`.
    const { data: inserted, error } = await supabaseServer
      .from("presentations")
      .insert({
        agent_id: presentationAgentId,
        property_address: property.address,
        data: presentationData,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      return NextResponse.json(
        { success: false, message: error?.message ?? "Failed to save presentation." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      presentation_id: String(inserted.id),
      data: presentationData,
    });
  } catch (e: any) {
    console.error("generate-presentation error", e);
    return NextResponse.json(
      { success: false, message: e?.message ?? "Server error generating presentation." },
      { status: 500 }
    );
  }
}

