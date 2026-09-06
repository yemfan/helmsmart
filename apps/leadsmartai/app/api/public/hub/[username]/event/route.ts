import { NextResponse } from "next/server";
import { isBeaconEventType, sanitizeBeaconMeta } from "@/lib/marketing-hub/events";
import { resolveAgentIdByUsername } from "@/lib/marketing-hub/loadHub";
import { consumeHubQuota } from "@/lib/marketing-hub/usage";
import { SESSION_COOKIE, VISITOR_COOKIE, readCookieFromHeader } from "@/lib/marketing-hub/visitor";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/public/hub/[username]/event — UNAUTHENTICATED beacon.
 *
 * One interaction on the hub: a CTA click, a tool opened, the assistant
 * opened, a social link followed. The event name must be on the allowlist and
 * the metadata is reduced to a few short strings, so the most a hostile
 * caller can do is inflate one agent's click counts.
 *
 * Always 204. Analytics must never be the reason a public page shows an
 * error, and the visitor's browser learns nothing from the response.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await ctx.params;
    const agentId = await resolveAgentIdByUsername(username);
    if (agentId === null) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isBeaconEventType(body.type)) return new NextResponse(null, { status: 204 });

    // Still a 204 when over quota: the visitor's browser learns nothing, the
    // row simply is not written.
    const quota = await consumeHubQuota(req, "event");
    if (!quota.allowed) return new NextResponse(null, { status: 204 });

    const jar = req.headers.get("cookie");
    const path = typeof body.path === "string" && body.path.startsWith("/@") ? body.path.slice(0, 200) : `/@${username}`;

    const { error } = await supabaseAdmin.from("traffic_events").insert({
      event_type: body.type,
      page_path: path,
      agent_id: agentId,
      visitor_id: readCookieFromHeader(jar, VISITOR_COOKIE),
      session_id: readCookieFromHeader(jar, SESSION_COOKIE),
      metadata: { kind: "hub_event", ...sanitizeBeaconMeta(body.meta) },
    } as never);
    if (error) console.warn("[hub.event] insert:", error.message);
  } catch (e) {
    console.warn("[hub.event] threw:", e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
