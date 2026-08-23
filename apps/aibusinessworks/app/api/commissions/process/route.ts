import { NextResponse, type NextRequest } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import {
  countUnprocessedEvents,
  processRevenueEvent,
  processUnprocessedEvents,
} from "@/lib/ledger";

/**
 * Commission engine entry point for machines.
 *
 * Three callers are expected: the Vercel cron draining the queue on a schedule,
 * an administrator draining it or reprocessing a single event, and a future
 * billing webhook. All are idempotent - the ledger's unique index means a replay
 * creates nothing new.
 *
 * Authorisation is either the CRON_SECRET bearer token or an administrator
 * session, so a scheduler with no session can still run it.
 */

type Auth =
  | { ok: true; via: "cron" | "admin" }
  | { ok: false; status: number; message: string };

async function authorise(request: NextRequest): Promise<Auth> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return { ok: true, via: "cron" };

  const admin = await assertAdminForApi();
  if (admin.ok) return { ok: true, via: "admin" };
  return { ok: false, status: admin.status, message: admin.message };
}

async function drain(limit: number) {
  const outcomes = await processUnprocessedEvents(limit);
  return {
    ok: true,
    processed: outcomes.length,
    commissionsCreated: outcomes.reduce((sum, o) => sum + o.created, 0),
    errors: outcomes.filter((o) => o.status === "error"),
  };
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

  return NextResponse.json(await drain(Math.min(Math.max(1, body.limit ?? 100), 500)));
}

/**
 * GET is the scheduled run.
 *
 * Vercel cron jobs issue a GET carrying `Authorization: Bearer $CRON_SECRET`,
 * so the scheduled path has to be here - a GET that only described how to use
 * the endpoint would return 200 on every tick and silently never calculate a
 * commission.
 *
 * An administrator opening this in a browser has no bearer token and gets queue
 * status instead, so a stray GET never mutates the ledger by accident. To run
 * the engine by hand, POST (or use the Run engine button in /admin/commissions).
 */
export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  if (auth.via === "cron") {
    return NextResponse.json({ ...(await drain(500)), trigger: "cron" });
  }

  return NextResponse.json({
    ok: true,
    unprocessedEvents: await countUnprocessedEvents(),
    message:
      "Queue status only. The scheduled run is a GET authorised with CRON_SECRET; POST to this endpoint to run the engine now.",
  });
}
