import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { resolveAgentPlan } from "@/lib/billing/resolveAgentPlan";
import { meetsPlan } from "@/lib/billing/planRank";
import {
  PIXEL_MIN_PLAN,
  isValidGaMeasurementId,
  isValidMetaPixelId,
  normalizeGaMeasurementId,
  normalizeMetaPixelId,
} from "@/lib/marketing-hub/tracking";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET / PUT /api/dashboard/hub/tracking
 *
 * The agent's own Meta Pixel and GA4 ids for their marketing hub.
 *
 * SAVING IS NOT GATED; RENDERING IS. An agent may enter a Pixel id on any
 * plan, be told plainly that it will not run until Premium, and have it work
 * the moment they upgrade. The alternative — refusing the save — means they
 * upgrade and then have to go and find the id again, which is a worse moment
 * to introduce friction than the one before the sale.
 *
 * GET therefore returns `pixelActive` alongside the value, so the settings
 * screen can say "saved, runs on Premium" rather than pretending it is live.
 */

export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const [plan, row] = await Promise.all([
      resolveAgentPlan(auth.agentId),
      supabaseAdmin
        .from("agent_tracking_config")
        .select("meta_pixel_id, ga_measurement_id")
        .eq("agent_id", auth.agentId as never)
        .maybeSingle(),
    ]);

    const cfg = (row.data ?? {}) as {
      meta_pixel_id?: string | null;
      ga_measurement_id?: string | null;
    };

    return NextResponse.json({
      ok: true,
      metaPixelId: cfg.meta_pixel_id ?? null,
      gaMeasurementId: cfg.ga_measurement_id ?? null,
      // What the agent needs to understand the state of the thing.
      plan: plan.tier,
      pixelMinPlan: PIXEL_MIN_PLAN,
      pixelActive: meetsPlan(plan.tier, PIXEL_MIN_PLAN),
    });
  } catch (e) {
    console.error("[hub.tracking] GET threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // An empty string means "remove this", which is different from omitting
    // the field. Both are supported; only the former clears.
    const rawPixel = body.metaPixelId;
    const rawGa = body.gaMeasurementId;

    const metaPixelId =
      rawPixel === undefined ? undefined : normalizeMetaPixelId(rawPixel as string);
    const gaMeasurementId =
      rawGa === undefined ? undefined : normalizeGaMeasurementId(rawGa as string);

    if (metaPixelId && !isValidMetaPixelId(metaPixelId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_pixel", field: "metaPixelId" },
        { status: 400 },
      );
    }
    if (gaMeasurementId && !isValidGaMeasurementId(gaMeasurementId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_ga", field: "gaMeasurementId" },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {
      agent_id: auth.agentId,
      updated_at: new Date().toISOString(),
    };
    if (metaPixelId !== undefined) patch.meta_pixel_id = metaPixelId;
    if (gaMeasurementId !== undefined) patch.ga_measurement_id = gaMeasurementId;

    const { error } = await supabaseAdmin
      .from("agent_tracking_config")
      .upsert(patch as never, { onConflict: "agent_id" });

    if (error) {
      console.error("[hub.tracking] save failed:", error.message);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    const plan = await resolveAgentPlan(auth.agentId);
    return NextResponse.json({
      ok: true,
      pixelActive: meetsPlan(plan.tier, PIXEL_MIN_PLAN),
      plan: plan.tier,
    });
  } catch (e) {
    console.error("[hub.tracking] PUT threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
