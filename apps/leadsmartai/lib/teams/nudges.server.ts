import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import type { Attention } from "./marketing";
import { loadTeamMarketing } from "./marketing.server";
import { loadTeamBrand } from "./brand.server";
import { NUDGE_COOLDOWN_DAYS, nudgeMessage, planNudges } from "./nudges";

/**
 * Send the nudge for one attention reason to everyone in that bucket.
 *
 * Recipients come from the same read the panel shows, so what the broker
 * saw is what goes out. Sends run ten at a time: a 1,200-agent brokerage
 * with 200 agents in a bucket finishes in seconds, and one bad address
 * fails alone. Each send is recorded before the next batch so a crash
 * mid-way cannot double-send on retry.
 */

const BATCH = 10;

export type NudgeResult = { sent: number; failed: number; skippedRecent: number; noEmail: number };

export async function nudgeAttention(args: { teamId: string; reason: Attention; byAgentId: string }): Promise<NudgeResult> {
  const [marketing, brand, team, byName] = await Promise.all([
    loadTeamMarketing(args.teamId, 30),
    loadTeamBrand(args.teamId).catch(() => null),
    supabaseAdmin.from("teams").select("name").eq("id", args.teamId).maybeSingle(),
    getAgentDisplayName(args.byAgentId).catch(() => null),
  ]);
  const since = new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data: recentRows } = await supabaseAdmin
    .from("team_nudges")
    .select("agent_id")
    .eq("team_id", args.teamId)
    .eq("reason", args.reason)
    .gte("sent_at", since)
    .limit(10_000);
  const recent = new Set(((recentRows as { agent_id: unknown }[] | null) ?? []).map((r) => String(r.agent_id)));

  const plan = planNudges(marketing.rows, args.reason, recent);
  const brokerage = brand?.name?.trim() || ((team.data as { name?: string } | null)?.name ?? "your brokerage");
  const origin = getSiteUrl().replace(/\/$/, "");

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < plan.to.length; i += BATCH) {
    const chunk = plan.to.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (r) => {
        const first = (r.name ?? "").trim().split(/\s+/)[0] || null;
        const msg = nudgeMessage(args.reason, { first, from: byName, brokerage, origin });
        try {
          await sendEmail({ to: r.email!, subject: msg.subject, text: msg.text, html: msg.html });
          return { agentId: r.agentId, ok: true };
        } catch (e) {
          console.warn("[teams.nudges] send failed:", r.agentId, e instanceof Error ? e.message : e);
          return { agentId: r.agentId, ok: false };
        }
      }),
    );
    const ok = results.filter((x) => x.ok);
    sent += ok.length;
    failed += results.length - ok.length;
    if (ok.length) {
      const { error } = await supabaseAdmin
        .from("team_nudges")
        .insert(ok.map((x) => ({ team_id: args.teamId, agent_id: x.agentId, reason: args.reason, sent_by_agent_id: args.byAgentId })) as never[]);
      if (error) console.warn("[teams.nudges] record failed:", error.message);
    }
  }
  return { sent, failed, skippedRecent: plan.skippedRecent, noEmail: plan.noEmail };
}
