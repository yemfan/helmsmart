import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  deleteSmartList,
  updateSmartList,
  SmartListsUnavailableError,
} from "@/lib/contacts/smart-lists";
import type { ContactFilterConfig } from "@/lib/contacts/types";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: unknown;
      description?: unknown;
      icon?: unknown;
      filterConfig?: unknown;
      sortOrder?: unknown;
      isHidden?: unknown;
    };

    const list = await updateSmartList(agentId, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description:
        typeof body.description === "string" || body.description === null
          ? (body.description as string | null)
          : undefined,
      icon:
        typeof body.icon === "string" || body.icon === null
          ? (body.icon as string | null)
          : undefined,
      filterConfig:
        body.filterConfig && typeof body.filterConfig === "object"
          ? (body.filterConfig as ContactFilterConfig)
          : undefined,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      isHidden: typeof body.isHidden === "boolean" ? body.isHidden : undefined,
    });
    return NextResponse.json({ ok: true, list });
  } catch (e: unknown) {
    // Same contract as POST — see the comment there.
    if (e instanceof SmartListsUnavailableError) {
      console.error("smart-lists/[id] PATCH: table missing — migration not applied");
      return NextResponse.json(
        { ok: false, error: "smart_lists_unavailable" },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("smart-lists/[id] PATCH", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    await deleteSmartList(agentId, id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = /cannot be deleted/i.test(msg) ? 403 : 500;
    console.error("smart-lists/[id] DELETE", e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
