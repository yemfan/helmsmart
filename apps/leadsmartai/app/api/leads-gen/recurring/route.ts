import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { computeNextOccurrence } from "@/lib/leads-gen/recurrence";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin", "threads"]),
  connectionId: z.string().uuid(),
  caption: z.string().min(1).max(5_000),
  hashtags: z.array(z.string()).max(40).optional(),
  mediaItemId: z.string().uuid().optional(),
  trigger: z.string().max(64).optional(),
  subjectKind: z.string().max(64).optional(),
  subjectRefId: z.string().max(255).optional(),

  cadence: z.enum(["daily", "weekly"]),
  /** 0=Sun..6=Sat. Required when cadence='weekly'. */
  weeklyDayOfWeek: z.number().int().min(0).max(6).optional(),
  timeOfDayHour: z.number().int().min(0).max(23),
  timeOfDayMinute: z.number().int().min(0).max(59),
  /** IANA timezone identifier — e.g. 'America/Los_Angeles'. */
  timezone: z.string().min(1).max(64),

  /** ISO timestamp. Defaults to now. */
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  maxOccurrences: z.number().int().positive().max(365).optional(),
});

/**
 * POST /api/leads-gen/recurring
 *
 * Creates a recurring post schedule. Validates the connection
 * ownership + the cadence config, computes the first
 * next_occurrence_at via lib/leads-gen/recurrence, and inserts the
 * row. The cron at /api/cron/materialize-recurring-posts picks it
 * up from there.
 *
 * Plan gate: Pro+ (same as Schedule).
 *
 * The first occurrence may fire as soon as ~5 min after creation
 * (next materialize-cron tick can be up to 15 min, then the
 * publish-scheduled cron runs every 5 min). Recommend the wizard
 * surface a minimum 30-minute lead time in the UI.
 */
export async function POST(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Recurring posts require Pro or higher." },
        { status: 402 },
      );
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.cadence === "weekly" && parsed.data.weeklyDayOfWeek === undefined) {
      return NextResponse.json(
        { ok: false, error: "weeklyDayOfWeek is required for weekly cadence." },
        { status: 400 },
      );
    }

    // Ownership + platform alignment check — same shape as /schedule.
    const { data: connRow, error: connErr } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "id, platform, fb_page_id, ig_business_user_id, linkedin_member_urn, status",
      )
      .eq("id", parsed.data.connectionId)
      .eq("agent_id", auth.agentId)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!connRow) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 },
      );
    }
    const conn = connRow as {
      platform: string;
      fb_page_id: string | null;
      ig_business_user_id: string | null;
      linkedin_member_urn: string | null;
      status: string;
    };
    const wantsMeta =
      parsed.data.platform === "facebook" || parsed.data.platform === "instagram";
    if (wantsMeta && conn.platform !== "meta") {
      return NextResponse.json(
        { ok: false, error: "Connection is not a Meta connection." },
        { status: 422 },
      );
    }
    if (parsed.data.platform === "linkedin" && conn.platform !== "linkedin") {
      return NextResponse.json(
        { ok: false, error: "Connection is not a LinkedIn connection." },
        { status: 422 },
      );
    }
    if (parsed.data.platform === "instagram" && !conn.ig_business_user_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This Page has no linked Instagram Business account. Link one in Facebook first.",
        },
        { status: 422 },
      );
    }
    if (parsed.data.platform === "instagram" && !parsed.data.mediaItemId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Instagram recurring posts require an image. Attach one first.",
        },
        { status: 422 },
      );
    }

    // Validate timezone — bogus tz strings would silently route to UTC
    // in Intl, so we do an explicit check via a dummy formatter.
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: parsed.data.timezone });
    } catch {
      return NextResponse.json(
        { ok: false, error: `Unknown timezone: ${parsed.data.timezone}` },
        { status: 400 },
      );
    }

    // Compute the first occurrence from "now" (or startsAt if in
    // future). The cron materializes from next_occurrence_at, so
    // this seeds the firing schedule.
    const startsAt = parsed.data.startsAt ?? new Date().toISOString();
    const seedFrom = new Date(
      Math.max(Date.now(), new Date(startsAt).getTime() - 1),
    );
    let firstOccurrence: Date;
    try {
      firstOccurrence = computeNextOccurrence(
        {
          cadence: parsed.data.cadence,
          weeklyDayOfWeek: parsed.data.weeklyDayOfWeek ?? null,
          timeOfDayHour: parsed.data.timeOfDayHour,
          timeOfDayMinute: parsed.data.timeOfDayMinute,
          timezone: parsed.data.timezone,
        },
        seedFrom,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid recurrence config";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    // Bound by endsAt — if the first occurrence is already past the
    // end, the recurrence would do nothing. Reject up front rather
    // than create a dead row.
    if (parsed.data.endsAt && firstOccurrence.getTime() > new Date(parsed.data.endsAt).getTime()) {
      return NextResponse.json(
        {
          ok: false,
          error: "First occurrence is after the end date — nothing would post.",
        },
        { status: 422 },
      );
    }

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("recurring_post_schedules")
      .insert({
        agent_id: auth.agentId,
        social_account_id: parsed.data.connectionId,
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags ?? [],
        media_library_id: parsed.data.mediaItemId ?? null,
        trigger_kind: parsed.data.trigger ?? null,
        subject_kind: parsed.data.subjectKind ?? null,
        subject_ref_id: parsed.data.subjectRefId ?? null,
        cadence: parsed.data.cadence,
        weekly_day_of_week: parsed.data.weeklyDayOfWeek ?? null,
        time_of_day_hour: parsed.data.timeOfDayHour,
        time_of_day_minute: parsed.data.timeOfDayMinute,
        timezone: parsed.data.timezone,
        starts_at: startsAt,
        ends_at: parsed.data.endsAt ?? null,
        max_occurrences: parsed.data.maxOccurrences ?? null,
        next_occurrence_at: firstOccurrence.toISOString(),
        status: "active",
        created_by: auth.userId,
      } as Record<string, unknown>)
      .select("id, next_occurrence_at, status")
      .single();
    if (insertErr) throw insertErr;

    const out = row as {
      id: string;
      next_occurrence_at: string;
      status: string;
    };
    return NextResponse.json({
      ok: true,
      recurringScheduleId: out.id,
      nextOccurrenceAt: out.next_occurrence_at,
      status: out.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Recurring create failed";
    console.error("[leads-gen/recurring]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
