import { NextResponse } from "next/server";
import { requireCrmFeature } from "@/lib/billing/guard";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/** Per-batch cap — mirrors the bulk send routes. */
const MAX_BULK = 25;
const CHANNELS = ["call", "sms", "email"] as const;
const PURPOSES = ["follow_up", "survey", "promo"] as const;
type Channel = (typeof CHANNELS)[number];
type Purpose = (typeof PURPOSES)[number];

/**
 * Queue an outreach action for a future time — the "Schedule for later" path of
 * the Sales Assistant composer. The composer has already resolved the target to
 * a concrete contactIds batch, so this just validates and stores a row; the
 * 15-minute drain cron (/api/cron/outreach-scheduler) sends it when due.
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
      scheduledFor?: string;
    };

    const channel = (CHANNELS as readonly string[]).includes(raw.channel ?? "")
      ? (raw.channel as Channel)
      : null;
    const purpose: Purpose = (PURPOSES as readonly string[]).includes(raw.purpose ?? "")
      ? (raw.purpose as Purpose)
      : "follow_up";
    const contactIds = Array.isArray(raw.contactIds)
      ? Array.from(new Set(raw.contactIds.map((x) => String(x)).filter(Boolean)))
      : [];
    const subject = raw.subject ? String(raw.subject).trim() : null;
    const body = raw.body ? String(raw.body).trim() : null;

    if (!channel) {
      return NextResponse.json({ ok: false, error: "Pick a channel." }, { status: 400 });
    }
    if (contactIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one contact." }, { status: 400 });
    }
    if (contactIds.length > MAX_BULK) {
      return NextResponse.json(
        { ok: false, error: `Too many at once — up to ${MAX_BULK} contacts per batch.` },
        { status: 400 },
      );
    }

    const when = new Date(String(raw.scheduledFor ?? ""));
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ ok: false, error: "Pick a valid date & time." }, { status: 400 });
    }
    // Small buffer so a near-now schedule still has a drain cycle ahead of it.
    if (when.getTime() <= Date.now() + 30_000) {
      return NextResponse.json({ ok: false, error: "Pick a time in the future." }, { status: 400 });
    }

    if (channel === "email" && !subject) {
      return NextResponse.json({ ok: false, error: "Add a subject line." }, { status: 400 });
    }
    const bodyRequired = channel === "sms" || channel === "email" || purpose === "survey" || purpose === "promo";
    if (bodyRequired && !body) {
      return NextResponse.json({ ok: false, error: "Add a message to send." }, { status: 400 });
    }

    // Every contact must actually be reachable on this channel. The composer
    // filters its own picker, but it is not the only way a row gets here — a
    // quick-action, a segment, or the Boss can all queue one — and the drain
    // 15 minutes later has no way to recover. A call to a contact with no
    // phone number sat in the strip as a bare "Failed" with the real reason
    // ("Invalid phone number.") buried in the result JSON.
    const contactColumn = channel === "email" ? "email" : "phone";
    const { data: targets, error: targetErr } = await supabaseServer
      .from("contacts")
      .select(`id, name, ${contactColumn}`)
      .eq("agent_id", agentId)
      .in("id", contactIds);
    if (targetErr) throw targetErr;
    const rows = (targets ?? []) as unknown as Array<Record<string, unknown>>;
    const unreachable = contactIds.filter((id) => {
      const row = rows.find((r) => String(r.id) === id);
      if (!row) return true;
      const value = row[contactColumn];
      return !(typeof value === "string" && value.trim());
    });
    if (unreachable.length > 0) {
      const missing = channel === "email" ? "email address" : "phone number";
      const names = unreachable.map((id) => {
        const row = rows.find((r) => String(r.id) === id);
        const name = typeof row?.name === "string" ? row.name.trim() : "";
        return name || "One contact";
      });
      const shown = names.slice(0, 3).join(", ");
      const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";
      const error =
        names.length === 1
          ? `${shown} has no ${missing} on file — add one, or reach them another way.`
          : `${shown}${rest} have no ${missing} on file. Remove them, or pick another channel.`;
      return NextResponse.json(
        { ok: false, error, code: "UNREACHABLE_CONTACTS", contactIds: unreachable },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseServer
      .from("scheduled_actions")
      .insert({
        agent_id: String(agentId),
        channel,
        purpose,
        contact_ids: contactIds,
        subject,
        body,
        scheduled_for: when.toISOString(),
        status: "scheduled",
      } as Record<string, unknown>)
      .select("id,scheduled_for")
      .single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      id: (data as { id: string }).id,
      count: contactIds.length,
      scheduledFor: (data as { scheduled_for: string }).scheduled_for,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not schedule the action.";
    console.error("outreach/schedule", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
