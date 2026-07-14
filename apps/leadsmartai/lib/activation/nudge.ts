import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import { computeActivationChecklist } from "@/lib/activation/checklist";
import { sendActivationNudgeEmail } from "@/lib/email/activationNudge";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How many nudges we'll ever send one agent, and the gap between them. */
const MAX_NUDGES = 3;
const NUDGE_COOLDOWN_MS = 72 * HOUR;
/** Only nudge agents in this age band: old enough to have had a fair chance,
 *  young enough that a nudge is still relevant. */
const MIN_AGE_MS = 24 * HOUR;
const MAX_AGE_MS = 14 * DAY;

type Candidate = {
  id: number | string;
  auth_user_id: string | null;
  activation_nudge_count: number | null;
};

/**
 * Email agents who signed up but haven't finished activating. Uses the SAME
 * activation engine as the in-app Boss card, so the two channels agree on what's
 * done and what's next. Best-effort per agent; bounded per run.
 */
export async function runActivationNudges(): Promise<{
  scanned: number;
  nudged: number;
  skipped: number;
}> {
  const now = Date.now();
  const olderThan = new Date(now - MIN_AGE_MS).toISOString(); // created before this
  const newerThan = new Date(now - MAX_AGE_MS).toISOString(); // created after this
  const cooldownBefore = new Date(now - NUDGE_COOLDOWN_MS).toISOString();

  const { data, error } = await supabaseServer
    .from("agents")
    .select("id, auth_user_id, activation_nudge_count")
    .lte("created_at", olderThan)
    .gte("created_at", newerThan)
    .lt("activation_nudge_count", MAX_NUDGES)
    .or(`activation_nudge_last_at.is.null,activation_nudge_last_at.lt.${cooldownBefore}`)
    .limit(100);

  if (error) throw error;
  const candidates = (data ?? []) as Candidate[];

  let nudged = 0;
  let skipped = 0;

  for (const c of candidates) {
    const agentId = String(c.id);
    const userId = c.auth_user_id ? String(c.auth_user_id) : "";
    if (!userId) {
      skipped++;
      continue;
    }
    try {
      const checklist = await computeActivationChecklist(agentId, userId);
      const nextStep = checklist.steps.find((s) => !s.done);
      if (checklist.complete || !nextStep) {
        skipped++;
        continue;
      }

      const { data: profile } = await supabaseServer
        .from("user_profiles")
        .select("full_name, email")
        .eq("user_id", userId as never)
        .maybeSingle();
      const email = String((profile as { email?: string | null } | null)?.email ?? "").trim();
      if (!email) {
        skipped++;
        continue;
      }
      const name = String((profile as { full_name?: string | null } | null)?.full_name ?? "").trim();

      await sendActivationNudgeEmail({
        to: email,
        name,
        nextStepTitle: nextStep.title,
        nextStepDescription: nextStep.description,
        nextStepHref: nextStep.href,
        doneCount: checklist.doneCount,
        total: checklist.total,
      });

      await supabaseServer
        .from("agents")
        .update({
          activation_nudge_last_at: new Date().toISOString(),
          activation_nudge_count: (c.activation_nudge_count ?? 0) + 1,
        } as never)
        .eq("id", c.id as never);

      nudged++;
    } catch (e) {
      console.error("[activation-nudge] agent", agentId, e);
      skipped++;
    }
  }

  return { scanned: candidates.length, nudged, skipped };
}
