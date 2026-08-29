import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// Dev-only debug endpoint to verify DB writes from the AI SMS webhook.
// GET /api/sms/debug?leadId=123
export async function GET(req: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
    }

    const url = new URL(req.url);
    const leadId = String(url.searchParams.get("leadId") ?? "").trim();
    if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });

    // Some environments may not yet have `sms_opt_in`.
    // Prefer selecting the older stable columns.
    const { data: leadRow } = await supabaseServer
      .from("contacts")
      .select("id,phone,contact_method,automation_disabled,rating,property_address,name")
      .eq("id", leadId)
      .maybeSingle();

    const { data: convoRow } = await supabaseServer
      .from("sms_conversations")
      .select("id,stage,last_ai_reply_at,messages")
      .eq("contact_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: logs } = await supabaseServer
      .from("message_logs")
      .select("id,type,status,content,created_at")
      .eq("contact_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: alerts } = await supabaseServer
      .from("nurture_alerts")
      .select("id,type,message,created_at")
      .eq("contact_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      lead: leadRow ?? null,
      conversation: convoRow
        ? {
            ...convoRow,
            messageCount: Array.isArray((convoRow as any).messages) ? (convoRow as any).messages.length : 0,
          }
        : null,
      messageLogs: logs ?? [],
      nurtureAlerts: alerts ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

