import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";
import { recordNurtureAlert } from "@/lib/nurture/recordAlert";

// 1x1 transparent GIF
const GIF_BASE64 =
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("contact_id");
    const messageLogId = url.searchParams.get("message_log_id");
    if (leadId) {
      const rpcRes = await supabaseServer.rpc("log_lead_event", {
        p_contact_id: leadId,
        p_event_type: "email_open",
        p_metadata: {},
      });

      const debounced = Boolean((rpcRes as any)?.data?.debounced);

      // Feed the open into the composite lead rating (email_open is a weak,
      // weighted signal in scoreBehavior). Skip debounced hits so proxy
      // prefetch / preview-pane reloads don't inflate the score.
      if (!debounced) {
        await logEngagementEvent(String(leadId), "email_open", { source: "email" });
      }

      // If we have a specific message log id, only score when we successfully transition it.
      if (messageLogId) {
        const { data: logUpdated } = await supabaseServer
          .from("message_logs")
          .update({ status: "opened" })
          .eq("id", messageLogId)
          .eq("contact_id", leadId)
          .eq("status", "sent")
          .select("id,status")
          .maybeSingle();

        if ((logUpdated as any)?.id && !debounced) {
          const scoreRes = await supabaseServer.rpc("marketplace_apply_nurture_score", {
            p_contact_id: leadId,
            p_delta: 1,
          } as any);

          const scoreData = scoreRes.data as any;
          if (scoreData?.rating === "hot") {
            // Avoid duplicate hot alerts within 24h.
            const { data: leadRow } = await supabaseServer
              .from("contacts")
              .select("agent_id")
              .eq("id", leadId)
              .maybeSingle();

            const agentId = (leadRow as any)?.agent_id ?? null;
            if (agentId) {
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
                await recordNurtureAlert({ agentId: agentId, contactId: leadId, type: "hot", message: "Lead temperature turned HOT (email opened)." }, supabaseServer);
              }
            }
          }
        }
      } else {
        // Best-effort: if the event wasn't debounced, score by +1.
        const rpcData = (rpcRes as any)?.data ?? {};
        if (!debounced) {
          await supabaseServer.rpc("marketplace_apply_nurture_score", {
            p_contact_id: leadId,
            p_delta: 1,
          } as any);
        }
      }
    }

    const buf = Buffer.from(GIF_BASE64, "base64");
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch {
    // Always return the pixel to avoid breaking email clients.
    const buf = Buffer.from(GIF_BASE64, "base64");
    return new NextResponse(buf, { status: 200, headers: { "Content-Type": "image/gif" } });
  }
}

