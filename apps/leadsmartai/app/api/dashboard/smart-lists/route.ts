import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  createSmartList,
  listSmartLists,
  SmartListsUnavailableError,
} from "@/lib/contacts/smart-lists";
import type { ContactFilterConfig } from "@/lib/contacts/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const lists = await listSmartLists(agentId);
    return NextResponse.json({ ok: true, lists });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json()) as {
      name?: unknown;
      description?: unknown;
      icon?: unknown;
      filterConfig?: unknown;
      sortOrder?: unknown;
    };

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "name required" },
        { status: 400 },
      );
    }

    const list = await createSmartList(agentId, {
      name: body.name,
      description: typeof body.description === "string" ? body.description : null,
      icon: typeof body.icon === "string" ? body.icon : null,
      filterConfig:
        body.filterConfig && typeof body.filterConfig === "object"
          ? (body.filterConfig as ContactFilterConfig)
          : {},
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    });
    return NextResponse.json({ ok: true, list });
  } catch (e: unknown) {
    // A machine code, not prose. The client turns it into a translated
    // sentence; a raw driver message is neither in the reader's language nor
    // about anything they can act on.
    if (e instanceof SmartListsUnavailableError) {
      console.error("smart-lists POST: table missing — migration not applied");
      return NextResponse.json(
        { ok: false, error: "smart_lists_unavailable" },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("smart-lists POST", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
