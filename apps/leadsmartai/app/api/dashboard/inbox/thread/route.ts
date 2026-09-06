import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { OWN_MESSAGES_FILTER } from "@/lib/email/ownMessages";

export async function GET(req: Request) {
  try {
    const supabase = supabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: agent } = await supabase.from("agents").select("id").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!agent?.id) return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("leadId");
    const channel = searchParams.get("channel") ?? "sms";

    if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });

    // Fetch lead info
    const { data: lead } = await supabaseAdmin
      .from("contacts")
      .select("id, name, email, phone, rating, property_address, auto_pilot")
      .eq("id", leadId)
      .eq("agent_id", agent.id)
      .maybeSingle();

    if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

    // Fetch messages based on channel
    let messages: Array<Record<string, unknown>> = [];

    if (channel === "sms" || channel === "all") {
      const { data: sms } = await supabaseAdmin
        .from("sms_messages")
        .select("id, message, direction, created_at")
        .eq("contact_id", leadId as unknown as number)
        .order("created_at", { ascending: true })
        .limit(100);
      messages.push(...(sms ?? []).map((m: any) => ({ ...m, channel: "sms" })));
    }

    if (channel === "email" || channel === "all") {
      const { data: emails } = await supabaseAdmin
        .from("email_messages")
        .select("id, subject, message, direction, created_at")
        .eq("contact_id", leadId as unknown as number)
        .or(OWN_MESSAGES_FILTER)
        .order("created_at", { ascending: true })
        .limit(100);
      messages.push(...(emails ?? []).map((m: any) => ({ ...m, channel: "email" })));
    }

    if (channel === "call" || channel === "all") {
      const { data: calls } = await supabaseAdmin
        .from("call_logs")
        .select("id, notes, direction, status, duration_seconds, created_at")
        .eq("contact_id", leadId as unknown as number)
        .order("created_at", { ascending: true })
        .limit(100);
      // Shaped like a message so the thread renders it with no special case:
      // the AI summary is the body, duration and status ride alongside.
      messages.push(
        ...(calls ?? []).map((c: any) => ({
          id: c.id,
          message: c.notes ?? "",
          direction: c.direction,
          created_at: c.created_at,
          channel: "call",
          durationSeconds: c.duration_seconds,
          status: c.status,
        })),
      );
    }

    // Sort all messages by time
    messages.sort((a, b) => {
      const ta = new Date(String(a.created_at)).getTime();
      const tb = new Date(String(b.created_at)).getTime();
      return ta - tb;
    });

    return NextResponse.json({
      ok: true,
      lead: {
        id: String(lead.id),
        name: (lead as any).name,
        email: (lead as any).email,
        phone: (lead as any).phone,
        rating: (lead as any).rating,
        property_address: (lead as any).property_address,
        auto_pilot: Boolean((lead as any).auto_pilot),
      },
      messages,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
