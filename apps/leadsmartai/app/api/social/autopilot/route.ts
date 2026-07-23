import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  CONTENT_CATEGORIES,
  CONTROLLABLE_PLATFORMS,
  getSocialAutopilotConfig,
  updateSocialAutopilotConfig,
} from "@/lib/social/autopilotConfig";

export const runtime = "nodejs";

/**
 * GET  /api/social/autopilot — the agent's full auto-post controller config.
 * PUT  /api/social/autopilot — patch it (only the keys sent are changed).
 *
 * This is the single surface for "what posts, where, how often, and who
 * approves". `/api/social/mode` still exists and writes the same `mode` field;
 * this route is the superset.
 *
 * `null` on any of the which/when fields means "no preference" and restores the
 * engine default, which is how a control gets cleared.
 */

const patchSchema = z
  .object({
    mode: z.enum(["ask", "review", "assisted", "auto"]),
    postsPerWeek: z.number().int().min(1).max(7),
    platforms: z.array(z.enum(CONTROLLABLE_PLATFORMS)).nullable(),
    contentCategories: z.array(z.enum(CONTENT_CATEGORIES)).nullable(),
    includeTimely: z.boolean(),
    postsPerDay: z.number().int().min(1).max(5).nullable(),
    postDays: z.array(z.number().int().min(0).max(6)).nullable(),
    postHourUtc: z.number().int().min(0).max(23).nullable(),
    aiManaged: z.boolean(),
  })
  .partial();

export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const config = await getSocialAutopilotConfig(String(agentId));
    return NextResponse.json({
      ok: true,
      config,
      options: {
        platforms: CONTROLLABLE_PLATFORMS,
        contentCategories: CONTENT_CATEGORIES,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const json = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No settings supplied." },
        { status: 400 },
      );
    }

    await updateSocialAutopilotConfig(String(agentId), parsed.data);
    // Return the stored result so the client renders what actually persisted
    // (empty arrays normalise to null, out-of-range values fall back).
    const config = await getSocialAutopilotConfig(String(agentId));
    return NextResponse.json({ ok: true, config });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
