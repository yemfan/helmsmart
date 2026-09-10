import { NextResponse } from "next/server";

import { loadAgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";

import { subscriptionRequiredResponse, userHasCrmFeature } from "@/lib/billing/subscriptionAccess";
import type {
  ContactSignalType,
  LifecycleStage,
  SignalConfidence,
} from "@/lib/contacts/types";
import { computeSphereSellerPrediction } from "@/lib/spherePrediction/computeScore";
import { generateEquityMessage } from "@/lib/spherePrediction/equityMessageAi";
import { supabaseServerClient } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";

/**
 * POST — draft an AI equity-update message for a specific past_client / sphere
 * contact. Pure read-then-generate; does NOT send.
 *
 * The agent reviews the draft in the UI (EquityMessageDraftModal) and decides
 * whether to copy/paste or wire send in a follow-up PR. This separation keeps
 * the AI surface auditable — every send action will be a separate explicit
 * click that creates a `lead_events` row, etc.
 *
 * Auth + entitlement gating mirrors the list route. Contact ownership is
 * verified by the agent_id filter on the SELECT — a contact id from another
 * agent silently 404s instead of leaking existence (preferred over a 403
 * which confirms the row exists for someone else).
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ contactId: string }> },
) {
  try {
    const { contactId } = await ctx.params;
    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json({ ok: false, error: "missing_contact_id" }, { status: 400 });
    }

    const supabase = supabaseServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!userData.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    if (!(await userHasCrmFeature(userData.user.id, "prediction"))) {
      return subscriptionRequiredResponse("prediction", "crm_prediction_locked");
    }

    const { data: agentRow } = await supabase
      .from("agents")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    const agentId = agentRow?.id != null ? String(agentRow.id) : null;
    if (agentId == null) {
      return NextResponse.json(
        { ok: false, error: "Complete agent signup before using LeadSmart AI.", code: "NO_AGENT_ROW" },
        { status: 403 },
      );
    }

    // The agent's name lives on user_profiles, not agents.
    const agentFirstName = (await loadAgentDisplayIdentity(agentId).catch(() => null))?.firstName ?? null;

    // Ownership-scoped contact fetch. Returns null for contacts owned by
    // other agents — we 404 rather than 403 so existence is not leaked.
    const { data: contactRow } = await supabase
      .from("contacts")
      .select(
        "id,first_name,last_name,email,phone,lifecycle_stage,closing_address,closing_date,closing_price,avm_current,avm_updated_at,engagement_score,last_activity_at,last_contacted_at,relationship_type,automation_disabled",
      )
      .eq("agent_id", agentId)
      .eq("id", contactId)
      .maybeSingle();

    if (!contactRow) {
      return NextResponse.json({ ok: false, error: "contact_not_found" }, { status: 404 });
    }

    type ContactRow = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      lifecycle_stage: LifecycleStage;
      closing_address: string | null;
      closing_date: string | null;
      closing_price: number | null;
      avm_current: number | null;
      avm_updated_at: string | null;
      engagement_score: number | null;
      last_activity_at: string | null;
      last_contacted_at: string | null;
      relationship_type: string | null;
      automation_disabled: boolean | null;
    };
    const c = contactRow as unknown as ContactRow;

    if (c.lifecycle_stage !== "past_client" && c.lifecycle_stage !== "sphere") {
      return NextResponse.json(
        { ok: false, error: "contact_not_in_sphere_or_past_client" },
        { status: 400 },
      );
    }

    // Pull open signals so the score (and prompt) match what the panel showed.
    const { data: signalRows } = await supabase
      .from("contact_signals")
      .select("type,confidence,detected_at")
      .eq("contact_id", contactId)
      .is("dismissed_at", null);

    type SignalRow = { type: ContactSignalType; confidence: SignalConfidence; detected_at: string };
    const signals = ((signalRows ?? []) as unknown as SignalRow[]).map((s) => ({
      type: s.type,
      confidence: s.confidence,
      detectedAt: s.detected_at,
    }));

    const result = computeSphereSellerPrediction({
      homePurchaseDate: c.closing_date,
      closingPrice: c.closing_price,
      avmCurrent: c.avm_current,
      avmUpdatedAt: c.avm_updated_at,
      engagementScore: c.engagement_score ?? 0,
      lastActivityAt: c.last_activity_at,
      lastContactedAt: c.last_contacted_at,
      openSignals: signals,
      relationshipType: c.relationship_type,
    });

    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "there";

    const draft = await generateEquityMessage({
      contactFirstName: c.first_name,
      contactFullName: fullName,
      closingAddress: c.closing_address,
      closingPrice: c.closing_price,
      avmCurrent: c.avm_current,
      closingDate: c.closing_date,
      lifecycleStage: c.lifecycle_stage,
      factors: result.factors,
      agentDisplayName: agentFirstName,
    });

    return NextResponse.json({
      ok: true,
      contactId,
      score: result.score,
      label: result.label,
      draft,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
