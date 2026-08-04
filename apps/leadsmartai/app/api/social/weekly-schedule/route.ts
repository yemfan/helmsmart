import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import {
  IMAGE_PLATFORMS,
  TEXT_PLATFORMS,
  TOPIC_PRESETS,
  VIDEO_PLATFORMS,
  getWeeklySchedule,
  platformsForMedia,
  saveWeeklySchedule,
  weeklyScheduleConfigured,
  type MediaType,
  type WeeklyPlatform,
  type WeeklyScheduleDay,
} from "@/lib/social/weeklySchedule";
import { getAvatarState } from "@/lib/agent/avatarStudio";

export const runtime = "nodejs";

/** GET — the agent's 7-day weekly schedule + the preset options. */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const [days, avatar] = await Promise.all([
      getWeeklySchedule(auth.agentId),
      getAvatarState(auth.agentId).catch(() => null),
    ]);
    const videoReady = Boolean(avatar?.configured && avatar?.hasIntroVideo && avatar?.voiceReady);
    return NextResponse.json({
      ok: true,
      configured: weeklyScheduleConfigured(),
      days,
      topicPresets: TOPIC_PRESETS,
      platformsByMedia: { text: TEXT_PLATFORMS, image: IMAGE_PLATFORMS, video: VIDEO_PLATFORMS },
      videoReady,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function normalizeMediaType(v: unknown): MediaType {
  return v === "image" || v === "video" ? v : "text";
}

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
      const mediaType = normalizeMediaType(d?.mediaType);
      const allowed = new Set<string>(platformsForMedia(mediaType));
      const platformsRaw = Array.isArray(d?.platforms) ? (d!.platforms as unknown[]) : null;
      const platforms = platformsRaw
        ? (platformsRaw.filter((p): p is WeeklyPlatform => typeof p === "string" && allowed.has(p)))
        : null;
      days.push({
        weekday: wd,
        enabled: Boolean(d?.enabled),
        postHour: Number(d?.postHour ?? 9),
        postMinute: Number(d?.postMinute ?? 0),
        timezone: typeof d?.timezone === "string" && d.timezone ? (d.timezone as string) : "America/Los_Angeles",
        mediaType,
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
