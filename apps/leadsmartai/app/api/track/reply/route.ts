import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      contact_id?: string | number;
      message_log_id?: string;
    };

    const leadId = String(body.contact_id ?? "").trim();
    const messageLogId = String(body.message_log_id ?? "").trim();

    if (!leadId) {
      return NextResponse.json({ ok: false, error: "lead_id is required" }, { status: 400 });
    }

    // Avoid duplicate reply scoring/alerts within 24h.
    const { data: existingReplied } = await supabaseServer
      .from("message_logs")
      .select("id")
      .eq("contact_id", leadId)
      .eq("status", "replied")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (existingReplied?.id) {
      return NextResponse.json({ ok: true, updated: false });
    }

    // 1) Record reply event in lead_events for the existing timeline.
    await supabaseServer.rpc("log_lead_event", {
      p_contact_id: leadId,
      p_event_type: "reply",
      p_metadata: {},
    });
    // Feed the email reply into the composite lead rating — a two-way signal
    // that bumps the contact to at least warm (see recomputeLeadRating).
    await logEngagementEvent(leadId, "email_reply", { source: "email" });

    // 2) Mark the message as replied (so scoring isn't duplicated).
    let updatedLog = false;
    if (messageLogId) {
      const { data: logRes } = await supabaseServer
        .from("message_logs")
        .update({ status: "replied" })
        .eq("id", messageLogId)
        .eq("contact_id", leadId)
        .neq("status", "replied")
        .select("id,status")
        .maybeSingle();
      updatedLog = Boolean((logRes as any)?.id);
    } else {
      const { data: logRes } = await supabaseServer
        .from("message_logs")
        .update({ status: "replied" })
        .eq("contact_id", leadId)
        .eq("type", "email")
        .in("status", ["sent", "opened", "clicked"])
        .order("created_at", { ascending: false } as any)
        .limit(1 as any)
        .select("id,status")
        .maybeSingle();
      updatedLog = Boolean((logRes as any)?.id);
    }

    if (!updatedLog) {
      return NextResponse.json({ ok: true, updated: false });
    }

    // 3) Apply nurture scoring (+10) and derive new temperature rating.
    const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
      p_contact_id: leadId,
      p_delta: 10,
    } as any);

    const scoreData = scoreRes.data as any;
    const newRating = scoreData?.rating as string | undefined;

    // 4) Stop automation for this lead sequence.
    await supabaseServer
      .from("lead_sequences")
      .update({ status: "completed" })
      .eq("lead_id", leadId);

    await supabaseServer
      .from("contacts")
      .update({ automation_disabled: true } as any)
      .eq("id", leadId);

    // 5) Insert nurture alert(s).
    const { data: leadRow } = await supabaseServer
      .from("contacts")
      .select("agent_id")
      .eq("id", leadId)
      .maybeSingle();

    const agentId = (leadRow as any)?.agent_id ?? null;

    if (agentId) {
      await supabaseServer.from("nurture_alerts").insert({
        agent_id: agentId,
        contact_id: leadId,
        type: "replied",
        message: "Lead replied — nurture sequence stopped.",
      } as any);

      if (newRating === "hot") {
        const { data: existingHot } = await supabaseServer
          .from("nurture_alerts")
          .select("id")
          .eq("contact_id", leadId)
          .eq("agent_id", agentId)
          .eq("type", "hot")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();

        if (!existingHot?.id) {
          await supabaseServer.from("nurture_alerts").insert({
            agent_id: agentId,
            contact_id: leadId,
            type: "hot",
            message: "Lead temperature turned HOT (reply).",
          } as any);
        }
      }
    }

    return NextResponse.json({ ok: true, updated: true, newRating });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

