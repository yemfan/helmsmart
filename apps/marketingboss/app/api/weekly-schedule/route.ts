import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  IMAGE_PLATFORMS,
  TEXT_PLATFORMS,
  TOPIC_PRESETS,
  VIDEO_PLATFORMS,
  getWeeklySchedule,
  platformsForMedia,
  saveWeeklySchedule,
  type MediaType,
  type WeeklyPlatform,
  type WeeklyScheduleDay,
} from "@/lib/weeklySchedule";
import { getConnectionStatuses } from "@/lib/social";

export const runtime = "nodejs";

const ALL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "youtube", "tiktok"];

/** GET — the user's 7-day weekly schedule + preset options + per-type channels. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const [days, statuses] = await Promise.all([
    getWeeklySchedule(user.id),
    getConnectionStatuses(user.id, ALL_PLATFORMS),
  ]);
  const connected = ALL_PLATFORMS.filter((p) => statuses[p]?.connected);
  return NextResponse.json({
    ok: true,
    days,
    connected,
    topicPresets: TOPIC_PRESETS,
    platformsByMedia: { text: TEXT_PLATFORMS, image: IMAGE_PLATFORMS, video: VIDEO_PLATFORMS },
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}

function normalizeMediaType(v: unknown): MediaType {
  return v === "image" || v === "video" ? v : "text";
}

/** PUT — save the full week. */
export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: { days?: unknown };
  try {
    body = (await req.json()) as { days?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = Array.isArray(body.days) ? body.days : [];
  const days: WeeklyScheduleDay[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const d = raw.find((x) => (x as { weekday?: number })?.weekday === wd) as Record<string, unknown> | undefined;
    const mediaType = normalizeMediaType(d?.mediaType);
    const allowed = new Set<string>(platformsForMedia(mediaType));
    const channelsRaw = Array.isArray(d?.channels) ? (d!.channels as unknown[]) : null;
    const channels = channelsRaw
      ? (channelsRaw.filter((p): p is WeeklyPlatform => typeof p === "string" && allowed.has(p)))
      : null;
    days.push({
      weekday: wd,
      enabled: Boolean(d?.enabled),
      postHour: Number(d?.postHour ?? 9),
      postMinute: Number(d?.postMinute ?? 0),
      timezone: typeof d?.timezone === "string" && d.timezone ? (d.timezone as string) : "America/Los_Angeles",
      mediaType,
      channels: channels && channels.length ? channels : null,
      topic: typeof d?.topic === "string" ? (d.topic as string) : "",
    });
  }

  try {
    await saveWeeklySchedule(user.id, days);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, days: await getWeeklySchedule(user.id) });
}
