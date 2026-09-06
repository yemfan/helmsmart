import { NextResponse } from "next/server";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { runHubChatTurn } from "@/lib/marketing-hub/chat/service";
import { consumeHubChatMessage } from "@/lib/marketing-hub/chat/usage";
import { loadHubByUsername } from "@/lib/marketing-hub/loadHub";
import { verifyTurnstile } from "@/lib/marketing-hub/turnstile";
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
 * The reply is STREAMED as server-sent events so the visitor reads words as
 * they are produced rather than staring at a spinner for ten seconds:
 *
 *   data: {"type":"delta","text":"…"}      zero or more
 *   data: {"type":"done", conversationId, leadCaptured, limitReached}
 *   data: {"type":"error","error":"failed"}
 *
 * Refusals that are known before the model runs (unknown agent, assistant
 * off, over quota) are plain JSON with a status the client maps to copy.
 * Nothing about the model, the prompt or a failure reaches the visitor.
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

    // A token is required on the FIRST message of a conversation only; the
    // conversation id then proves the thread was opened from a verified page.
    if (typeof body.conversationId !== "string" || !body.conversationId) {
      const human = await verifyTurnstile(body.turnstileToken, extractRequestMeta(req).ipAddress);
      if (!human.ok) {
        return NextResponse.json({ ok: false, error: "verification" }, { status: 403 });
      }
    }

    const usage = await consumeHubChatMessage(req);
    if (!usage.allowed) {
      return NextResponse.json({ ok: false, error: "limit" }, { status: 429 });
    }

    const locale = body.locale === "zh-Hans" ? "zh-Hans" : "en";
    // Relative paths, not absolute URLs: the chat renders links through
    // MarkdownLite, which only makes in-app paths clickable (an absolute host
    // in model prose may be hallucinated). The visitor is already on-site.
    const siteBase = "";
    const cookieHeader = req.headers.get("cookie");
    const agentId = hub.agentId;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            /* the visitor left; nothing to deliver to */
          }
        };
        try {
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
            onDelta: (text) => send({ type: "delta", text }),
          });

          if (!result.ok) {
            send({ type: "error", error: result.error });
          } else {
            // Every answered message is an `ai_message` for the overview; the
            // client beacons `ai_open` once when the panel opens.
            void supabaseAdmin
              .from("traffic_events")
              .insert({
                event_type: "ai_message",
                page_path: `/@${username}`,
                agent_id: agentId,
                visitor_id: readCookieFromHeader(cookieHeader, VISITOR_COOKIE),
                session_id: readCookieFromHeader(cookieHeader, SESSION_COOKIE),
                metadata: { kind: "hub_event", conversationId: result.conversationId, leadCaptured: result.leadCaptured },
              } as never)
              .then(({ error }) => {
                if (error) console.warn("[hub.chat] event:", error.message);
              });
            send({
              type: "done",
              conversationId: result.conversationId,
              reply: result.reply,
              leadCaptured: result.leadCaptured,
              limitReached: result.limitReached,
            });
          }
        } catch (e) {
          console.error("[hub.chat] stream threw:", e instanceof Error ? e.message : e);
          send({ type: "error", error: "failed" });
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (e) {
    console.error("[hub.chat] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
