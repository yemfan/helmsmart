import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { generateDeepReport } from "@/lib/deep-report/service";
import type { LoanAssumptions } from "@/lib/deep-report/finance";
import type { PropertyUse } from "@/lib/deep-report/types";
import { getFeatureQuota, incrementFeatureUsage } from "@/lib/quota/featureQuota";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// AI CMA + a web-search pass for rating/rent/schools can run long.
export const maxDuration = 300;

const FEATURE = "deep_report";
const USES: PropertyUse[] = ["primary", "second_home", "investment"];

/**
 * POST /api/dashboard/deep-report
 * Body: { address, propertyUse, loanOverrides? }
 * Returns the report + a saved id + the updated daily quota.
 */
export async function POST(req: Request) {
  try {
    const { userId, agentId } = await getCurrentAgentContext();

    const body = (await req.json().catch(() => ({}))) as {
      address?: unknown;
      propertyUse?: unknown;
      loanOverrides?: unknown;
    };
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) {
      return NextResponse.json({ ok: false, error: "Enter a property address." }, { status: 400 });
    }
    const propertyUse = USES.includes(body.propertyUse as PropertyUse)
      ? (body.propertyUse as PropertyUse)
      : "primary";

    // Tiered daily quota — same policy as CMA / House Search.
    const quota = await getFeatureQuota(userId, FEATURE);
    if (quota.reached) {
      return NextResponse.json(
        { ok: false, error: `Daily Deep Report limit reached (${quota.limit}/day). Resets tomorrow — upgrade for more.`, quota },
        { status: 429 },
      );
    }

    let loanOverrides: Partial<LoanAssumptions> | undefined;
    if (body.loanOverrides && typeof body.loanOverrides === "object") {
      const o = body.loanOverrides as Record<string, unknown>;
      loanOverrides = {};
      for (const k of ["downPct", "ratePct", "termYears", "taxRatePct", "insuranceRatePct", "hoaMonthly"] as const) {
        const n = Number(o[k]);
        if (Number.isFinite(n) && n >= 0) loanOverrides[k] = n;
      }
    }

    const res = await generateDeepReport({ agentId: String(agentId), address, propertyUse, loanOverrides });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    }

    // Count only successful runs, then persist for a shareable link.
    await incrementFeatureUsage(userId, FEATURE);
    const after = await getFeatureQuota(userId, FEATURE);

    let id: string | null = null;
    try {
      const { data } = await supabaseAdmin
        .from("deep_reports")
        .insert({ agent_id: userId, address: res.report.property.address, property_use: propertyUse, report: res.report } as never)
        .select("id")
        .single();
      id = (data as { id: string } | null)?.id ?? null;
    } catch (e) {
      // Non-fatal — still return the report; the share link just won't exist.
      console.warn("[deep-report] save failed:", e);
    }

    return NextResponse.json({
      ok: true,
      report: res.report,
      id,

      quota: after,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("deep-report:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
