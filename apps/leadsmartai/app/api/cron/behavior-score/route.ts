import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { detectIntentSignals, type BehaviorEvent } from "@/lib/contacts/behavior/scoring";
import { recomputeLeadRating } from "@/lib/contacts/recomputeLeadRating";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Nightly cron: recompute engagement_score + fire intent signals.
 *
 * Processing model:
 *   1. Find every contact with at least one event in the last 30 days
 *      (the scoring window). Ignoring idle contacts keeps the batch
 *      size bounded.
 *   2. For each, load events from the last 30 days.
 *   3. recomputeLeadRating() → composite hot/warm/cold + engagement_score
 *      + a contact_scores history row (single writer of contacts.rating).
 *   4. Run detectIntentSignals() → upsert contact_signals rows for each
 *      proposal, deduped against existing un-dismissed signals by
 *      (contact_id, signal_type, dedup_key) stored in payload.dedup_key.
 *
 * Invoke:
 *   GET /api/cron/behavior-score              (Vercel cron, hourly or daily)
 *   GET /api/cron/behavior-score?agentId=123  (subset for debugging)
 *   GET /api/cron/behavior-score?contactId=uuid  (single contact re-score)
 *
 * Safety: CRON_SECRET via the `Authorization: Bearer <secret>` header or
 * the `x-vercel-cron-signature` Vercel sets automatically.
 */

const LOOKBACK_DAYS = 30;

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const vercelCron = req.headers.get("x-vercel-cron-signature");
  if (vercelCron) return true; // Vercel cron invocation
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

type EventRow = {
  contact_id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
};

async function processContact(contactId: string, now: Date): Promise<{
  scored: boolean;
  signalsCreated: number;
}> {
  const sinceIso = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rawEvents, error: evErr } = await supabaseAdmin
    .from("contact_events")
    .select("contact_id,event_type,created_at,payload")
    .eq("contact_id", contactId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(500);
  if (evErr) throw evErr;

  const events: BehaviorEvent[] = ((rawEvents ?? []) as EventRow[]).map((r) => ({
    eventType: r.event_type,
    createdAt: r.created_at,
    payload: r.payload ?? {},
  }));

  // 1. Recompute the COMPOSITE lead rating — the single writer of
  // contacts.rating (+ engagement_score + a contact_scores history row).
  // Blends web behavior with call / SMS / open-house signals into one
  // hot/warm/cold vocabulary, replacing the old behavior-only A/B/C/D rating
  // that clashed with the rest of the app. Respects rating_manual_override.
  await recomputeLeadRating(contactId);

  // 2. Fire intent signals. Dedup against existing un-dismissed signals
  // using the dedup_key stored in payload.
  const proposals = detectIntentSignals(events, { now });
  if (proposals.length === 0) return { scored: true, signalsCreated: 0 };

  const dedupKeys = proposals.map((p) => p.dedupKey);
  const { data: existing } = await supabaseAdmin
    .from("contact_signals")
    .select("id,payload")
    .eq("contact_id", contactId)
    .is("dismissed_at", null)
    .in("signal_type", [...new Set(proposals.map((p) => p.signalType))]);
  const existingKeys = new Set<string>();
  for (const row of existing ?? []) {
    const key = (row as { payload?: { dedup_key?: unknown } }).payload?.dedup_key;
    if (typeof key === "string") existingKeys.add(key);
  }

  const toInsert = proposals
    .filter((p) => !existingKeys.has(p.dedupKey))
    .map((p) => ({
      contact_id: contactId,
      signal_type: p.signalType,
      label: p.label,
      confidence: p.confidence,
      suggested_action: p.suggestedAction,
      payload: { ...p.payload, dedup_key: p.dedupKey } as never,
      detected_at: now.toISOString(),
    }));

  if (toInsert.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from("contact_signals")
      .insert(toInsert as never);
    if (insErr) {
      console.error("[cron/behavior-score] signal insert failed", {
        code: (insErr as { code?: string }).code,
        msg: (insErr as { message?: string }).message,
      });
    }
  }

  return { scored: true, signalsCreated: toInsert.length };
  // Dedup note: the dedup check matches on the most recent un-dismissed
  // signal. Once the agent dismisses a signal, the next run can re-fire
  // the same dedup_key — which is intentional for signals like
  // high_intent_returning (the contact came back after going cold).
}

async function listCandidateContactIds(opts: { agentId?: string; contactId?: string }): Promise<string[]> {
  if (opts.contactId) return [opts.contactId];

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let q = supabaseAdmin
    .from("contact_events")
    .select("contact_id")
    .gte("created_at", sinceIso)
    .limit(10000);
  if (opts.agentId) q = q.eq("agent_id", opts.agentId as never);

  const { data, error } = await q;
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { contact_id?: string }).contact_id;
    if (id) set.add(String(id));
  }
  return Array.from(set);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") ?? undefined;
  const contactId = url.searchParams.get("contactId") ?? undefined;

  try {
    const now = new Date();
    const contactIds = await listCandidateContactIds({ agentId, contactId });

    let scored = 0;
    let signalsCreated = 0;
    let failed = 0;

    for (const cid of contactIds) {
      try {
        const r = await processContact(cid, now);
        if (r.scored) scored += 1;
        signalsCreated += r.signalsCreated;
      } catch (e) {
        failed += 1;
        console.error("[cron/behavior-score] per-contact failure", {
          contactId: cid,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      candidates: contactIds.length,
      scored,
      signalsCreated,
      failed,
      durationMs: Date.now() - now.getTime(),
    });
  } catch (e) {
    console.error("[cron/behavior-score] fatal", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Server error",
      },
      { status: 500 },
    );
  }
}
