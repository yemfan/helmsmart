import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendAgentWelcomeEmail } from "@/lib/email/welcomeAgent";
import {
  parseServiceAreas,
  serviceAreasToLegacyStrings,
} from "@/lib/geo/serviceArea";
import {
  detectServiceAreaFromGeo,
  ensureAgentDefaultMarket,
  readGeoFromHeaders,
} from "@/lib/closeboss/market/autodetect";

export async function GET(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { data, error } = await supabaseServer
      .from("agents")
      .select(
        "onboarding_completed, service_areas, service_areas_v2, brand_name, logo_url, onboarding",
      )
      .eq("id", agentId as any)
      .single();

    if (error) throw error;

    const row = data as {
      onboarding_completed?: boolean;
      service_areas?: string[] | null;
      service_areas_v2?: unknown;
      brand_name?: string | null;
      logo_url?: string | null;
    } | null;

    const serviceAreasV2 = parseServiceAreas(row?.service_areas_v2);
    // Reduce onboarding friction: when the agent has no market yet, suggest one
    // auto-detected from their IP (AI maps the city+state to a county). The
    // wizard pre-fills the picker with this; nothing is saved until they confirm.
    const suggestedServiceAreas =
      serviceAreasV2.length === 0
        ? [await detectServiceAreaFromGeo(readGeoFromHeaders(req.headers))].filter(
            (a): a is NonNullable<typeof a> => a !== null,
          )
        : [];

    return NextResponse.json({
      ok: true,
      onboardingCompleted: Boolean(row?.onboarding_completed),
      serviceAreas: row?.service_areas ?? [],
      serviceAreasV2,
      suggestedServiceAreas,
      brandName: row?.brand_name ?? null,
      logoUrl: row?.logo_url ?? null,
      onboarding: (row as { onboarding?: Record<string, unknown> | null } | null)?.onboarding ?? {},
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, unknown> = {};

    if (body.onboarding_completed === true) {
      patch.onboarding_completed = true;
    }
    // Dual-write: accept either/both. If v2 is provided, we also derive
    // the legacy flattened strings so any call site still on the old
    // column keeps receiving values. A client that posts only v1 (e.g.
    // a pre-migration mobile build) still writes through unchanged.
    if (Array.isArray(body.service_areas_v2)) {
      const parsed = parseServiceAreas(body.service_areas_v2);
      patch.service_areas_v2 = parsed;
      if (!Array.isArray(body.service_areas)) {
        patch.service_areas = serviceAreasToLegacyStrings(parsed);
      }
    }
    if (Array.isArray(body.service_areas)) {
      patch.service_areas = body.service_areas;
    }
    if (typeof body.brand_name === "string") {
      patch.brand_name = body.brand_name;
    }
    // Max's welcome interview (name · market · focus · goal · brokerage).
    // Merged into agents.onboarding so a partial re-interview never wipes an
    // earlier answer. This used to be a browser-side update to `agents`; in
    // production every agent ended up with `onboarding = {}` — the goal Max
    // personalises around was never on file.
    if (body.onboarding && typeof body.onboarding === "object" && !Array.isArray(body.onboarding)) {
      const allowed = ["name", "market", "focus", "goal", "brokerage"] as const;
      const incoming: Record<string, string> = {};
      for (const k of allowed) {
        const v = (body.onboarding as Record<string, unknown>)[k];
        if (typeof v === "string" && v.trim()) incoming[k] = v.trim().slice(0, 160);
      }
      if (Object.keys(incoming).length > 0) {
        const { data: cur } = await supabaseServer
          .from("agents")
          .select("onboarding")
          .eq("id", agentId as any)
          .maybeSingle();
        const existing = ((cur as { onboarding?: Record<string, unknown> | null } | null)?.onboarding ?? {}) as Record<string, unknown>;
        patch.onboarding = { ...existing, ...incoming, completed_at: new Date().toISOString() };
        if (incoming.brokerage) patch.brokerage = incoming.brokerage;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseServer
        .from("agents")
        .update(patch)
        .eq("id", agentId as any);
      if (error) throw error;
    }

    // AI settings
    if (body.ai_personality || body.ai_language) {
      const aiPatch: Record<string, unknown> = {};
      if (body.ai_personality) aiPatch.personality = body.ai_personality;
      if (body.ai_language) aiPatch.default_language = body.ai_language;

      const { data: existing } = await supabaseServer
        .from("agent_ai_settings")
        .select("id")
        .eq("agent_id", agentId as any)
        .maybeSingle();

      if (existing) {
        await supabaseServer
          .from("agent_ai_settings")
          .update(aiPatch)
          .eq("agent_id", agentId as any);
      } else {
        await supabaseServer
          .from("agent_ai_settings")
          .insert({ agent_id: agentId as any, ...aiPatch });
      }
    }

    // Notification preferences
    if (body.push_hot_lead !== undefined || body.push_reminder !== undefined) {
      const notifPatch: Record<string, unknown> = {};
      if (body.push_hot_lead !== undefined) notifPatch.push_hot_lead = Boolean(body.push_hot_lead);
      if (body.push_reminder !== undefined) notifPatch.push_reminder = Boolean(body.push_reminder);
      if (body.push_missed_call !== undefined) notifPatch.push_missed_call = Boolean(body.push_missed_call);

      const { data: existing } = await supabaseServer
        .from("agent_notification_preferences")
        .select("agent_id")
        .eq("agent_id", agentId as any)
        .maybeSingle();

      if (existing) {
        await supabaseServer
          .from("agent_notification_preferences")
          .update(notifPatch)
          .eq("agent_id", agentId as any);
      } else {
        await supabaseServer
          .from("agent_notification_preferences")
          .insert({ agent_id: agentId as any, ...notifPatch });
      }
    }

    // Guarantee a default market: if the agent completed onboarding without
    // picking any service area, auto-detect + assign one from their IP (AI maps
    // city+state to county). Idempotent — no-op when they already have one.
    if (body.onboarding_completed === true) {
      await ensureAgentDefaultMarket(agentId as unknown as string, readGeoFromHeaders(req.headers)).catch(() => {});
    }

    // Send welcome email with app install link when onboarding completes
    if (body.onboarding_completed === true) {
      try {
        const { data: profile } = await supabaseServer
          .from("user_profiles")
          .select("full_name, email")
          .eq("user_id", (await getCurrentAgentContext()).userId)
          .maybeSingle();

        const email = (profile as any)?.email;
        const name = (profile as any)?.full_name || "Agent";
        if (email) {
          sendAgentWelcomeEmail({ to: email, name }).catch((e) =>
            console.error("Welcome email failed:", e)
          );
        }
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
