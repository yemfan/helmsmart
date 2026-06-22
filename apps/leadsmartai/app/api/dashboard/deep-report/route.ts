import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { generateDeepReport } from "@/lib/deep-report/service";
import type { LoanAssumptions } from "@/lib/deep-report/finance";
import type { PropertyUse } from "@/lib/deep-report/types";

export const runtime = "nodejs";
// AI CMA + a web-search pass for rating/rent/schools can run long.
export const maxDuration = 300;

const USES: PropertyUse[] = ["primary", "second_home", "investment"];

/**
 * POST /api/dashboard/deep-report
 * Body: { address, propertyUse, loanOverrides? }
 */
export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();

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

    // Only accept the known numeric loan fields; ignore anything else.
    let loanOverrides: Partial<LoanAssumptions> | undefined;
    if (body.loanOverrides && typeof body.loanOverrides === "object") {
      const o = body.loanOverrides as Record<string, unknown>;
      const pick = (k: keyof LoanAssumptions) => {
        const n = Number(o[k]);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };
      loanOverrides = {};
      for (const k of ["downPct", "ratePct", "termYears", "taxRatePct", "insuranceRatePct", "hoaMonthly"] as const) {
        const v = pick(k);
        if (v !== undefined) loanOverrides[k] = v;
      }
    }

    const res = await generateDeepReport({ agentId: String(agentId), address, propertyUse, loanOverrides });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    }
    return NextResponse.json({ ok: true, report: res.report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("deep-report:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
