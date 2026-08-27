import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { sendEmail } from "@/lib/email";
import { sendSMS } from "@/lib/twilioSms";
import { appendMessages } from "@/lib/leadConversationHelpers";

export const runtime = "nodejs";

function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+1${d}` : null;
}

type Body = {
  text?: string;
  channel?: "sms" | "email" | "auto";
  scheduleFollowups?: boolean;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await ctx.params;
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as Body;
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "text is required." }, { status: 400 });
    }

    const { data: lead, error } = await supabaseServer
      .from("contacts")
      .select("id,name,email,phone,property_address,contact_method,agent_id")
      .eq("id", leadId)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (error) throw error;
    if (!lead) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const method = String((lead as any).contact_method ?? "email");
    let channel = body.channel ?? "auto";
    if (channel === "auto") {
      if (method === "sms" || method === "both") channel = "sms";
      else channel = "email";
    }

    let sent = false;

    if (channel === "sms" && (method === "sms" || method === "both") && (lead as any).phone) {
      const to = toE164(String((lead as any).phone));
      if (to) {
        await sendSMS(to, text, leadId);
        sent = true;
      }
    }

    if (!sent && (channel === "email" || method === "email" || method === "both") && (lead as any).email) {
      await sendEmail({
        to: String((lead as any).email),
        subject: "Message from your agent (LeadSmart AI)",
        text,
      });
      sent = true;
    }

    if (!sent) {
      return NextResponse.json(
        { ok: false, error: "Could not send — check phone/email and contact method." },
        { status: 400 }
      );
    }

    await appendMessages(leadId, agentId, [
      {
        role: "assistant",
        content: text,
        created_at: new Date().toISOString(),
        source: "agent_send",
      },
    ]);

    await supabaseServer.from("communications").insert({
      contact_id: leadId,
      agent_id: agentId,
      type: channel === "sms" ? "sms" : "email",
      content: text,
      status: "sent",
    } as any);

    await supabaseServer.from("events").insert({
      user_id: null,
      event_type: "outreach_sent",
      metadata: { contact_id: leadId, channel, source: "ai_assistant_dashboard" },
    } as any);


    return NextResponse.json({ ok: true, sent: true, channel });
  } catch (e: any) {
    console.error("ai-send", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
