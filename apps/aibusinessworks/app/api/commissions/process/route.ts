import { NextResponse, type NextRequest } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { processRevenueEvent, processUnprocessedEvents } from "@/lib/ledger";

/**
 * Commission engine entry point for machines.
 *
 * Two callers are expected: a scheduled job that drains the queue of unprocessed
 * revenue events, and an administrator reprocessing a single event. Both are
 * idempotent - the ledger's unique index means a replay creates nothing new.
 *
 * Authorisation is either an administrator session or the CRON_SECRET bearer
 * token, so a scheduler with no session can still run it.
 */
async function authorise(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return { ok: true };

  const admin = await assertAdminForApi();
  if (admin.ok) return { ok: true };
  return { ok: false, status: admin.status, message: admin.message };
}

export async function POST(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  let body: { eventId?: string; limit?: number; force?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means "drain the queue".
  }

  if (body.eventId) {
    const outcome = await processRevenueEvent(body.eventId, { force: Boolean(body.force) });
    return NextResponse.json({ ok: outcome.status !== "error", outcome });
  }

  const limit = Math.min(Math.max(1, body.limit ?? 100), 500);
  const outcomes = await processUnprocessedEvents(limit);

  return NextResponse.json({
    ok: true,
    processed: outcomes.length,
    commissionsCreated: outcomes.reduce((sum, o) => sum + o.created, 0),
    errors: outcomes.filter((o) => o.status === "error"),
  });
}

/** Health check for the scheduler. */
export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }
  return NextResponse.json({ ok: true, message: "POST to this endpoint to run the engine." });
}
