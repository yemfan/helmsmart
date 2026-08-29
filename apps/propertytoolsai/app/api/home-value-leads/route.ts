import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getLeadLimit } from "@/lib/planLimits";
import { scheduleEmailSequenceForLead } from "@/lib/emailSequences";
import { runLeadMarketplacePipeline } from "@/lib/leadScorePipeline";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Widget may send `agents.id` (digits) or `auth.users.id` / `agents.auth_user_id` (UUID). */
async function resolveHomeValueAgentId(raw: string | undefined): Promise<string | null> {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return t;
  if (UUID_RE.test(t)) {
    const { data, error } = await supabaseServer
      .from("agents")
      .select("id")
      .eq("auth_user_id", t)
      .maybeSingle();
    if (error || (data as any)?.id == null) return null;
    return String((data as any).id);
  }
  return null;
}

type LeadPayload = {
  name?: string;
  address: string;
  email: string;
  phone?: string;
  agentId?: string;
};

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LeadPayload;
    const { name, address, email, phone, agentId: agentIdRaw } = body;
    const formattedPhone = phone ? formatUsPhone(phone) : null;
    const resolvedAgentId = await resolveHomeValueAgentId(agentIdRaw);

    if (!address || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing address or email" },
        { status: 400 }
      );
    }

    // Enforce monthly lead limits for the agent (if agentId provided)
    if (resolvedAgentId) {
      const { data: agent, error: agentErr } = await supabaseServer
        .from("agents")
        .select("plan_type")
        .eq("id", resolvedAgentId)
        .maybeSingle();
      if (agentErr && (agentErr as any).code !== "PGRST116") throw agentErr;

      const planType = (agent as any)?.plan_type ?? "free";
      const limit = getLeadLimit(planType);

      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

      const { count, error: countErr } = await supabaseServer
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", resolvedAgentId)
        .gte("created_at", start.toISOString());

      if (countErr) throw countErr;

      if (Number.isFinite(limit) && (count ?? 0) >= limit) {
        return NextResponse.json(
          { ok: false, error: "Upgrade required" },
          { status: 402 }
        );
      }
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const agentEmail = process.env.AGENT_NOTIFICATION_EMAIL || "fan.yes@gmail.com";

    if (resendApiKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "PropertyTools AI <noreply@propertytoolsai.com>",
            to: [agentEmail],
            subject: "New Home Value Lead",
            text: `New home value lead:

Name: ${name || "(not provided)"}
Email: ${email}
Phone: ${phone || "(not provided)"}
Address: ${address}
Agent ID: ${resolvedAgentId || agentIdRaw || "(not provided)"}
Timestamp: ${new Date().toISOString()}`,
          }),
        });
      } catch (e) {
        console.error("Error sending lead notification via Resend", e);
      }
    } else {
      // Email provider not configured; still save to Supabase.
      console.log("Skipping email notification: RESEND_API_KEY not set");
    }

    // Upsert contact for future use, then insert a dashboard-compatible lead.
    // The CRM dashboard reads `leads` fields directly (name/email/phone/source/lead_status),
    // so we must write to those columns here.
    if (email) {
      await supabaseServer
        .from("contacts")
        .upsert(
          {
            agent_id: resolvedAgentId ?? null,
            name: name || address,
            email,
            phone: formattedPhone ?? null,
            address,
            type: "seller",
          },
          { onConflict: "agent_id,email" }
        );
    }

    const { data: lead, error: leadError } = await supabaseServer
      .from("leads")
      .insert({
        agent_id: resolvedAgentId ?? null,
        property_address: address,
        name: name || address,
        email,
        phone: formattedPhone ?? null,
        sms_opt_in: false,
        source: "home_value_widget",
        traffic_source: "home_value_widget:home_value",
        intent: "sell",
        tool_used: "home_value",
        lead_status: "new",
        notes: null,
      } as any)
      .select("id")
      .single();

    if (leadError) {
      console.error("Error saving lead to DB", leadError);
    } else if (lead?.id) {
      await scheduleEmailSequenceForLead(lead.id as string);
      try {
        await runLeadMarketplacePipeline(String(lead.id));
      } catch (e) {
        console.warn("home-value-leads marketplace pipeline", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error handling home value lead", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("leads")
      .select(
        `id, agent_id, property_address, created_at, contact:contact_id (name, email, phone)`
      )
      .eq("lead_source", "home_value_widget")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const leads =
      data?.map((row: any) => ({
        name: row.contact?.name || "",
        address: row.property_address || "",
        email: row.contact?.email || "",
        phone: row.contact?.phone || "",
        agent_id: row.agent_id || "",
        timestamp: row.created_at,
      })) ?? [];

    return NextResponse.json({ leads });
  } catch (e: any) {
    console.error("Error loading leads", e);
    return NextResponse.json(
      { leads: [], error: e?.message ?? "Error loading leads" },
      { status: 500 }
    );
  }
}

