import { NextResponse } from "next/server";
import { getContacts } from "@/lib/dashboardService";
import { requireCrmFeature } from "@/lib/billing/guard";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cap per batch — mirrors the bulk-call route; guards cost + carrier rate limits. */
const MAX_BULK = 25;

/** Append the carrier-required opt-out once. Mirrors /api/ai-sms/send. */
function withOptOutFooter(message: string) {
  const m = String(message ?? "").trim();
  if (/reply\s+stop\s+to\s+unsubscribe/i.test(m)) return m;
  return `${m} Reply STOP to unsubscribe.`;
}

/**
 * Send one outbound SMS to a batch of selected CRM contacts. Each message is
 * the same as a single "Send SMS" (opt-out footer appended, logged to the
 * activity feed) and sends are paced so we don't slam the carrier. The bulk
 * SMS sibling of /api/dashboard/voice/outbound-call/bulk, used by the Sales
 * Assistant outreach composer.
 *
 * Gated on `basic_crm` (every plan, incl. free) — same reach as the single
 * /api/ai-sms/send route, just resolved through the agent-scoped contact list.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireCrmFeature("basic_crm");
    if (!gate.ok) return gate.response;
    const { agentId } = gate.ctx;

    const body = (await req.json().catch(() => ({}))) as {
      contactIds?: unknown;
      body?: string;
    };
    const ids = Array.isArray(body.contactIds)
      ? Array.from(new Set(body.contactIds.map((x) => String(x)).filter(Boolean)))
      : [];
    const text = String(body.body ?? "").trim();

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one contact." }, { status: 400 });
    }
    if (ids.length > MAX_BULK) {
      return NextResponse.json(
        { ok: false, error: `Too many at once — text up to ${MAX_BULK} contacts per batch.` },
        { status: 400 },
      );
    }
    if (!text) {
      return NextResponse.json({ ok: false, error: "Add a message to send." }, { status: 400 });
    }

    const outboundBody = withOptOutFooter(text);

    // Resolve the selected ids to the agent's own contacts (RLS-scoped).
    const all = await getContacts(500);
    const byId = new Map(all.map((c) => [String(c.id), c]));
    const selected = ids.map((id) => byId.get(id)).filter((c): c is (typeof all)[number] => Boolean(c));

    const results: Array<{ id: string; name: string; phone: string | null; ok: boolean; error?: string }> = [];
    for (const c of selected) {
      const name = (c.name ?? "").trim();
      const phone = String(c.phone ?? "").trim();
      if (!phone) {
        results.push({ id: String(c.id), name, phone: null, ok: false, error: "No phone number." });
        continue;
      }
      try {
        const sent = await sendOutboundSms({
          leadId: String(c.id),
          to: phone,
          body: outboundBody,
          agentId,
          actorType: "agent",
          actorName: "Agent",
        });
        results.push({ id: String(c.id), name, phone: sent.to, ok: true });
      } catch (e) {
        results.push({
          id: String(c.id),
          name,
          phone,
          ok: false,
          error: e instanceof Error ? e.message : "Failed to send the text.",
        });
      }
      // Gentle pacing between sends.
      await new Promise((r) => setTimeout(r, 250));
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, sent, failed: results.length - sent, total: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bulk SMS failed.";
    console.error("ai-sms/send/bulk", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
