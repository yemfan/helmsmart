import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TOPIC_PRESETS,
  WEEKLY_TEXT_PLATFORMS,
  getWeeklySchedule,
  saveWeeklySchedule,
  type WeeklyPlatform,
  type WeeklyScheduleDay,
} from "@/lib/weeklySchedule";

export const runtime = "nodejs";

/** GET — the user's 7-day weekly schedule + preset options. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const days = await getWeeklySchedule(user.id);
  return NextResponse.json({
    ok: true,
    days,
    topicPresets: TOPIC_PRESETS,
    platforms: WEEKLY_TEXT_PLATFORMS,
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}

const VALID = new Set<string>(WEEKLY_TEXT_PLATFORMS);

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
    const channelsRaw = Array.isArray(d?.channels) ? (d!.channels as unknown[]) : null;
    const channels = channelsRaw
      ? (channelsRaw.filter((p): p is WeeklyPlatform => typeof p === "string" && VALID.has(p)))
      : null;
    days.push({
      weekday: wd,
      enabled: Boolean(d?.enabled),
      postHour: Number(d?.postHour ?? 9),
      postMinute: Number(d?.postMinute ?? 0),
      timezone: typeof d?.timezone === "string" && d.timezone ? (d.timezone as string) : "America/Los_Angeles",
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
