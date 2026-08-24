import { NextResponse } from "next/server";

import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
import { clampPostsPerDay } from "@/lib/social/planWeeklySlot";
import { getAvatarState } from "@/lib/agent/avatarStudio";

export const runtime = "nodejs";

/**
 * Mobile counterpart of /api/social/weekly-schedule (web). Bearer-auth in,
 * the same weekly schedule out — reuses the shared weeklySchedule lib so the
 * mobile app and the dashboard read/write the exact same rows.
 */

function normalizeMediaType(v: unknown): MediaType {
  return v === "image" || v === "video" ? v : "text";
}

/** GET — the agent's 7-day weekly schedule + preset + per-media channels. */
export async function GET(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;
  try {
    const [days, avatar] = await Promise.all([
      getWeeklySchedule(auth.ctx.agentId),
      getAvatarState(auth.ctx.agentId).catch(() => null),
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
    const error = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

/** PUT — save the full week. Pro or higher (mirrors the web write). */
export async function PUT(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;
  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("plan_type")
      .eq("id", auth.ctx.agentId)
      .maybeSingle();
    const planType = ((agentRow as { plan_type: string | null } | null)?.plan_type ?? "free").toLowerCase();
    if (planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Scheduling posts requires Pro or higher." },
        { status: 402 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { days?: unknown };
    const raw = Array.isArray(body.days) ? body.days : [];
    const days: WeeklyScheduleDay[] = [];
    for (let wd = 0; wd < 7; wd++) {
      const d = raw.find((x) => (x as { weekday?: number })?.weekday === wd) as Record<string, unknown> | undefined;
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
        postsPerDay: clampPostsPerDay(d?.postsPerDay),
        timeMode: d?.timeMode === "ai" ? "ai" : "fixed",
        topicMode: d?.topicMode === "ai" ? "ai" : "fixed",
      });
    }

    await saveWeeklySchedule(auth.ctx.agentId, days);
    return NextResponse.json({ ok: true, days: await getWeeklySchedule(auth.ctx.agentId) });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Server error";
    console.error("PUT /api/mobile/social/weekly-schedule:", e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
