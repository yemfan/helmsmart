import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { loadSalesCallContext } from "@/lib/voice-agent/context";
import { placeOutboundCall } from "@/lib/voice-agent/outbound";
import { normalizePhoneE164, type OutboundPurpose } from "@repo/voice";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import { sendOutboundEmail } from "@/lib/ai-email/send";
import {
  DRAIN_BUDGET_MS,
  STALE_SENDING_MS,
  outOfDrainBudget,
  outreachReapDecision,
  type StaleSendingRow,
} from "@/lib/outreach/reapQueue";

export const runtime = "nodejs";
export const maxDuration = 300;

/** How many due actions to drain per run. */
const MAX_PER_RUN = 50;

/** Append the carrier-required opt-out once. Mirrors /api/ai-sms/send. */
function withOptOutFooter(message: string) {
  const m = String(message ?? "").trim();
  if (/reply\s+stop\s+to\s+unsubscribe/i.test(m)) return m;
  return `${m} Reply STOP to unsubscribe.`;
}

type Row = {
  id: string;
  agent_id: string;
  channel: "call" | "sms" | "email";
  purpose: OutboundPurpose;
  contact_ids: string[] | null;
  subject: string | null;
  body: string | null;
};

type ContactRow = { id: string; name: string | null; phone: string | null; email: string | null };

/**
 * Drain due scheduled outreach actions (Sales Assistant composer "Schedule for
 * later"). Each row is a fixed contact batch on one channel; we resolve each
 * contact's address and send via the same paths as the send-now composer, then
 * record per-contact results. Runs every 15 minutes (see vercel.json).
 *
 * Auth: Vercel cron signature OR Authorization: Bearer <CRON_SECRET> OR ?secret=.
 */
/**
 * Reclaim batches stranded in 'sending' by a run that died between claiming a
 * row and recording its outcome.
 *
 * Always fails them, never requeues: the send loop walks contacts one at a
 * time, so a batch that died halfway has already called or texted some of
 * them, and putting it back to 'scheduled' would contact those people twice.
 * See lib/outreach/reapQueue.ts.
 */
async function reapStaleSending(): Promise<{ failed: number }> {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_SENDING_MS).toISOString();

  const { data: rows, error } = await supabaseServer
    .from("scheduled_actions")
    .select("id,result,sent_at,created_at")
    .eq("status", "sending")
    .lte("created_at", staleBefore)
    .limit(100);
  if (error || !rows?.length) return { failed: 0 };

  let failed = 0;
  for (const raw of rows as Array<{ id: string; result: unknown; sent_at: string | null; created_at: string | null }>) {
    const row: StaleSendingRow = {
      id: raw.id,
      // sent_at is stamped by the progress writes below, so it tracks the last
      // sign of life; created_at is the fallback for a row that never got one.
      claimed_at: raw.sent_at ?? raw.created_at,
      result: (raw.result ?? null) as StaleSendingRow["result"],
    };
    const decision = outreachReapDecision(row, now);
    if (decision.action !== "fail") continue;

    const { error: updErr } = await supabaseServer
      .from("scheduled_actions")
      .update({
        status: "failed",
        result: {
          ...(typeof raw.result === "object" && raw.result ? raw.result : {}),
          interrupted: true,
          message: decision.reason,
        },
      } as Record<string, unknown>)
      .eq("id", row.id)
      // Guard the write: if a live run finished in the meantime, its outcome
      // wins and we must not overwrite it with a failure.
      .eq("status", "sending");
    if (!updErr) failed += 1;
  }
  return { failed };
}

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const reaped = await reapStaleSending();

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabaseServer
    .from("scheduled_actions")
    .select("id,agent_id,channel,purpose,contact_ids,subject,body")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) {
    console.error("outreach-scheduler: load due", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let processed = 0;
  let sentTotal = 0;
  let failedTotal = 0;

  let outOfTime = false;
  for (const row of (due ?? []) as Row[]) {
    /*
     * Stop before the platform does. A run killed mid-batch strands the row in
     * 'sending' and has already contacted some of its people — the reaper can
     * only report that, never undo it. Stopping early costs a 15-minute delay;
     * being killed costs a batch.
     */
    if (outOfDrainBudget(startedAt, Date.now())) {
      outOfTime = true;
      break;
    }
    // Claim the row so overlapping cron runs don't double-send.
    const { data: claimed } = await supabaseServer
      .from("scheduled_actions")
      .update({ status: "sending" } as Record<string, unknown>)
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const ids = Array.isArray(row.contact_ids) ? row.contact_ids.map(String) : [];
    const { data: contacts } = await supabaseServer
      .from("contacts")
      .select("id,name,phone,email")
      .in("id", ids);
    const byId = new Map(((contacts ?? []) as ContactRow[]).map((c) => [String(c.id), c]));

    // Load the Sales Assistant voice context once for call batches.
    const ctx = row.channel === "call" ? await loadSalesCallContext(String(row.agent_id)) : null;

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      const c = byId.get(String(id));
      if (!c) {
        results.push({ id, ok: false, error: "Contact not found." });
        continue;
      }
      try {
        if (row.channel === "call") {
          if (!ctx) throw new Error("Your AI assistant is turned off.");
          const norm = normalizePhoneE164(String(c.phone ?? "").trim());
          if (!norm.ok) throw new Error("Invalid phone number.");
          await placeOutboundCall({
            ctx,
            agentId: String(row.agent_id),
            leadName: (c.name ?? "").trim(),
            toNumberE164: norm.value,
            purpose: row.purpose,
            detail: row.body ?? undefined,
          });
        } else if (row.channel === "sms") {
          const phone = String(c.phone ?? "").trim();
          if (!phone) throw new Error("No phone number.");
          await sendOutboundSms({
            leadId: String(c.id),
            to: phone,
            body: withOptOutFooter(row.body ?? ""),
            agentId: String(row.agent_id),
            actorType: "ai",
            actorName: "Scheduled",
            assistantType: "sales_assistant",
          });
        } else {
          const email = String(c.email ?? "").trim();
          if (!email) throw new Error("No email on file.");
          await sendOutboundEmail({
            leadId: String(c.id),
            to: email,
            subject: row.subject ?? "",
            body: row.body ?? "",
            agentId: String(row.agent_id),
            actorType: "agent",
            actorName: "Scheduled",
            deliver: true,
          });
        }
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : "Send failed." });
      }
      /*
       * Record progress as we go, not just at the end.
       *
       * The outcome used to be one write after the whole batch, so a run that
       * died halfway left no trace of who had already been called or texted —
       * and the agent could only be told "some contacts may have been reached".
       * With progress on the row, an interrupted batch can say 5 of 12, which
       * is the difference between a safe follow-up and contacting five people
       * twice. One extra write per contact, on a loop that already sleeps
       * 250ms between sends.
       */
      const okSoFar = results.filter((r) => r.ok).length;
      await supabaseServer
        .from("scheduled_actions")
        .update({
          result: { sent: okSoFar, failed: results.length - okSoFar, total: ids.length, results },
          sent_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", row.id)
        .eq("status", "sending");
      // Gentle pacing between sends.
      await new Promise((r) => setTimeout(r, 250));
    }

    const ok = results.filter((r) => r.ok).length;
    sentTotal += ok;
    failedTotal += results.length - ok;
    await supabaseServer
      .from("scheduled_actions")
      .update({
        status: ok > 0 ? "sent" : "failed",
        result: { sent: ok, failed: results.length - ok, total: results.length, results },
        sent_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("id", row.id);
    processed++;
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent: sentTotal,
    failed: failedTotal,
    // Non-zero means a previous run was killed mid-batch. Persistently
    // non-zero means it keeps happening, and the budget needs a look.
    reapedInterrupted: reaped.failed,
    // True when this run stopped on its own terms with work still due; the
    // next tick picks it up in 15 minutes.
    stoppedForTime: outOfTime,
  });
}
