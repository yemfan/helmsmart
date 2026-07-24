/**
 * GET/PUT /api/social/autopilot - the org's social autopilot settings.
 *
 * Cookie-derived org + RLS client, matching the other /api routes (e.g.
 * sms/auto-pilot). PUT patches only the keys sent, so one control can be saved
 * without clobbering the rest. NULL on a which/when field means "no preference".
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  AUTOPILOT_PLATFORMS,
  DEFAULT_AUTOPILOT_SETTINGS,
  normalizeSettings,
} from "@/lib/social-autopilot";

const SELECT_COLUMNS =
  "enabled, mode, posts_per_week, posts_per_day, platforms, post_days, post_hour_utc, tone, day_topics";

const patchSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["review", "auto"]),
    postsPerWeek: z.number().int().min(1).max(7),
    postsPerDay: z.number().int().min(1).max(5).nullable(),
    platforms: z.array(z.enum(AUTOPILOT_PLATFORMS)).nullable(),
    postDays: z.array(z.number().int().min(0).max(6)).nullable(),
    postHourUtc: z.number().int().min(0).max(23).nullable(),
    tone: z.enum(["professional", "casual", "witty", "promotional", "educational"]),
    // weekday ("0".."6") -> topic string. Values trimmed + capped server-side.
    dayTopics: z.record(z.string(), z.string().max(120)),
  })
  .partial();

// camelCase (API) -> snake_case (column).
const COLUMN: Record<string, string> = {
  enabled: "enabled",
  mode: "mode",
  postsPerWeek: "posts_per_week",
  postsPerDay: "posts_per_day",
  platforms: "platforms",
  postDays: "post_days",
  postHourUtc: "post_hour_utc",
  tone: "tone",
  dayTopics: "day_topics",
};

/** Keep only valid weekday keys with non-empty, capped topic values. */
function sanitizeDayTopics(v: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const dow = Number(k);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    const s = (val ?? "").trim().slice(0, 120);
    if (s) out[String(dow)] = s;
  }
  return out;
}

async function getOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("helmsmart-org-id")?.value ?? null;
}

export async function GET() {
  const orgId = await getOrgId();
  if (!orgId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("org_social_autopilot")
    .select(SELECT_COLUMNS)
    .eq("organization_id", orgId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    settings: normalizeSettings(data ?? null),
    options: { platforms: AUTOPILOT_PLATFORMS },
    defaults: DEFAULT_AUTOPILOT_SETTINGS,
  });
}

export async function PUT(req: Request) {
  const orgId = await getOrgId();
  if (!orgId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: "No settings supplied." }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    organization_id: orgId,
    updated_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(parsed.data)) {
    row[COLUMN[key]] =
      key === "dayTopics"
        ? sanitizeDayTopics(value as Record<string, string>)
        : value;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_social_autopilot")
    .upsert(row, { onConflict: "organization_id" });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data } = await supabase
    .from("org_social_autopilot")
    .select(SELECT_COLUMNS)
    .eq("organization_id", orgId)
    .maybeSingle();

  return NextResponse.json({ ok: true, settings: normalizeSettings(data ?? null) });
}
