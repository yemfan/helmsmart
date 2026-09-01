import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";
import { recordNurtureAlert } from "@/lib/nurture/recordAlert";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const leadId = url.searchParams.get("contact_id");
  const messageLogId = url.searchParams.get("message_log_id");
  const target = url.searchParams.get("url");

  // Basic validation: only allow http(s) redirects.
  let safeTarget: string | null = null;
  try {
    if (target) {
      const u = new URL(target);
      if (u.protocol === "http:" || u.protocol === "https:") safeTarget = u.toString();
    }
  } catch {
    safeTarget = null;
  }

  if (leadId) {
    const rpcRes = await supabaseServer.rpc("log_lead_event", {
      p_contact_id: leadId,
      p_event_type: "link_click",
      p_metadata: safeTarget ? { url: safeTarget } : {},
    });

    const debounced = Boolean((rpcRes as any)?.data?.debounced);

    if (messageLogId) {
      const { data: logUpdated } = await supabaseServer
        .from("message_logs")
        .update({ status: "clicked" })
        .eq("id", messageLogId)
        .eq("contact_id", leadId)
        .in("status", ["sent", "opened"])
        .select("id,status")
        .maybeSingle();

      if (logUpdated?.id && !debounced) {
        const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
          p_contact_id: leadId,
          p_delta: 3,
        } as any);

        const rating = (scoreRes?.data as any)?.rating as string | undefined;
        if (rating === "hot") {
          const { data: leadRow } = await supabaseServer
            .from("contacts")
            .select("agent_id")
            .eq("id", leadId)
            .maybeSingle();

          const agentId = (leadRow as any)?.agent_id ?? null;

          if (agentId) {
            // Avoid duplicate hot alerts within 24h.
            const { data: existing } = await supabaseServer
              .from("nurture_alerts")
              .select("id")
              .eq("contact_id", leadId)
              .eq("agent_id", agentId)
              .eq("type", "hot")
              .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .limit(1)
              .maybeSingle();

            if (!existing?.id) {
              await recordNurtureAlert({ agentId: agentId, contactId: leadId, type: "hot", message: "Lead temperature turned HOT (link clicked)." }, supabaseServer);
            }
          }
        }
      }
    }
    // Feed the click into the composite lead rating (email_click is weighted
    // in scoreBehavior → engagement). Service-role under the hood (RLS-safe).
    await logEngagementEvent(String(leadId), "email_click", {
      source: "email",
      payload: safeTarget ? { url: safeTarget } : {},
    });
  }

  if (!safeTarget) {
    return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
  }

  return NextResponse.redirect(safeTarget, { status: 302 });
}

