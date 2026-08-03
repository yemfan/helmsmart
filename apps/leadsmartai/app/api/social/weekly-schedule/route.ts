import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import {
  TOPIC_PRESETS,
  WEEKLY_TEXT_PLATFORMS,
  getWeeklySchedule,
  saveWeeklySchedule,
  weeklyScheduleConfigured,
  type WeeklyPlatform,
  type WeeklyScheduleDay,
} from "@/lib/social/weeklySchedule";

export const runtime = "nodejs";

/** GET — the agent's 7-day weekly schedule + the preset options. */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const days = await getWeeklySchedule(auth.agentId);
    return NextResponse.json({
      ok: true,
      configured: weeklyScheduleConfigured(),
      days,
      topicPresets: TOPIC_PRESETS,
      platforms: WEEKLY_TEXT_PLATFORMS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

const VALID_PLATFORMS = new Set<string>(WEEKLY_TEXT_PLATFORMS);

/** PUT — save the full week. Pro or higher (mirrors the other autopilot writes). */
export async function PUT(req: Request) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Scheduling posts requires Pro or higher." },
        { status: 402 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { days?: unknown };
    const raw = Array.isArray(body.days) ? body.days : [];
    const days: WeeklyScheduleDay[] = [];
    for (let wd = 0; wd < 7; wd++) {
      const d = raw.find((x) => (x as { weekday?: number })?.weekday === wd) as
        | Record<string, unknown>
        | undefined;
      const platformsRaw = Array.isArray(d?.platforms) ? (d!.platforms as unknown[]) : null;
      const platforms = platformsRaw
        ? (platformsRaw.filter((p): p is WeeklyPlatform => typeof p === "string" && VALID_PLATFORMS.has(p)))
        : null;
      days.push({
        weekday: wd,
        enabled: Boolean(d?.enabled),
        postHour: Number(d?.postHour ?? 9),
        postMinute: Number(d?.postMinute ?? 0),
        timezone: typeof d?.timezone === "string" && d.timezone ? (d.timezone as string) : "America/Los_Angeles",
        platforms: platforms && platforms.length ? platforms : null,
        topic: typeof d?.topic === "string" ? (d.topic as string) : "",
      });
    }

    await saveWeeklySchedule(auth.agentId, days);
    return NextResponse.json({ ok: true, days: await getWeeklySchedule(auth.agentId) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("PUT /api/social/weekly-schedule:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
