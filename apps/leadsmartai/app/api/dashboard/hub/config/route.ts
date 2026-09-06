import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { ensureAssistantsForAgent } from "@/lib/closeboss/assistants";
import { mergeHubConfig, validateHubConfig, type HubConfig } from "@/lib/marketing-hub/config";
import { slugFor, titleOf } from "@/lib/marketing-hub/contentPages";
import {
  loadHubFeed,
  loadHubSettings,
  loadWorkforceAvailability,
  resolveBooking,
  serviceAreasOf,
} from "@/lib/marketing-hub/loadHub";
import { workforceEditorRows } from "@/lib/marketing-hub/workforce";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET / PUT /api/dashboard/hub/config
 *
 * The hub's configuration document, plus everything the editor needs to
 * render it sensibly: the agent's profile as the page will show it, which AI
 * team members can be shown (and why not), the published posts a featured
 * slot can point at, and what the booking CTA will actually do.
 *
 * PUT accepts a PARTIAL document — one section at a time — and merges it
 * into the stored one. Validation reports the field, not a 500, because the
 * person on the other end can fix "hero.headline: too long".
 */

async function editorPayload(agentId: string) {
  const id = Number(agentId);
  // ensureAssistantsForAgent seeds the roster rows the first time an agent
  // opens anything that needs them — the editor is such a place.
  const [settings, agent, agentRow, feed, availability] = await Promise.all([
    loadHubSettings(id),
    loadPresentationAgent(id),
    supabaseAdmin
      .from("agents")
      .select("username, hub_published, bio, specialties, brand_name, service_areas, service_areas_v2")
      .eq("id", id as never)
      .maybeSingle(),
    loadHubFeed(id),
    ensureAssistantsForAgent(agentId)
      .catch((e) => console.warn("[hub.config] ensureAssistants:", e instanceof Error ? e.message : e))
      .then(() => loadWorkforceAvailability(id)),
  ]);
  const row = (agentRow.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    config: settings.config,
    hasSavedConfig: settings.hasSavedConfig,
    identity: {
      username: (row.username as string | null) ?? null,
      published: row.hub_published === true,
      bio: (row.bio as string | null) ?? null,
      specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
      brandName: (row.brand_name as string | null) ?? null,
      /** Areas from the agent's profile, offered as a starting point. */
      profileAreas: serviceAreasOf(row),
    },
    agent,
    workforce: workforceEditorRows(settings.config, availability),
    bookingEnabled: availability.bookingEnabled,
    receptionistEnabled: availability.receptionistEnabled,
    booking: resolveBooking(settings.config.leadCapture, availability.bookingEnabled),
    posts: feed.slice(0, 40).map((item) => ({ slug: slugFor(item), title: titleOf(item), postedAt: item.postedAt })),
  };
}

export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    return NextResponse.json(await editorPayload(auth.agentId));
  } catch (e) {
    console.error("[hub.config] GET threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const id = Number(auth.agentId);

    const body = (await req.json().catch(() => null)) as Partial<HubConfig> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const { config: current } = await loadHubSettings(id);
    const merged = mergeHubConfig(current, body);
    // mergeHubConfig already coerces; validate the raw patch so a real
    // mistake is reported rather than silently reset to a default.
    const check = validateHubConfig({ ...current, ...body });
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: "invalid", problems: check.problems }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("agent_hub_settings")
      .upsert(
        { agent_id: id, config: merged, updated_at: new Date().toISOString() } as never,
        { onConflict: "agent_id" },
      );
    if (error) {
      console.error("[hub.config] save failed:", error.message);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json(await editorPayload(auth.agentId));
  } catch (e) {
    console.error("[hub.config] PUT threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
