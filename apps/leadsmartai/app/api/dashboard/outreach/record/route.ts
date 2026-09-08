import { NextResponse } from "next/server";
import { requireCrmFeature } from "@/lib/billing/guard";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const CHANNELS = ["call", "sms", "email"] as const;
const PURPOSES = ["follow_up", "survey", "promo"] as const;
type Channel = (typeof CHANNELS)[number];
type Purpose = (typeof PURPOSES)[number];

/**
 * Record a "Send now" outreach action in the same table the scheduler uses.
 *
 * "Scheduled & recent actions" reads scheduled_actions, and only the
 * "Schedule for later" path ever wrote to it. A call placed with "Send now"
 * went out through the voice route and left no trace on this page — the
 * agent saw "Calling…" for a second and then nothing, so a call that never
 * rang and a call that reached voicemail looked identical: absent.
 *
 * The composer posts here after the send completes (or fails), with the
 * per-contact outcomes the bulk routes already return. The row lands with
 * scheduled_for = now and status sent/failed, so the strip renders it with
 * no special case. Best-effort by design: a logging failure never surfaces
 * to the agent as a send failure.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireCrmFeature("basic_crm");
    if (!gate.ok) return gate.response;
    const { agentId } = gate.ctx;

    const raw = (await req.json().catch(() => ({}))) as {
      channel?: string;
      purpose?: string;
      contactIds?: unknown;
      subject?: string;
      body?: string;
      ok?: boolean;
      error?: string;
      sent?: number;
      failed?: number;
      total?: number;
      results?: Array<{ id?: string; ok?: boolean; error?: string }>;
    };

    const channel = (CHANNELS as readonly string[]).includes(raw.channel ?? "")
      ? (raw.channel as Channel)
      : null;
    const purpose: Purpose = (PURPOSES as readonly string[]).includes(raw.purpose ?? "")
      ? (raw.purpose as Purpose)
      : "follow_up";
    const contactIds = Array.isArray(raw.contactIds)
      ? raw.contactIds.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 25)
      : [];
    if (!channel || contactIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to record." }, { status: 400 });
    }

    const total = typeof raw.total === "number" ? raw.total : contactIds.length;
    const failed = typeof raw.failed === "number" ? raw.failed : raw.ok === false ? total : 0;
    const sent = typeof raw.sent === "number" ? raw.sent : Math.max(0, total - failed);
    const results =
      Array.isArray(raw.results) && raw.results.length
        ? raw.results
        : contactIds.map((id) => ({ id, ok: raw.ok !== false, error: raw.ok === false ? raw.error : undefined }));

    const now = new Date().toISOString();
    const { data, error } = await supabaseServer
      .from("scheduled_actions")
      .insert({
        agent_id: String(agentId),
        channel,
        purpose,
        contact_ids: contactIds,
        subject: raw.subject?.trim() || null,
        body: raw.body?.trim() || null,
        scheduled_for: now,
        sent_at: now,
        // A batch with any success is "sent" (the strip appends "N ok, M failed");
        // nothing sent at all is "failed", which is what shows the reason.
        status: sent > 0 ? "sent" : "failed",
        result: { sent, failed, total, results },
      } as Record<string, unknown>)
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: (data as { id: string }).id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not record the action.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
