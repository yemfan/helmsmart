import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { scheduleEmailSequenceForLead } from "@/lib/emailSequences";
import { notifyAllAgentsNewLead } from "@/lib/notifications/notifyAllAgentsNewLead";

type LeadPayload = {
  name?: string;
  address: string;
  email: string;
  phone?: string;
};

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LeadPayload;
    const { name, address, email, phone } = body;
    const formattedPhone = phone ? formatUsPhone(phone) : null;

    if (!address || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing address or email" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const agentEmail = process.env.AGENT_NOTIFICATION_EMAIL;

    if (resendApiKey && agentEmail) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "LeadSmart AI <noreply@helmsmart.ai>",
            to: [agentEmail],
            subject: "New Home Value Lead",
            text: `New home value lead:

Name: ${name || "(not provided)"}
Email: ${email}
Phone: ${phone || "(not provided)"}
Address: ${address}
Agent ID: (queued for claim)
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
            agent_id: null,
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
      .from("contacts")
      .insert({
        agent_id: null,
        property_address: address,
        name: name || address,
        email,
        phone: formattedPhone ?? null,
        phone_number: formattedPhone ?? null,
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
        await notifyAllAgentsNewLead({
          leadId: String(lead.id),
          leadName: name || address,
          leadSource: "home_value_widget",
        });
      } catch (e) {
        console.warn("home-value-leads queue notification", e);
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
    const supabase = supabaseServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!agentRow?.id) {
      return NextResponse.json({ ok: false, error: "Agent profile not found" }, { status: 403 });
    }
    const agentId = String(agentRow.id);

    const { data, error } = await supabaseServer
      .from("contacts")
      .select(
        `id, agent_id, property_address, created_at, name, email, phone`
      )
      .eq("source", "home_value_widget")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const leads =
      data?.map((row: any) => ({
        name: row.name || "",
        address: row.property_address || "",
        email: row.email || "",
        phone: row.phone || "",
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

