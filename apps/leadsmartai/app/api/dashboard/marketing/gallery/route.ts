import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { loadGallery } from "@/lib/marketing/gallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/marketing/gallery
 * Every picture and video the platform holds for the signed-in agent, newest
 * first, with a count per source. Viewing your own media is not plan-gated;
 * uploading and deleting go through the media-library routes, which are.
 */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const { items, summary } = await loadGallery(auth.agentId);
    return NextResponse.json({ ok: true, items, summary });
  } catch (e) {
    console.error("[marketing/gallery]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
