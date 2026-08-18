import { NextRequest, NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureAssistantsForAgent } from "@/lib/closeboss/assistants";
import { getAssistantVoiceSettings } from "@/lib/closeboss/voicePersona";
import type { AssistantType } from "@/lib/closeboss/team";

export const runtime = "nodejs";

/**
 * Per-assistant call settings + knowledge base, stored on the
 * assistant's ai_assistants row.
 *
 *   GET  ?type=sales_assistant            → { voiceName, voiceKnowledge }
 *   PATCH { type, voiceName?, voiceKnowledge? }
 *
 * The Receptionist's inbound config (number, greeting, hours,
 * knowledge) stays on /api/dashboard/voice-receptionist-settings;
 * this route covers the assistant-level overlay used by outbound
 * callers (Sales Assistant today).
 */

const EDITABLE_TYPES: AssistantType[] = [
  "sales_assistant",
  "receptionist",
  // Marketing reuses the same per-assistant fields: voice_knowledge is
  // its brand/business knowledge base (grounds post + nurture copy).
  "marketing_assistant",
];

function parseType(v: unknown): AssistantType | null {
  return EDITABLE_TYPES.includes(v as AssistantType) ? (v as AssistantType) : null;
}

export async function GET(req: NextRequest) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const type = parseType(req.nextUrl.searchParams.get("type"));
    if (!type) {
      return NextResponse.json({ ok: false, error: "Unknown assistant type." }, { status: 400 });
    }
    const settings = await getAssistantVoiceSettings(agentId, type);
    return NextResponse.json({
      ok: true,
      voiceName: settings.voiceName,
      voiceKnowledge: settings.voiceKnowledge,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as {
      type?: unknown;
      voiceName?: unknown;
      voiceKnowledge?: unknown;
    };
    const type = parseType(body.type);
    if (!type) {
      return NextResponse.json({ ok: false, error: "Unknown assistant type." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.voiceName === "string") {
      patch.voice_name = body.voiceName.trim().slice(0, 100) || null;
    }
    if (typeof body.voiceKnowledge === "string") {
      patch.voice_knowledge = body.voiceKnowledge.trim().slice(0, 4000) || null;
    }

    // The row may not exist yet for a brand-new account.
    await ensureAssistantsForAgent(agentId);

    const { error } = await supabaseAdmin
      .from("ai_assistants")
      .update(patch)
      .eq("agent_id", agentId)
      .eq("type", type);
    if (error) throw new Error(error.message);

    const settings = await getAssistantVoiceSettings(agentId, type);
    return NextResponse.json({
      ok: true,
      voiceName: settings.voiceName,
      voiceKnowledge: settings.voiceKnowledge,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
