import { NextResponse } from "next/server";

import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { createMarketReportForAgent } from "@/lib/marketReport/service";
import { getSiteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";

/**
 * Create an agent-branded, client-facing market report for one of the agent's
 * contacts, then return a shareable link the agent drops into the composer.
 *
 * Dual-auth (cookie + Bearer) via getAgentContextFromRequest so the web
 * dashboard and the mobile app both work. The report itself is written by the
 * service-role client inside the service, agent-scoped to the resolved agentId.
 */
export async function POST(req: Request) {
  let agentId: string;
  try {
    const ctx = await getAgentContextFromRequest(req);
    agentId = ctx.agentId;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Sign in to continue." },
      { status: 401 },
    );
  }

  const raw = (await req.json().catch(() => ({}))) as { contactId?: unknown };
  const contactId = typeof raw.contactId === "string" ? raw.contactId.trim() : "";
  if (!contactId) {
    return NextResponse.json(
      { ok: false, error: "A contact is required." },
      { status: 400 },
    );
  }

  const result = await createMarketReportForAgent(agentId, contactId);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const shareUrl = `${getSiteUrl()}/market-report/share/${result.id}`;
  // geoName/city reflect the geography actually matched, so the composer text
  // names the same market the report is for.
  return NextResponse.json({
    ok: true,
    id: result.id,
    shareUrl,
    city: result.geoName || result.subjectCity,
  });
}
