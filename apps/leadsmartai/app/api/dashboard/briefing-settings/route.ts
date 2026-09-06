import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidTimezone, safeAccountTimezone } from "@/lib/agent/timezone";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/briefing-settings
 * PATCH /api/dashboard/briefing-settings
 *
 * Per-agent schedule for the morning + evening briefings shipped in
 * #238. Each agent picks their own clock time (HH:MM) and IANA
 * timezone; the cron is a single tick that branches off these
 * preferences. Defaults match the migration: 07:00 / 18:00 /
 * America/Los_Angeles.
 */

const HHMM_RE = /^[0-2][0-9]:[0-5][0-9]$/;

type SettingsRow = {
  briefing_morning_time: string;
  briefing_evening_time: string;
  briefing_timezone: string;
};

export async function GET() {
  let ctx;
  try {
    ctx = await getCurrentAgentContext();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("briefing_morning_time, briefing_evening_time, timezone, briefing_timezone")
    .eq("id", ctx.agentId)
    .maybeSingle();
  if (error) {
    console.error("[briefing-settings] get", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  const raw = data as (SettingsRow & { timezone?: string | null }) | null;
  /*
   * The response keeps calling it briefing_timezone.
   *
   * That is the field the settings card posts and renders, and renaming the
   * wire format at the same time as the column would mean an old bundle and a
   * new server disagreeing about the payload during a rollout. The COLUMN is
   * consolidated now; the field name follows when the control moves to General
   * settings.
   */
  const row: SettingsRow = {
    briefing_morning_time: raw?.briefing_morning_time ?? "07:00",
    briefing_evening_time: raw?.briefing_evening_time ?? "18:00",
    briefing_timezone: safeAccountTimezone(raw?.timezone ?? raw?.briefing_timezone),
  };
  return NextResponse.json({ ok: true, settings: row });
}

export async function PATCH(req: Request) {
  let ctx;
  try {
    ctx = await getCurrentAgentContext();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Partial<SettingsRow>;
  try {
    body = (await req.json()) as Partial<SettingsRow>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // Includes `timezone`, which is not part of the WIRE shape (SettingsRow) —
  // it is the column being written alongside the legacy one.
  const update: Partial<SettingsRow> & { timezone?: string } = {};
  if (body.briefing_morning_time !== undefined) {
    const v = String(body.briefing_morning_time).trim();
    if (!HHMM_RE.test(v)) {
      return NextResponse.json(
        { ok: false, error: "Morning time must be HH:MM (24-hour)." },
        { status: 400 },
      );
    }
    update.briefing_morning_time = v;
  }
  if (body.briefing_evening_time !== undefined) {
    const v = String(body.briefing_evening_time).trim();
    if (!HHMM_RE.test(v)) {
      return NextResponse.json(
        { ok: false, error: "Evening time must be HH:MM (24-hour)." },
        { status: 400 },
      );
    }
    update.briefing_evening_time = v;
  }
  if (body.briefing_timezone !== undefined) {
    const v = String(body.briefing_timezone).trim();
    if (!isValidTimezone(v)) {
      return NextResponse.json(
        { ok: false, error: "Unknown IANA timezone." },
        { status: 400 },
      );
    }
    // Both columns while the old one still exists. agents.timezone is the
    // source of truth; briefing_timezone is written so any deployed bundle
    // still reading it sees the same answer until it is dropped.
    update.timezone = v;
    update.briefing_timezone = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No fields to update." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .update(update)
    .eq("id", ctx.agentId)
    .select("briefing_morning_time, briefing_evening_time, timezone, briefing_timezone")
    .single();
  if (error) {
    console.error("[briefing-settings] patch", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, settings: data });
}

