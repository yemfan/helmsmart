import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveAgentIdByUsername } from "@/lib/marketing-hub/loadHub";
import {
  SESSION_COOKIE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE_SECONDS,
  readCookieFromHeader,
  resolveVisitor,
} from "@/lib/marketing-hub/visitor";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/public/hub/[username]/view — UNAUTHENTICATED.
 *
 * Records one page view of an agent's hub and issues the first-party visitor
 * and session cookies.
 *
 * WHY A BEACON RATHER THAN TRACKING DURING RENDER. The page is
 * force-dynamic, so counting on the server would be easier — and would count
 * every crawler, preview fetch and uptime check as a visitor. An agent shown
 * "1,842 visitors" that is mostly Googlebot stops believing the whole
 * dashboard. Requiring a browser to run a fetch is a crude filter but it
 * removes the bulk of that.
 *
 * The cookies are set HERE and not in the page, so there is exactly one place
 * that decides identity — and they are httpOnly, so the ids cannot be read or
 * forged by script on the page. They carry no personal data: two random
 * strings, first-party, one per browser and one per visit.
 */

export async function POST(
  req: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await ctx.params;
    const agentId = await resolveAgentIdByUsername(username);
    // A quiet 204 rather than a 404: tracking is not the visitor's business,
    // and a failed beacon must never surface as an error on the page.
    if (agentId === null) return new NextResponse(null, { status: 204 });

    const jar = req.headers.get("cookie");

    const ids = resolveVisitor(
      {
        visitorId: readCookieFromHeader(jar, VISITOR_COOKIE),
        sessionId: readCookieFromHeader(jar, SESSION_COOKIE),
      },
      () => randomUUID().replace(/-/g, ""),
      Date.now(),
    );

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (v: unknown, max: number) =>
      typeof v === "string" ? v.trim().slice(0, max) || null : null;

    // Only record the first view of a session's referrer as the source — a
    // later in-site navigation must not overwrite how they originally arrived.
    const { error } = await supabaseAdmin.from("traffic_events").insert({
      event_type: "page_view",
      // Only a path under this hub is accepted; anything else is the root.
      page_path:
        typeof body.path === "string" &&
        (body.path === `/@${username}` || body.path.startsWith(`/@${username}/`))
          ? body.path.slice(0, 200)
          : `/@${username}`,
      agent_id: agentId,
      visitor_id: ids.visitorId,
      session_id: ids.sessionId,
      source: str(body.utmSource, 80) ?? (ids.isNewSession ? str(body.referrerHost, 120) : null),
      campaign: str(body.utmCampaign, 120),
      metadata: { kind: "hub_view", newVisitor: ids.isNewVisitor, newSession: ids.isNewSession },
    } as never);
    if (error) console.warn("[hub.view] insert:", error.message);

    const res = new NextResponse(null, { status: 204 });
    const secure = process.env.NODE_ENV === "production";
    const common = `Path=/; SameSite=Lax; HttpOnly${secure ? "; Secure" : ""}`;
    res.headers.append(
      "set-cookie",
      `${VISITOR_COOKIE}=${encodeURIComponent(ids.visitorId)}; Max-Age=${VISITOR_MAX_AGE_SECONDS}; ${common}`,
    );
    // Session cookie carries its own last-seen stamp, so it is refreshed on
    // every view rather than expiring mid-read.
    res.headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(ids.sessionId)}; Max-Age=${VISITOR_MAX_AGE_SECONDS}; ${common}`,
    );
    return res;
  } catch (e) {
    console.warn("[hub.view] threw:", e instanceof Error ? e.message : e);
    return new NextResponse(null, { status: 204 });
  }
}
