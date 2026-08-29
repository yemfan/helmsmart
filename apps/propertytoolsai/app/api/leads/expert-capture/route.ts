import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import { scheduleEmailSequenceForLead } from "@/lib/emailSequences";
import { recordLeadEvent, scoreLead } from "@/lib/leadScoring";
import { runLeadMarketplacePipeline } from "@/lib/leadScorePipeline";
import {
  matchAgents,
  parseLeadAddress,
  type LeadLocationSignals,
  type MatchableAgent,
} from "@/lib/matching";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type SubjectProperty = {
  address?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  rentMonthly?: number | null;
};

type AiRecommendation = {
  bestPropertyId?: string;
  explanation?: string;
  pros?: string[];
  cons?: string[];
} | null;

type Body = {
  name?: string;
  email?: string;
  phone?: string;
  subject_property?: SubjectProperty;
  comparison_properties?: SubjectProperty[];
  ai_recommendation?: AiRecommendation;
  source?: string;
};

function summarizeNotes(
  subject: SubjectProperty,
  ai: AiRecommendation,
  matchedIds: string[]
): string {
  const addr = String(subject.address ?? "").trim() || "(address)";
  const aiLine = ai?.explanation
    ? `\nAI summary: ${String(ai.explanation).slice(0, 400)}`
    : "";
  return `Expert request from AI Property Comparison.\nSubject: ${addr}${aiLine}\nMatched agents: ${matchedIds.length ? matchedIds.join(", ") : "(none — unassigned)"}`;
}

async function loadMatchableAgents(): Promise<MatchableAgent[]> {
  let data: any[] | null = null;
  const full = await supabaseServer.from("agents").select("id, service_areas, accepts_new_leads");
  if (full.error) {
    console.warn("expert-capture: agents select (full), falling back", full.error);
    const minimal = await supabaseServer.from("agents").select("id");
    if (minimal.error) {
      console.warn("expert-capture: agents select (minimal)", minimal.error);
      return [];
    }
    data = (minimal.data as any[]) ?? [];
    return data.map((row) => ({
      id: String(row.id),
      serviceAreas: [] as string[],
      acceptsNewLeads: true,
    }));
  }
  data = (full.data as any[]) ?? [];
  return data.map((row) => ({
    id: String(row.id),
    serviceAreas: Array.isArray(row.service_areas)
      ? row.service_areas.map((x: string) => String(x).toLowerCase().trim())
      : [],
    acceptsNewLeads: row.accepts_new_leads !== false,
  }));
}

/**
 * POST /api/leads/expert-capture — AI comparison “Talk to an Expert” funnel.
 * Stores structured context on `leads.capture_context`, assigns best-match `agent_id`.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phoneRaw = String(body.phone ?? "").trim();
    const source = String(body.source ?? "ai_comparison").trim() || "ai_comparison";
    const subject = body.subject_property ?? {};
    const comparison = Array.isArray(body.comparison_properties) ? body.comparison_properties : [];
    const ai = body.ai_recommendation ?? null;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
    }

    const formattedPhone = phoneRaw ? formatUsPhone(phoneRaw) : null;
    if (phoneRaw && !formattedPhone) {
      return NextResponse.json(
        { ok: false, error: "Phone must be a valid US 10-digit number." },
        { status: 400 }
      );
    }

    const subjectAddress = String(subject.address ?? "").trim();
    const propertyAddress = subjectAddress || comparison[0]?.address?.toString().trim() || null;

    let location: LeadLocationSignals = parseLeadAddress(subjectAddress || propertyAddress || "");
    if (!location.city && propertyAddress) {
      location = parseLeadAddress(propertyAddress);
    }

    const agents = await loadMatchableAgents();
    const ranked = matchAgents(location, agents, { limit: 3 });
    const primaryAgentId = ranked[0]?.id ?? null;
    const matchedIds = ranked.map((a) => a.id);

    const captureContext = {
      source,
      subject_property: subject,
      comparison_properties: comparison,
      ai_recommendation: ai,
      matched_agent_ids: matchedIds,
      match_scores: ranked.map((a) => ({ agent_id: a.id, score: a.matchScore })),
      captured_at: new Date().toISOString(),
    };

    const insertPayload: Record<string, unknown> = {
      agent_id: primaryAgentId,
      name,
      email,
      phone: formattedPhone ?? null,
      sms_opt_in: false,
      property_address: propertyAddress,
      source,
      traffic_source: `${source}:expert_cta`,
      intent: "buy",
      tool_used: "ai_property_comparison",
      timeframe: null,
      location: null,
      property_value: null,
      lead_quality: "high",
      lead_status: "new",
      rating: "hot",
      contact_frequency: "weekly",
      contact_method: phoneRaw ? "both" : "email",
      next_contact_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      notes: summarizeNotes(subject, ai, matchedIds),
    };

    insertPayload.capture_context = captureContext as any;

    type InsertErr = { message?: string; code?: string; details?: string; hint?: string };

    async function tryInsert(payload: Record<string, unknown>) {
      return supabaseServer.from("leads").insert(payload as any).select("id").single();
    }

    let { data, error } = await tryInsert(insertPayload);

    // Retry without capture_context (older DBs / cache) — keep full JSON in notes.
    if (error) {
      console.warn("expert-capture insert (full) failed, retrying without capture_context", error);
      const { capture_context: _cc, ...withoutContext } = insertPayload;
      const notesWithContext = `${String(withoutContext.notes ?? "")}\n\n[capture_context json]\n${JSON.stringify(captureContext).slice(0, 12000)}`;
      ({ data, error } = await tryInsert({
        ...withoutContext,
        notes: notesWithContext,
      }));
    }

    // Retry unassigned if agent FK / type mismatch.
    if (error && insertPayload.agent_id) {
      console.warn("expert-capture insert retry unassign agent_id", error);
      const { capture_context: _drop, ...rest } = insertPayload;
      const notesUnassigned = `${String(rest.notes ?? "")}\n\n[capture_context json]\n${JSON.stringify(captureContext).slice(0, 12000)}`;
      ({ data, error } = await tryInsert({
        ...rest,
        agent_id: null,
        notes: notesUnassigned,
      }));
    }

    if (error) {
      const err = error as InsertErr;
      console.error("expert-capture insert error", err);
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to save lead.",
          ...(process.env.NODE_ENV === "development"
            ? {
                debug: err.message,
                code: err.code,
                details: err.details,
                hint: err.hint,
              }
            : {}),
        },
        { status: 500 }
      );
    }

    const leadId = data?.id != null ? String(data.id) : null;

    if (leadId) {
      try {
        await scheduleEmailSequenceForLead(leadId);
        await recordLeadEvent({
          lead_id: leadId,
          event_type: "expert_lead_capture",
          metadata: { source, matched_agent_ids: matchedIds },
        });
        await runLeadMarketplacePipeline(leadId);
        await scoreLead(leadId, true);
      } catch (e) {
        console.warn("expert-capture post-insert hooks", e);
      }
    }

    const agentNotify = process.env.AGENT_NOTIFICATION_EMAIL;
    if (agentNotify) {
      try {
        await sendEmail({
          to: agentNotify,
          subject: "New expert request (AI Property Comparison)",
          text: `New lead requested an expert consult.

Name: ${name}
Email: ${email}
Phone: ${formattedPhone ?? "(not provided)"}
Subject property: ${propertyAddress ?? "(not provided)"}
Primary matched agent id: ${primaryAgentId ?? "(unassigned)"}
Matched agent ids: ${matchedIds.join(", ") || "(none)"}
Lead id: ${leadId ?? ""}
Time: ${new Date().toISOString()}`,
        });
      } catch (mailErr) {
        console.warn("expert-capture notify email failed", mailErr);
      }
    }

    // Optional: email the assigned agent directly (requires auth email).
    if (primaryAgentId) {
      try {
        const { data: agentRow } = await supabaseServer
          .from("agents")
          .select("auth_user_id")
          .eq("id", primaryAgentId)
          .maybeSingle();
        const authUserId = String((agentRow as any)?.auth_user_id ?? "");
        if (authUserId) {
          const { data: authUser } = await supabaseServer.auth.admin.getUserById(authUserId);
          const to = authUser?.user?.email;
          if (to) {
            await sendEmail({
              to,
              subject: "New matched lead — AI Property Comparison",
              text: `You have a new lead match from PropertyTools AI (AI Property Comparison).

Contact: ${name} <${email}>
Phone: ${formattedPhone ?? "—"}
Property: ${propertyAddress ?? "—"}

Sign in to PropertyTools AI: ${process.env.NEXT_PUBLIC_SITE_URL || ""}/login

Lead ID: ${leadId}`,
            });
          }
        }
      } catch (e) {
        console.warn("expert-capture matched agent email", e);
      }
    }

    return NextResponse.json({
      ok: true,
      leadId,
      matched_agent_ids: matchedIds,
      primary_agent_id: primaryAgentId,
    });
  } catch (e: any) {
    console.error("POST /api/leads/expert-capture", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
