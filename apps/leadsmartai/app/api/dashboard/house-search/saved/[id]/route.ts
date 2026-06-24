import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  addSavedHouseSearchRun,
  archiveSavedHouseSearch,
  getSavedHouseSearch,
  updateSavedHouseSearch,
} from "@/lib/house-search/savedHouseSearches";
import type { HouseSearchResult } from "@/lib/house-search/types";

export const runtime = "nodejs";

/**
 * GET    /api/dashboard/house-search/saved/[id]  — the saved search + full run history.
 * POST   /api/dashboard/house-search/saved/[id]  — append a run (refine/re-run).
 *        Body: { refinements?, result, trigger? }
 * PATCH  /api/dashboard/house-search/saved/[id]  — update name / auto-run / active.
 * DELETE /api/dashboard/house-search/saved/[id]  — soft-archive.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const data = await getSavedHouseSearch(String(agentId), id);
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      refinements?: unknown;
      result?: unknown;
      trigger?: unknown;
    };
    if (!body.result) {
      return NextResponse.json({ ok: false, error: "result is required." }, { status: 400 });
    }
    const refinements = Array.isArray(body.refinements)
      ? body.refinements.filter((r): r is string => typeof r === "string")
      : [];
    const trigger = body.trigger === "manual" || body.trigger === "auto" ? body.trigger : "refine";
    const run = await addSavedHouseSearchRun(String(agentId), id, {
      refinements,
      result: body.result as HouseSearchResult,
      trigger,
    });
    return NextResponse.json({ ok: true, run });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = /belong|not found/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      isActive?: unknown;
      autoRun?: unknown;
      autoRunFrequency?: unknown;
    };
    const search = await updateSavedHouseSearch(String(agentId), id, {
      name: typeof body.name === "string" ? body.name : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      autoRun: typeof body.autoRun === "boolean" ? body.autoRun : undefined,
      autoRunFrequency:
        typeof body.autoRunFrequency === "string" || body.autoRunFrequency === null
          ? (body.autoRunFrequency as string | null)
          : undefined,
    });
    return NextResponse.json({ ok: true, search });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = /belong|not found|empty/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    await archiveSavedHouseSearch(String(agentId), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = /belong|not found/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
