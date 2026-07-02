import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import {
  AUTOPILOT_CHANNELS,
  getAutopilotMatrix,
  getGlobalAutopilot,
  setAutopilotCell,
  setGlobalAutopilot,
  type AutopilotMode,
} from "@/lib/realtyboss/autopilot";
import type { BossAssignee, BossChannel } from "@/lib/realtyboss/actions/registry";

export const runtime = "nodejs";

/**
 * Boss Assistant autopilot settings.
 *
 *   GET   → { global: boolean, channels: {assignee, channels[]}, cells: [...] }
 *   PATCH { global: boolean }                         → flip the master switch
 *   PATCH { assignee, channel, mode: "ask"|"auto" }   → set one per-channel cell
 *   PATCH { pauseAll: true }                          → global off + every cell "ask"
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const [global, cells] = await Promise.all([
      getGlobalAutopilot(agentId),
      getAutopilotMatrix(agentId),
    ]);
    const channels = Object.entries(AUTOPILOT_CHANNELS).map(([assignee, chs]) => ({
      assignee,
      channels: chs,
    }));
    return NextResponse.json({ ok: true, global, channels, cells });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

const ASSIGNEES = Object.keys(AUTOPILOT_CHANNELS) as BossAssignee[];

export async function PATCH(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      global?: unknown;
      assignee?: unknown;
      channel?: unknown;
      mode?: unknown;
      pauseAll?: unknown;
    };

    // One-tap "pause all autonomy": master switch off AND every per-channel
    // cell pinned to ask, so no stale "auto" override can keep sending.
    if (body.pauseAll === true) {
      await setGlobalAutopilot(agentId, false);
      for (const a of ASSIGNEES) {
        for (const ch of AUTOPILOT_CHANNELS[a] ?? []) {
          await setAutopilotCell(agentId, a, ch, "ask");
        }
      }
      return NextResponse.json({ ok: true, paused: true });
    }

    if (typeof body.global === "boolean") {
      await setGlobalAutopilot(agentId, body.global);
      return NextResponse.json({ ok: true, global: body.global });
    }

    const assignee = body.assignee as BossAssignee;
    const channel = body.channel as BossChannel;
    const mode = body.mode as AutopilotMode;
    if (
      !ASSIGNEES.includes(assignee) ||
      !(AUTOPILOT_CHANNELS[assignee] ?? []).includes(channel) ||
      (mode !== "ask" && mode !== "auto")
    ) {
      return NextResponse.json({ ok: false, error: "Invalid setting." }, { status: 400 });
    }
    await setAutopilotCell(agentId, assignee, channel, mode);
    return NextResponse.json({ ok: true, assignee, channel, mode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
