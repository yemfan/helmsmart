import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { normalizePhoneE164 } from "@repo/voice";
import {
  getReceptionistConfig,
  upsertReceptionistConfig,
  getBookingSettings,
  setBusinessHours,
  type UpsertReceptionistConfigInput,
} from "@/lib/voice-receptionist/settings";
import type { BusinessHours } from "@repo/voice";

export const runtime = "nodejs";

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const settings = await getReceptionistConfig(agentId);
    const { hours } = await getBookingSettings(agentId);
    return NextResponse.json({ ok: true, settings, businessHours: hours });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("voice-receptionist-settings GET", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json()) as Record<string, unknown>;

    const input: UpsertReceptionistConfigInput = {};
    if (typeof body.enabled === "boolean") input.enabled = body.enabled;

    if (typeof body.phoneNumber === "string") {
      const raw = body.phoneNumber.trim();
      if (raw === "") {
        input.phoneNumber = ""; // explicit clear
      } else {
        const r = normalizePhoneE164(raw);
        if (!r.ok) {
          return NextResponse.json(
            { ok: false, error: "Enter a valid phone number (e.g. +1 626 555 1234)." },
            { status: 400 },
          );
        }
        input.phoneNumber = r.value;
      }
    }

    const businessName = str(body.businessName, 200);
    if (businessName !== undefined) input.businessName = businessName;

    const businessNameZh = str(body.businessNameZh, 200);
    if (businessNameZh !== undefined) input.businessNameZh = businessNameZh;

    const agentName = str(body.agentName, 100);
    if (agentName !== undefined) input.agentName = agentName;

    const greeting = str(body.greeting, 1000);
    if (greeting !== undefined) input.greeting = greeting;

    // Timezone is deliberately NOT accepted here. One timezone per account,
    // set in one place — see lib/agent/accountTimezone.ts. Silently ignoring a
    // posted value is right: an old client sending one should not be able to
    // reintroduce the split that had the receptionist booking 3 hours out.

    const extraNotes = str(body.extraNotes, 4000);
    if (extraNotes !== undefined) input.extraNotes = extraNotes;

    if (body.voiceLimitBehavior === "text_back" || body.voiceLimitBehavior === "overage") {
      input.voiceLimitBehavior = body.voiceLimitBehavior;
    }

    const settings = await upsertReceptionistConfig(agentId, input);

    // Office hours live in their own jsonb column; save best-effort so the rest
    // of the config still saves even before the business_hours migration (a
    // missing column just means hours don't persist yet — never a failed save).
    if ("businessHours" in body) {
      const r = await setBusinessHours(agentId, body.businessHours as BusinessHours | null);
      if (!r.ok) console.warn("voice-receptionist-settings: office hours not saved:", r.error);
    }

    const { hours } = await getBookingSettings(agentId);
    return NextResponse.json({ ok: true, settings, businessHours: hours });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("voice-receptionist-settings PATCH", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
