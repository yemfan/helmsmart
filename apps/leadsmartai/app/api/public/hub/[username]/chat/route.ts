import { NextResponse } from "next/server";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { runHubChatTurn } from "@/lib/marketing-hub/chat/service";
import { consumeHubChatMessage } from "@/lib/marketing-hub/chat/usage";
import { loadHubByUsername } from "@/lib/marketing-hub/loadHub";
import { SESSION_COOKIE, VISITOR_COOKIE, readCookieFromHeader } from "@/lib/marketing-hub/visitor";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/public/hub/[username]/chat — UNAUTHENTICATED.
 *
 * One message from a visitor to the agent's AI assistant. The agent is
 * resolved from the path; the conversation id in the body is only honoured
 * when the row belongs to that agent. Metered per browser per day and capped
 * per conversation, so the cost of a bad actor is bounded and small.
 *
 * Errors come back as short codes the client maps to friendly copy. Nothing
 * about the model, the prompt or the failure reaches the visitor.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

    const hub = await loadHubByUsername(username);
    if (hub.status !== "ready" || hub.agentId === null) {
      return NextResponse.json({ ok: false, error: "unknown_agent" }, { status: 404 });
    }
    if (!hub.assistantAvailable) {
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    }

    const usage = await consumeHubChatMessage(req);
    if (!usage.allowed) {
      return NextResponse.json({ ok: false, error: "limit" }, { status: 429 });
    }

    const locale = body.locale === "zh-Hans" ? "zh-Hans" : "en";
    const siteBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(/\/+$/, "");
    const cookieHeader = req.headers.get("cookie");

    const result = await runHubChatTurn({
      hub,
      message,
      conversationId: typeof body.conversationId === "string" ? body.conversationId.slice(0, 60) : null,
      cookieHeader,
      requestMeta: extractRequestMeta(req),
      locale,
      siteBase,
      utmSource: typeof body.utmSource === "string" ? body.utmSource.slice(0, 80) : null,
      utmCampaign: typeof body.utmCampaign === "string" ? body.utmCampaign.slice(0, 120) : null,
    });

    if (!result.ok) {
      const status = result.error === "limit" ? 429 : result.error === "unavailable" ? 503 : 500;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    // Every answered message is an `ai_message` for the overview; the client
    // beacons `ai_open` once when the panel opens.
    void supabaseAdmin
      .from("traffic_events")
      .insert({
        event_type: "ai_message",
        page_path: `/@${username}`,
        agent_id: hub.agentId,
        visitor_id: readCookieFromHeader(cookieHeader, VISITOR_COOKIE),
        session_id: readCookieFromHeader(cookieHeader, SESSION_COOKIE),
        metadata: { kind: "hub_event", conversationId: result.conversationId, leadCaptured: result.leadCaptured },
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[hub.chat] event:", error.message);
      });

    return NextResponse.json({
      ok: true,
      conversationId: result.conversationId,
      reply: result.reply,
      leadCaptured: result.leadCaptured,
      limitReached: result.limitReached,
    });
  } catch (e) {
    console.error("[hub.chat] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
