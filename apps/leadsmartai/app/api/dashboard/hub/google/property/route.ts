import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { gaPropertyId, type GaProperty } from "@/lib/marketing-hub/gaReport";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({ propertyId: z.string().min(1).max(40) });

/**
 * POST /api/dashboard/hub/google/property  { propertyId }
 *
 * The agent chooses which GA4 property is the hub's, when the connect step
 * could not tell. Only a property the authorising account was seen to own
 * (stored on the row at connect time) is accepted: the id is never trusted
 * from the client on its own. Choosing drops the cached report, which
 * belonged to whatever was chosen before.
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    const wanted = parsed.success ? gaPropertyId(parsed.data.propertyId) : null;
    if (!wanted) return NextResponse.json({ ok: false, error: "invalid_property" }, { status: 400 });

    const { data } = await supabaseAdmin
      .from("social_accounts")
      .select("id, ga_properties")
      .eq("agent_id", auth.agentId)
      .eq("platform", "google")
      .maybeSingle();
    const row = data as { id: string; ga_properties: unknown } | null;
    if (!row) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 404 });

    const known = (Array.isArray(row.ga_properties) ? (row.ga_properties as GaProperty[]) : []).find((p) => p.id === wanted);
    if (!known) return NextResponse.json({ ok: false, error: "unknown_property" }, { status: 400 });

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({ ga_property_id: known.id, ga_property_name: known.name, account_display_name: known.name, ga_metrics: null, ga_metrics_refreshed_at: null, updated_at: now } as never)
      .eq("id", row.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, property: { id: known.id, name: known.name } });
  } catch (e) {
    console.error("[hub/google/property]", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
