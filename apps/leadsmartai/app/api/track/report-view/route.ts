import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { recordNurtureAlert } from "@/lib/nurture/recordAlert";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      contact_id?: string;
      report_id?: string;
    };

    if (!body.contact_id) {
      return NextResponse.json({ ok: false, error: "lead_id is required" }, { status: 400 });
    }

    const meta: any = {};
    if (body.report_id) meta.report_id = body.report_id;

    const rpcRes = await supabaseServer.rpc("log_lead_event", {
      p_contact_id: body.contact_id,
      p_event_type: "report_view",
      p_metadata: meta,
    });
    const rpcData = (rpcRes?.data as any) ?? rpcRes;
    const debounced = Boolean(rpcData?.debounced);

    if (!debounced) {
      // +5 for nurture score (spec: view +5)
      const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
        p_contact_id: body.contact_id,
        p_delta: 5,
      } as any);
      const rating = (scoreRes?.data as any)?.rating as string | undefined;

      // If a message is currently opened but not clicked, treat report-view as progression.
      const { data: latestLog } = await supabaseServer
        .from("message_logs")
        .select("id")
        .eq("contact_id", body.contact_id)
        .eq("type", "email")
        .in("status", ["sent", "opened"])
        .order("created_at", { ascending: false } as any)
        .limit(1)
        .maybeSingle();

      if ((latestLog as any)?.id) {
        await supabaseServer
          .from("message_logs")
          .update({ status: "clicked" })
          .eq("id", (latestLog as any).id);
      }

      // Create HOT alert if we've crossed the threshold.
      if (rating === "hot") {
        const { data: leadRow } = await supabaseServer
          .from("contacts")
          .select("agent_id")
          .eq("id", body.contact_id)
          .maybeSingle();

        const agentId = (leadRow as any)?.agent_id ?? null;
        if (agentId) {
          const { data: existing } = await supabaseServer
            .from("nurture_alerts")
            .select("id")
            .eq("contact_id", body.contact_id)
            .eq("agent_id", agentId)
            .eq("type", "hot")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

          if (!existing?.id) {
            await recordNurtureAlert({ agentId: agentId, contactId: body.contact_id, type: "hot", message: "Lead temperature turned HOT (report viewed)." }, supabaseServer);
          }
        }
      }
    }

    const result = (rpcRes as any)?.data ?? rpcRes;
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

