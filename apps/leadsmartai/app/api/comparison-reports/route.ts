import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { supabaseServer } from "@/lib/supabaseServer";
import { consumeTokensForTool } from "@/lib/consumeTokens";
import { calculatePropertyScore, type PropertyInput } from "@/lib/propertyScoring";
import { generateComparisonReportAi } from "@/lib/comparisonReportAi";
import type { ComparisonReportResult } from "@/lib/comparisonReportTypes";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";

export const runtime = "nodejs";

function newId() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeProperty(raw: Record<string, unknown>, index: number): PropertyInput | null {
  const id = String(raw.id ?? newId());
  const address = String(raw.address ?? "").trim();
  const price = Number(raw.price);
  const beds = Number(raw.beds);
  const baths = Number(raw.baths);
  const sqft = Number(raw.sqft);
  const rentRaw = raw.rentMonthly ?? raw.rent_monthly;
  const rentMonthly =
    rentRaw == null || rentRaw === ""
      ? null
      : Number.isFinite(Number(rentRaw))
        ? Number(rentRaw)
        : null;

  if (!address || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(sqft) || sqft <= 0) return null;

  return {
    id,
    address,
    price,
    beds: Number.isFinite(beds) ? beds : 0,
    baths: Number.isFinite(baths) ? baths : 0,
    sqft,
    rentMonthly,
  };
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const { data: agent, error: agentErr } = await supabaseServer
      .from("agents")
      .select("id, plan_type")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (agentErr && (agentErr as any).code !== "PGRST116") {
      console.error("comparison-reports agents", agentErr);
    }

    const agentId = (agent as any)?.id as string | undefined;
    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: "Agent profile required. Complete agent onboarding first." },
        { status: 403 }
      );
    }

    const planType = String((agent as any)?.plan_type ?? "free").toLowerCase();
    if (planType === "free") {
      return NextResponse.json(
        { ok: false, error: "AI Property Comparison Reports require a Pro or Premium plan." },
        { status: 402 }
      );
    }

    const gate = await consumeTokensForTool({
      req,
      tool: "comparison_report",
      requireAuth: true,
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: (gate as any).error ?? "Access denied",
          plan: gate.plan,
          tokens_remaining: gate.tokensRemaining,
        },
        { status: (gate as any).status ?? 402 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      client_name?: string;
      properties?: unknown;
    };

    const client_name = String(body.client_name ?? "").trim() || "Client";
    const rawList = body.properties;
    if (!Array.isArray(rawList) || rawList.length < 2) {
      return NextResponse.json(
        { ok: false, error: "At least two properties are required." },
        { status: 400 }
      );
    }
    if (rawList.length > 12) {
      return NextResponse.json(
        { ok: false, error: "Maximum 12 properties per report." },
        { status: 400 }
      );
    }

    const properties: PropertyInput[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const row = rawList[i] as Record<string, unknown>;
      const p = normalizeProperty(row, i);
      if (!p) {
        return NextResponse.json(
          { ok: false, error: `Invalid property at index ${i} (address, price, sqft required).` },
          { status: 400 }
        );
      }
      properties.push(p);
    }

    const scored = properties.map((property) => ({
      property,
      score: calculatePropertyScore(property),
    }));

    const ai = await generateComparisonReportAi({
      client_name,
      scored,
    });

    // Full agent profile (name, brokerage, contact, license, headshot, logo)
    // — same source as the seller presentation / CMA report.
    const profile = await loadPresentationAgent(agentId);

    const result: ComparisonReportResult = {
      agent_snapshot: {
        display_name: profile.name,
        email: profile.email ?? user.email ?? null,
        phone: profile.phone,
        brokerage: profile.brokerage,
        license_number: profile.licenseNumber,
        photo_url: profile.photoUrl,
        logo_url: profile.logoUrl,
      },
      executive_summary: ai.executive_summary,
      best_property_id: ai.best_property_id,
      best_property_explanation: ai.best_property_explanation,
      pros: ai.pros,
      cons: ai.cons,
      scored,
    };

    const { data: inserted, error: insErr } = await supabaseServer
      .from("comparison_reports")
      .insert({
        // comparison_reports.agent_id is uuid → use the auth user id, not the
        // bigint agents.id (which 500'd with "invalid input syntax for uuid").
        agent_id: user.id,
        client_name,
        properties,
        result,
      } as any)
      .select("id, created_at")
      .maybeSingle();

    if (insErr || !inserted) {
      console.error("comparison_reports insert", insErr);
      return NextResponse.json(
        { ok: false, error: insErr?.message ?? "Failed to save report." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: inserted.id,
      created_at: inserted.created_at,
      share_url: `/report/${inserted.id}`,
      tokens_remaining: gate.tokensRemaining,
    });
  } catch (e: any) {
    console.error("POST /api/comparison-reports", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
