import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  upsertAgentAiSettings,
  getAgentAiSettings,
  type UpsertAgentAiSettingsInput,
} from "@/lib/agent-ai/settings";
import type { AgentAiDefaultLanguage, AiPersonality } from "@/lib/agent-ai/types";
import { agentHasSocialCustomization } from "@/lib/social/customization";

export const runtime = "nodejs";

const PERSONALITIES: readonly AiPersonality[] = ["friendly", "professional", "luxury"];
const LANGUAGES: readonly AgentAiDefaultLanguage[] = ["en", "zh", "auto"];

function parsePersonality(v: unknown): AiPersonality | undefined {
  if (typeof v !== "string") return undefined;
  return PERSONALITIES.includes(v as AiPersonality) ? (v as AiPersonality) : undefined;
}

function parseLanguage(v: unknown): AgentAiDefaultLanguage | undefined {
  if (typeof v !== "string") return undefined;
  return LANGUAGES.includes(v as AgentAiDefaultLanguage) ? (v as AgentAiDefaultLanguage) : undefined;
}

/** #RGB or #RRGGBB, normalized to lowercase 6-digit. Returns null for empty/invalid. */
function parseBrandColor(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const raw = v.trim();
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw);
  if (!m) return undefined;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const settings = await getAgentAiSettings(agentId);
    return NextResponse.json({ ok: true, settings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("agent-ai-settings GET", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json()) as Record<string, unknown>;

    const input: UpsertAgentAiSettingsInput = {};

    if ("personality" in body) {
      const p = parsePersonality(body.personality);
      if (p) input.personality = p;
    }
    if ("defaultLanguage" in body) {
      const l = parseLanguage(body.defaultLanguage);
      if (l) input.defaultLanguage = l;
    }
    if ("bilingualEnabled" in body && typeof body.bilingualEnabled === "boolean") {
      input.bilingualEnabled = body.bilingualEnabled;
    }
    if ("styleNotes" in body) {
      if (body.styleNotes === null || body.styleNotes === "") {
        input.styleNotes = null;
      } else if (typeof body.styleNotes === "string") {
        input.styleNotes = body.styleNotes.trim().slice(0, 500);
      }
    }
    // Brand color is Signature-gated (part of the brand kit). Accept it only
    // when the plan unlocks social_customization; otherwise silently ignore so
    // the rest of this shared settings save still succeeds.
    if ("brandColor" in body) {
      const parsed = parseBrandColor(body.brandColor);
      if (parsed === undefined) {
        return NextResponse.json(
          { ok: false, error: "Enter a valid hex color like #0072ce." },
          { status: 400 },
        );
      }
      if (await agentHasSocialCustomization(agentId)) {
        input.brandColor = parsed;
      }
    }

    const settings = await upsertAgentAiSettings(agentId, input);
    return NextResponse.json({ ok: true, settings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("agent-ai-settings PATCH", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
