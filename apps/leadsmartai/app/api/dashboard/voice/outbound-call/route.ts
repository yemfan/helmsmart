import { NextResponse } from "next/server";
import { loadReceptionistContext, loadSalesCallContext } from "@/lib/voice-agent/context";
import { placeOutboundCall } from "@/lib/voice-agent/outbound";
import { normalizePhoneE164, type OutboundPurpose } from "@repo/voice";
import { requireCrmFeature } from "@/lib/billing/guard";
import { VoiceMinutesExceededError } from "@/lib/entitlements/voiceMinuteGate";

export const runtime = "nodejs";

const VALID_PURPOSES: OutboundPurpose[] = ["follow_up", "appointment_reminder", "survey", "promo"];

/**
 * Place an outbound AI call. The agent (Lucy) dials the lead from the
 * receptionist number, discloses it's an AI, and follows up per the account's
 * receptionist context. Needs RETELL_API_KEY in the environment.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireCrmFeature("ai_calling");
    if (!gate.ok) return gate.response;
    const { agentId } = gate.ctx;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      phone?: string;
      purpose?: OutboundPurpose;
      detail?: string;
    };
    const name = String(body.name ?? "").trim();
    const purpose: OutboundPurpose = VALID_PURPOSES.includes(body.purpose as OutboundPurpose)
      ? (body.purpose as OutboundPurpose)
      : "follow_up";
    const detail = body.detail ? String(body.detail).trim() : undefined;

    const r = normalizePhoneE164(String(body.phone ?? "").trim());
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid phone number (e.g. +1 626 555 1234)." },
        { status: 400 },
      );
    }

    // Lead-facing purposes (follow-up, reactivation, survey, promo) are
    // the Sales Assistant's work — its own voice name, knowledge base,
    // and playbook. Appointment reminders stay with the Receptionist.
    const ctx =
      purpose === "appointment_reminder"
        ? await loadReceptionistContext(agentId)
        : await loadSalesCallContext(agentId);
    if (!ctx) {
      return NextResponse.json(
        { ok: false, error: "Your AI receptionist is turned off — enable it in Settings → Voice." },
        { status: 400 },
      );
    }

    const { callId } = await placeOutboundCall({
      ctx,
      agentId,
      leadName: name,
      toNumberE164: r.value,
      purpose,
      detail,
    });

    return NextResponse.json({ ok: true, callId, to: r.value });
  } catch (e: unknown) {
    if (e instanceof VoiceMinutesExceededError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: e.code, used: e.used, limit: e.limit },
        { status: 402 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to place the call.";
    console.error("voice/outbound-call", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
