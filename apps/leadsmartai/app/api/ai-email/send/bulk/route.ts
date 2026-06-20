import { NextResponse } from "next/server";
import { getContacts } from "@/lib/dashboardService";
import { requireCrmFeature } from "@/lib/billing/guard";
import { sendOutboundEmail } from "@/lib/ai-email/send";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cap per batch — mirrors the bulk call/SMS routes. */
const MAX_BULK = 25;

/**
 * Send one outbound email to a batch of selected CRM contacts — the email
 * sibling of /api/dashboard/voice/outbound-call/bulk and /api/ai-sms/send/bulk,
 * used by the Sales Assistant outreach composer. Resolves each contact's email
 * from the agent-scoped contact list, sends via Resend, and reports per-contact
 * results. Gated on `basic_crm` (every plan), same reach as /api/ai-email/send.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireCrmFeature("basic_crm");
    if (!gate.ok) return gate.response;
    const { agentId } = gate.ctx;

    const raw = (await req.json().catch(() => ({}))) as {
      contactIds?: unknown;
      subject?: string;
      body?: string;
    };
    const ids = Array.isArray(raw.contactIds)
      ? Array.from(new Set(raw.contactIds.map((x) => String(x)).filter(Boolean)))
      : [];
    const subject = String(raw.subject ?? "").trim();
    const text = String(raw.body ?? "").trim();

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one contact." }, { status: 400 });
    }
    if (ids.length > MAX_BULK) {
      return NextResponse.json(
        { ok: false, error: `Too many at once — email up to ${MAX_BULK} contacts per batch.` },
        { status: 400 },
      );
    }
    if (!subject) {
      return NextResponse.json({ ok: false, error: "Add a subject line." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ ok: false, error: "Add a message to send." }, { status: 400 });
    }

    // Resolve the selected ids to the agent's own contacts (RLS-scoped).
    const all = await getContacts(500);
    const byId = new Map(all.map((c) => [String(c.id), c]));
    const selected = ids.map((id) => byId.get(id)).filter((c): c is (typeof all)[number] => Boolean(c));

    const results: Array<{ id: string; name: string; email: string | null; ok: boolean; error?: string }> = [];
    for (const c of selected) {
      const name = (c.name ?? "").trim();
      const email = (typeof c.email === "string" ? c.email : "").trim();
      if (!email) {
        results.push({ id: String(c.id), name, email: null, ok: false, error: "No email on file." });
        continue;
      }
      try {
        await sendOutboundEmail({
          leadId: String(c.id),
          to: email,
          subject,
          body: text,
          agentId,
          actorType: "agent",
          actorName: "Agent",
          deliver: true,
        });
        results.push({ id: String(c.id), name, email, ok: true });
      } catch (e) {
        results.push({
          id: String(c.id),
          name,
          email,
          ok: false,
          error: e instanceof Error ? e.message : "Failed to send the email.",
        });
      }
      // Gentle pacing between sends.
      await new Promise((r) => setTimeout(r, 250));
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, sent, failed: results.length - sent, total: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bulk email failed.";
    console.error("ai-email/send/bulk", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
