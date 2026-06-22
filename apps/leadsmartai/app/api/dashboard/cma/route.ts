import { NextResponse } from "next/server";

import {
  createCmaForAgent,
  isCreateCmaFailure,
  listCmasForAgent,
  type CreateCmaInput,
} from "@/lib/cma/service";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { normalizeAddress } from "@/lib/cma/normalizeAddress";

export const runtime = "nodejs";
// AI CMA generation runs a live web-search loop — give it room.
export const maxDuration = 300;

/**
 * GET   — list this agent's CMA reports (denormalized fields only).
 * POST  — generate + persist a new CMA via the upstream smart-cma engine.
 *
 * Auth: getCurrentAgentContext throws if the user isn't authed or has no
 * agent row, so we don't need to gate explicitly here. RLS on cma_reports
 * enforces ownership at the DB layer too.
 */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const cmas = await listCmasForAgent(String(agentId));
    return NextResponse.json({ ok: true, cmas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId, userId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as {
      subjectAddress?: unknown;
      contactId?: unknown;
      title?: unknown;
      notes?: unknown;
      beds?: unknown;
      baths?: unknown;
      sqft?: unknown;
      yearBuilt?: unknown;
      condition?: unknown;
    };

    const subjectAddress =
      typeof body.subjectAddress === "string" ? normalizeAddress(body.subjectAddress) : "";
    if (!subjectAddress) {
      return NextResponse.json(
        { ok: false, error: "subjectAddress is required." },
        { status: 400 },
      );
    }

    const input: CreateCmaInput = {
      agentId: String(agentId),
      userId: String(userId),
      subjectAddress,
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      title: typeof body.title === "string" ? body.title : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      beds: numberOrUndef(body.beds),
      baths: numberOrUndef(body.baths),
      sqft: numberOrUndef(body.sqft),
      yearBuilt: numberOrUndef(body.yearBuilt),
      condition: typeof body.condition === "string" ? body.condition : undefined,
    };

    const result = await createCmaForAgent(input);
    if (isCreateCmaFailure(result)) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json({ ok: true, cma: result.cma });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function numberOrUndef(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}
