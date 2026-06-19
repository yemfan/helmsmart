import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  getAgentForwardingInfo,
  getOrInitSettings,
  toUsDisplayPhone,
  updateSettings,
} from "@/lib/missed-call/service";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/missed-call/settings
 *
 * Returns the agent's missed-call settings + their current
 * forwarding_phone (which lives on `agents`, not the settings row,
 * because other voice features will share it).
 *
 * PUT /api/dashboard/missed-call/settings
 *   Body: {
 *     enabled?, ring_timeout_seconds?, message_template?,
 *     use_ai_personalization?, forwarding_phone?
 *   }
 *
 * forwarding_phone is normalized to (xxx) xxx-xxxx before write.
 * If `enabled` is being set to true and forwarding_phone is empty
 * (both before and in the patch), we reject with a 400 — there's
 * no point enabling the feature without a number to forward to.
 */
export async function GET() {
  let agentId: string;
  try {
    const ctx = await getCurrentAgentContext();
    agentId = ctx.agentId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: msg === "Not authenticated" ? 401 : 500 },
    );
  }

  const [settings, agentInfo] = await Promise.all([
    getOrInitSettings(agentId),
    getAgentForwardingInfo(agentId),
  ]);

  return NextResponse.json({
    ok: true,
    settings,
    forwarding_phone: agentInfo?.forwarding_phone ?? null,
  });
}

export async function PUT(req: Request) {
  let agentId: string;
  try {
    const ctx = await getCurrentAgentContext();
    agentId = ctx.agentId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: msg === "Not authenticated" ? 401 : 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: unknown;
    ring_timeout_seconds?: unknown;
    message_template?: unknown;
    use_ai_personalization?: unknown;
    forwarding_phone?: unknown;
    callback_enabled?: unknown;
    callback_interval_minutes?: unknown;
    callback_max_per_day?: unknown;
    callback_max_days?: unknown;
  };

  // Validate + normalize forwarding_phone first — we may need to
  // reject the enabled toggle below.
  let normalizedForwarding: string | null | undefined = undefined;
  if ("forwarding_phone" in body) {
    if (body.forwarding_phone === null || body.forwarding_phone === "") {
      normalizedForwarding = null;
    } else if (typeof body.forwarding_phone === "string") {
      const norm = toUsDisplayPhone(body.forwarding_phone);
      if (!norm) {
        return NextResponse.json(
          {
            ok: false,
            error: "forwarding_phone must be a valid US number (10 digits).",
            code: "invalid_phone",
          },
          { status: 400 },
        );
      }
      normalizedForwarding = norm;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "forwarding_phone must be a string or null.",
          code: "invalid_phone",
        },
        { status: 400 },
      );
    }
  }

  // If turning on the feature, require a forwarding number to be
  // present (either in the patch or already on the agent row).
  if (body.enabled === true) {
    let willHavePhone = normalizedForwarding;
    if (willHavePhone === undefined) {
      const existing = await getAgentForwardingInfo(agentId);
      willHavePhone = existing?.forwarding_phone ?? null;
    }
    if (!willHavePhone) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Add your personal mobile number first, then enable missed-call text-back.",
          code: "missing_forwarding_phone",
        },
        { status: 400 },
      );
    }
  }

  // Persist forwarding_phone to agents.
  if (normalizedForwarding !== undefined) {
    const { error: agentErr } = await supabaseAdmin
      .from("agents")
      .update({ forwarding_phone: normalizedForwarding })
      .eq("id", agentId);
    if (agentErr) {
      console.error("[missed-call settings] update agents:", agentErr.message);
      return NextResponse.json(
        { ok: false, error: agentErr.message, code: "agents_update_failed" },
        { status: 500 },
      );
    }
  }

  // Persist settings row (only the fields actually present in body).
  const settingsPatch: Parameters<typeof updateSettings>[1] = {};
  if (typeof body.enabled === "boolean") settingsPatch.enabled = body.enabled;
  if (typeof body.ring_timeout_seconds === "number") {
    settingsPatch.ring_timeout_seconds = body.ring_timeout_seconds;
  }
  if (typeof body.message_template === "string") {
    settingsPatch.message_template = body.message_template;
  }
  if (typeof body.use_ai_personalization === "boolean") {
    settingsPatch.use_ai_personalization = body.use_ai_personalization;
  }
  if (typeof body.callback_enabled === "boolean") {
    settingsPatch.callback_enabled = body.callback_enabled;
  }
  if (typeof body.callback_interval_minutes === "number") {
    settingsPatch.callback_interval_minutes = body.callback_interval_minutes;
  }
  if (typeof body.callback_max_per_day === "number") {
    settingsPatch.callback_max_per_day = body.callback_max_per_day;
  }
  if (typeof body.callback_max_days === "number") {
    settingsPatch.callback_max_days = body.callback_max_days;
  }

  let settings = await getOrInitSettings(agentId);
  if (Object.keys(settingsPatch).length > 0) {
    const res = await updateSettings(agentId, settingsPatch);
    if (res.ok === false) {
      return NextResponse.json(
        { ok: false, error: res.error },
        { status: 400 },
      );
    }
    settings = res.settings;
  }

  const agentInfo = await getAgentForwardingInfo(agentId);
  return NextResponse.json({
    ok: true,
    settings,
    forwarding_phone: agentInfo?.forwarding_phone ?? null,
  });
}
