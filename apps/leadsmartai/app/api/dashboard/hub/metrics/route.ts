import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { summariseHubMetrics } from "@/lib/marketing-hub/events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/hub/metrics?days=30
 *
 * The overview numbers for THIS agent's hub. Filtered on `agent_id`, which
 * is the whole point of the tenant column: without it the platform's own
 * traffic (agent_id is null) and every other agent's visitors would blend
 * into one number — the exact failure the foundation migration warns about.
 *
 * Real rows only. When there are none the client shows an empty state; this
 * never returns a placeholder number.
 */
export async function GET(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const url = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("traffic_events")
      .select("event_type, visitor_id, session_id, source, metadata, created_at")
      .eq("agent_id", auth.agentId as never)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000);

    if (error) {
      console.warn("[hub.metrics]", error.message);
      return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
    }

    const metrics = summariseHubMetrics((data as Record<string, unknown>[] | null) ?? [], { days });

    // Recent conversations, for the overview's "what visitors asked" list.
    const { data: convos } = await supabaseAdmin
      .from("hub_conversations")
      .select("id, message_count, contact_id, created_at, messages")
      .eq("agent_id", auth.agentId as never)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8);

    const conversations = ((convos as Record<string, unknown>[] | null) ?? []).map((c) => {
      const msgs = Array.isArray(c.messages) ? (c.messages as { role: string; content: string }[]) : [];
      const first = msgs.find((m) => m.role === "user");
      return {
        id: String(c.id),
        messageCount: Number(c.message_count ?? 0),
        becameLead: Boolean(c.contact_id),
        contactId: (c.contact_id as string | null) ?? null,
        createdAt: String(c.created_at ?? ""),
        firstMessage: first ? String(first.content).slice(0, 140) : "",
      };
    });

    return NextResponse.json({ ok: true, metrics, conversations });
  } catch (e) {
    console.error("[hub.metrics] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
