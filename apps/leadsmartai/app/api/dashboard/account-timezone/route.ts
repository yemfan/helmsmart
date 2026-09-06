/**
 * GET / PATCH /api/dashboard/account-timezone
 *
 * The account's one timezone. It used to be edited inside the briefing
 * schedule card and sent as `briefing_timezone`, which is how a value that
 * governs briefings, the overnight run, the receptionist and every booking came
 * to be named after one of them — and why two other places grew their own
 * answer to the same question.
 *
 * Named for what it is, and it moves exactly one column: agents.timezone.
 */

import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidTimezone, safeAccountTimezone } from "@/lib/agent/timezone";

export const runtime = "nodejs";

export async function GET() {
  let ctx;
  try {
    ctx = await getCurrentAgentContext();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("timezone")
    .eq("id", ctx.agentId)
    .maybeSingle();

  if (error) {
    console.error("[account-timezone] get", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // safeAccountTimezone rather than the raw value: an account that has never
  // chosen gets the same default every other caller resolves to, so the picker
  // shows what the system will actually use rather than an empty box.
  return NextResponse.json({
    ok: true,
    timezone: safeAccountTimezone((data as { timezone?: string | null } | null)?.timezone),
  });
}

export async function PATCH(req: Request) {
  let ctx;
  try {
    ctx = await getCurrentAgentContext();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { timezone?: unknown };
  try {
    body = (await req.json()) as { timezone?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const value = String(body.timezone ?? "").trim();
  /*
   * The shared validator, which is stricter than "Intl accepted it".
   *
   * Intl resolves "EST" to America/Panama, which does not observe daylight
   * saving — so an agent typing the obvious three letters would have had the AI
   * booking an hour out for half the year. Region/City or UTC only.
   */
  if (!isValidTimezone(value)) {
    return NextResponse.json(
      { ok: false, error: "Use a Region/City timezone such as America/Los_Angeles." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .update({ timezone: value })
    .eq("id", ctx.agentId)
    .select("timezone");

  // Ask for the row back. An update that matches nothing is not an error, and
  // a settings panel that says "Saved" over an unchanged database is the bug
  // this codebase keeps finding.
  if (error || !data || data.length === 0) {
    console.error("[account-timezone] patch", error ?? "no rows");
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Couldn't save that timezone." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, timezone: value });
}
