import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  createOpenHouse,
  createRecurringOpenHouses,
  listOpenHousesForAgent,
  type CreateOpenHouseInput,
} from "@/lib/open-houses/service";
import {
  expandOccurrences,
  type RecurrenceInput,
} from "@/lib/open-houses/expandOccurrences";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/open-houses
 *   List all open houses for the agent (future + past) with per-event
 *   visitor roll-ups.
 *
 * POST /api/dashboard/open-houses
 *   Create a scheduled open house. Returns the row including signin_slug
 *   so the client can build the public URL + QR code.
 *
 * The legacy analytics endpoint (contact-source rollups) moved to
 * /api/dashboard/open-houses/stats. The UI still calls both.
 */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const openHouses = await listOpenHousesForAgent(String(agentId));
    return NextResponse.json({ ok: true, openHouses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/open-houses:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type RecurringBody = Omit<CreateOpenHouseInput, "startAt" | "endAt"> & {
  recurrence: RecurrenceInput;
};

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as
      | Partial<CreateOpenHouseInput>
      | Partial<RecurringBody>;

    if (!body.propertyAddress) {
      return NextResponse.json(
        { ok: false, error: "propertyAddress is required." },
        { status: 400 },
      );
    }

    // Recurring path — expand, then batch-create.
    if ("recurrence" in body && body.recurrence) {
      const occurrences = expandOccurrences(body.recurrence);
      if (!occurrences.length) {
        return NextResponse.json(
          { ok: false, error: "Recurrence produced no valid occurrences." },
          { status: 400 },
        );
      }
      const created = await createRecurringOpenHouses({
        agentId: String(agentId),
        propertyAddress: String(body.propertyAddress),
        transactionId: body.transactionId ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        mlsNumber: body.mlsNumber ?? null,
        mlsUrl: body.mlsUrl ?? null,
        listPrice: body.listPrice ?? null,
        hostNotes: body.hostNotes ?? null,
        ownerName: body.ownerName ?? null,
        ownerEmail: body.ownerEmail ?? null,
        requestingAgentName: body.requestingAgentName ?? null,
        requestingAgentEmail: body.requestingAgentEmail ?? null,
        occurrences,
      });
      return NextResponse.json({
        ok: true,
        openHouses: created,
        recurring: true,
        count: created.length,
      });
    }

    // One-off path (existing behavior)
    const { startAt, endAt } = body as Partial<CreateOpenHouseInput>;
    if (!startAt || !endAt) {
      return NextResponse.json(
        { ok: false, error: "startAt and endAt are required." },
        { status: 400 },
      );
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json(
        { ok: false, error: "endAt must be after startAt." },
        { status: 400 },
      );
    }

    const created = await createOpenHouse({
      agentId: String(agentId),
      propertyAddress: String(body.propertyAddress),
      startAt: String(startAt),
      endAt: String(endAt),
      transactionId: body.transactionId ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      mlsNumber: body.mlsNumber ?? null,
      mlsUrl: body.mlsUrl ?? null,
      listPrice: body.listPrice ?? null,
      hostNotes: body.hostNotes ?? null,
      ownerName: body.ownerName ?? null,
      ownerEmail: body.ownerEmail ?? null,
      requestingAgentName: body.requestingAgentName ?? null,
      requestingAgentEmail: body.requestingAgentEmail ?? null,
    });
    return NextResponse.json({ ok: true, openHouse: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/open-houses:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
