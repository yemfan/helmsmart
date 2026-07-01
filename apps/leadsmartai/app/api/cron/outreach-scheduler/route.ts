import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { loadSalesCallContext } from "@/lib/voice-agent/context";
import { placeOutboundCall } from "@/lib/voice-agent/outbound";
import { normalizePhoneE164, type OutboundPurpose } from "@repo/voice";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import { sendOutboundEmail } from "@/lib/ai-email/send";

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
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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

  for (const row of (due ?? []) as Row[]) {
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

  return NextResponse.json({ ok: true, processed, sent: sentTotal, failed: failedTotal });
}
