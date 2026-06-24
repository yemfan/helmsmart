import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  createSavedHouseSearch,
  listSavedHouseSearches,
} from "@/lib/house-search/savedHouseSearches";
import type { HouseSearchResult } from "@/lib/house-search/types";

export const runtime = "nodejs";

/**
 * GET  /api/dashboard/house-search/saved?contactId=...  — list saved searches
 *      (all the agent's, or scoped to one contact), each with a latest-run summary.
 * POST /api/dashboard/house-search/saved                — save a search + its first run.
 *      Body: { contactId, name, query, refinements?, result }
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const contactId = new URL(req.url).searchParams.get("contactId") ?? undefined;
    const searches = await listSavedHouseSearches(String(agentId), { contactId: contactId || undefined });
    return NextResponse.json({ ok: true, searches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as {
      contactId?: unknown;
      name?: unknown;
      query?: unknown;
      refinements?: unknown;
      result?: unknown;
    };
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const name = typeof body.name === "string" ? body.name : "";
    const query = typeof body.query === "string" ? body.query : "";
    const refinements = Array.isArray(body.refinements)
      ? body.refinements.filter((r): r is string => typeof r === "string")
      : [];
    if (!contactId || !name.trim() || !query.trim() || !body.result) {
      return NextResponse.json(
        { ok: false, error: "contactId, name, query, and result are required." },
        { status: 400 },
      );
    }
    const search = await createSavedHouseSearch(String(agentId), {
      contactId,
      name,
      query,
      refinements,
      result: body.result as HouseSearchResult,
    });
    return NextResponse.json({ ok: true, search });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = /belong|required|not found/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
