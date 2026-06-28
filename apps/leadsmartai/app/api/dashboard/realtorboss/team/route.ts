import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ensureAssistantsForAgent,
  updateAssistantForAgent,
} from "@/lib/realtorboss/assistants";
import { AI_TEAM, type AssistantType } from "@/lib/realtorboss/team";
import { SKILLS } from "@/lib/ai/prompts/realtorboss";
import { isValidAvatarId } from "@/lib/realtorboss/avatars";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/realtorboss/team
 * The agent's AI team config (rows lazily seeded from the roster) +
 * the skill catalog for the configuration UI.
 */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const assistants = await ensureAssistantsForAgent(agentId);

    // Catalog from DB; fall back to the in-code library if the seed
    // hasn't run (e.g. migration not applied in a preview env).
    const { data: skillRows } = await supabaseAdmin
      .from("ai_skills")
      .select("key,name,description,category")
      .order("category")
      .order("name");
    const skills =
      skillRows && skillRows.length > 0
        ? skillRows
        : SKILLS.map((s) => ({ key: s.key, name: s.name, description: s.description, category: s.category }));

    return NextResponse.json({ ok: true, assistants, skills });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/realtorboss/team:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/dashboard/realtorboss/team
 * Body: { type, status?, enabledSkills? }
 */
export async function PATCH(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      status?: string;
      enabledSkills?: unknown;
      name?: unknown;
      avatarId?: unknown;
    };

    const type = AI_TEAM.find((d) => d.type === body.type)?.type as AssistantType | undefined;
    if (!type) {
      return NextResponse.json({ ok: false, error: "Unknown assistant type." }, { status: 400 });
    }
    const status =
      body.status === "active" || body.status === "paused" ? body.status : undefined;
    const enabledSkills = Array.isArray(body.enabledSkills)
      ? body.enabledSkills.filter((s): s is string => typeof s === "string")
      : undefined;
    // Name: trim + bound to a sensible label length; reject empty.
    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : undefined;
    const avatarId = isValidAvatarId(body.avatarId) ? body.avatarId : undefined;
    if (!status && !enabledSkills && name === undefined && avatarId === undefined) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }

    await ensureAssistantsForAgent(agentId);
    const assistant = await updateAssistantForAgent(agentId, type, {
      status,
      enabledSkills,
      name,
      avatarId,
    });
    return NextResponse.json({ ok: true, assistant });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("PATCH /api/dashboard/realtorboss/team:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
