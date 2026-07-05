import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProgramViews } from "@/lib/coaching-programs/service";
import { COACHING_PROGRAMS } from "@/lib/coaching-programs/programs";
import type { AgentPlan } from "@/lib/entitlements/types";

export const runtime = "nodejs";

/**
 * GET /api/mobile/coaching/me
 *
 * Mobile mirror of /api/coaching/me. Bearer-auth'd; fetches plan_type
 * server-side because requireMobileAgent doesn't carry it. Returns
 * the same `{ ok, plan, programs }` envelope the web widget uses.
 */
export async function GET(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    const { data: agentRow, error } = await supabaseAdmin
      .from("agents")
      .select("plan_type")
      .eq("id", auth.ctx.agentId)
      .maybeSingle();
    if (error) throw error;

    const plan = normalizeAgentPlan(
      (agentRow as { plan_type?: string | null } | null)?.plan_type ?? null,
    );

    const views = await getProgramViews({
      agentId: auth.ctx.agentId,
      plan,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      plan,
      programs: views.map((v) => ({
        slug: v.programSlug,
        status: v.status,
        enrolledAt: v.enrolledAt,
        meta: {
          name: COACHING_PROGRAMS[v.programSlug].name,
          tagline: COACHING_PROGRAMS[v.programSlug].tagline,
          annualTransactionTarget:
            COACHING_PROGRAMS[v.programSlug].annualTransactionTarget,
          conversionRateTargetPct:
            COACHING_PROGRAMS[v.programSlug].conversionRateTargetPct,
        },
      })),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        plan: null,
        programs: [],
        error: (e as Error).message,
      },
      { status: 200 },
    );
  }
}

/**
 * Same plan-type normalization as /api/coaching/me. Plan_type uses
 * legacy values ('free' | 'pro' | 'elite') which we map to the
 * canonical AgentPlan union the coaching registry reads.
 */
function normalizeAgentPlan(raw: string | null | undefined): AgentPlan | null {
  switch (raw) {
    case "starter":
    case "free":
      return "starter";
    case "pro":
    case "pro":
      return "pro";
    case "premium":
    case "premium":
      return "premium";
    case "team":
      return "team";
    default:
      return null;
  }
}
