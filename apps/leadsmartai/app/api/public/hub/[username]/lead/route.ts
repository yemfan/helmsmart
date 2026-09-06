import { NextResponse } from "next/server";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { captureHubLead, hubLeadInputFromBody, type HubLeadChannel } from "@/lib/marketing-hub/leads";
import { loadHubSettings, resolveAgentIdByUsername } from "@/lib/marketing-hub/loadHub";

export const runtime = "nodejs";

/**
 * POST /api/public/hub/[username]/lead — UNAUTHENTICATED.
 *
 * A visitor on an agent's marketing hub becomes a contact belonging to THAT
 * agent. The handle in the path is the only routing key, and it is resolved
 * server-side; nothing about which agent owns the lead comes from the body,
 * because a client-supplied agent id would let anyone plant contacts in
 * anyone's CRM.
 *
 * The work itself lives in `captureHubLead`, shared with the AI assistant,
 * the home-value funnel and the booking page, so every channel writes the
 * same record and triggers the same notifications.
 *
 * `channel` in the body says which surface sent it and is clamped to the
 * known set; it only affects the note and the rating, never ownership.
 */

const CHANNELS: readonly HubLeadChannel[] = ["form", "home_value", "booking", "tool"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await ctx.params;
    const agentId = await resolveAgentIdByUsername(username);
    if (agentId === null) {
      return NextResponse.json({ ok: false, error: "unknown_agent" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const channel = CHANNELS.includes(body.channel as HubLeadChannel)
      ? (body.channel as HubLeadChannel)
      : "form";

    const { config } = await loadHubSettings(agentId);
    const result = await captureHubLead({
      agentId,
      username,
      input: hubLeadInputFromBody(body, channel),
      cookieHeader: req.headers.get("cookie"),
      requestMeta: extractRequestMeta(req),
      settings: config.leadCapture,
    });

    if (!result.ok) {
      const status = result.error === "save_failed" ? 500 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[hub.lead] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
