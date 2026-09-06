import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createDailyBriefingForAgent } from "@/lib/dailyBriefing";
import type { BriefingKind } from "@/lib/dailyBriefingAI";
import { sendEmail } from "@/lib/email";
import { safeAccountTimezone } from "@/lib/agent/timezone";

export const runtime = "nodejs";

type AgentRow = {
  id: string | number;
  briefing_morning_time: string | null;
  briefing_evening_time: string | null;
  timezone: string | null;
};

/**
 * Daily Briefings cron — runs every 15 minutes.
 *
 * For each agent, we compute their CURRENT local time in their
 * configured timezone (default America/Los_Angeles) and compare it
 * to their morning/evening briefing times. If the agent is inside
 * the 15-minute window starting at their target time, we generate
 * the corresponding briefing.
 *
 * Idempotency lives in createDailyBriefingForAgent — one row per
 * (agent_id, kind, UTC day). If the cron fires twice for the same
 * window we just skip the second.
 *
 * The morning briefing also emails a recap (back-compat with the
 * pre-refactor behavior). The evening summary is read-only on the
 * dashboard.
 *
 * Override: pass `?kind=morning|evening&force=1` to generate for
 * every agent regardless of time. Useful for manual smoke tests.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceKind = url.searchParams.get("kind") as BriefingKind | null;
  const force = url.searchParams.get("force") === "1";

  try {
    const { data: agents, error } = await supabaseServer
      .from("agents")
      .select("id, briefing_morning_time, briefing_evening_time, timezone")
      .limit(500);
    if (error) throw error;

    let processed = 0;
    let generated = 0;
    let emailed = 0;
    let skipped = 0;
    let failed = 0;

    for (const a of (agents as AgentRow[] | null) ?? []) {
      processed++;
      const agentId = String(a.id);
      // One default, one validity rule — see lib/agent/timezone.ts. The old
      // per-caller `|| "America/Los_Angeles"` is how the account ended up with
      // several answers to the same question.
      const tz = safeAccountTimezone(a.timezone);
      const morningTarget = a.briefing_morning_time || "07:00";
      const eveningTarget = a.briefing_evening_time || "18:00";

      const localHHMM = currentLocalHHMM(tz);
      const dueKinds: BriefingKind[] = [];

      // Evening summaries are retired (2026-06): the dashboard card's
      // space now hosts the Boss Assistant instruction channel, and the
      // morning briefing is dismissible. `?kind=evening&force=1` still
      // works for manual testing; the schedule never generates one.
      void eveningTarget;
      if (force && forceKind) {
        dueKinds.push(forceKind);
      } else if (force) {
        dueKinds.push("morning");
      } else {
        if (withinFifteen(localHHMM, morningTarget)) dueKinds.push("morning");
      }

      if (!dueKinds.length) {
        skipped++;
        continue;
      }

      for (const kind of dueKinds) {
        try {
          const brief = await createDailyBriefingForAgent(agentId, kind);
          if (brief.skipped) {
            skipped++;
            continue;
          }
          generated++;

          // Email the morning briefing only — evening is dashboard-only.
          if (kind === "morning") {
            const sentOk = await tryEmailMorning(a.id, brief.briefing);
            if (sentOk) emailed++;
          }
        } catch (e) {
          console.error("[briefings] generate failed", { agentId, kind, e });
          failed++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      generated,
      emailed,
      skipped,
      failed,
    });
  } catch (e) {
    console.error("daily-briefing cron error", e);
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/**
 * Returns the agent's local time as "HH:MM" in their tz. Uses
 * Intl.DateTimeFormat which handles DST correctly without us
 * pulling in a tz library.
 */
function currentLocalHHMM(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return fmt.format(new Date());
  } catch {
    // Bad tz name — fall back to UTC so we still fire something.
    const d = new Date();
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
}

/**
 * True when `now` is in the 15-minute window starting at `target`.
 * Both inputs are HH:MM strings. Wraps around midnight is not
 * possible because briefing times must be within a single day.
 */
function withinFifteen(now: string, target: string): boolean {
  const [nh, nm] = now.split(":").map((n) => parseInt(n, 10));
  const [th, tm] = target.split(":").map((n) => parseInt(n, 10));
  if ([nh, nm, th, tm].some((v) => Number.isNaN(v))) return false;
  const nowMin = nh * 60 + nm;
  const targetMin = th * 60 + tm;
  return nowMin >= targetMin && nowMin < targetMin + 15;
}

async function tryEmailMorning(
  agentId: string | number,
  briefing: unknown,
): Promise<boolean> {
  try {
    const { data: agentWithAuth } = await supabaseServer
      .from("agents")
      .select("auth_user_id")
      .eq("id", agentId)
      .maybeSingle();
    const authUserId = String(
      (agentWithAuth as { auth_user_id?: string } | null)?.auth_user_id ?? "",
    );
    if (!authUserId) return false;

    const { data: authUser, error: authErr } =
      await supabaseServer.auth.admin.getUserById(authUserId);
    if (authErr || !authUser?.user?.email) return false;

    const b = briefing as {
      headline?: string;
      summary?: string;
      insights?: { topOpportunity?: string; suggestedActions?: string[] };
    };
    const headline = b?.headline ?? "Your Morning Briefing";
    const insights = b?.insights ?? {};
    const actions = Array.isArray(insights.suggestedActions)
      ? insights.suggestedActions
      : [];
    const topOpportunity = String(insights.topOpportunity ?? "");

    await sendEmail({
      to: authUser.user.email,
      subject: headline,
      text:
        `${b?.summary ?? "No summary"}\n\n` +
        `Top opportunity:\n${topOpportunity || "—"}\n\n` +
        `Suggested actions:\n- ${actions.join("\n- ")}`,
    });
    return true;
  } catch (e) {
    console.error("[briefings] email failed", { agentId, e });
    return false;
  }
}
