import { NextResponse } from "next/server";
import {
  CONSENT_SOURCE_MARKETING_HUB,
  HUB_LEAD_DISCLOSURE_VERSION,
} from "@/lib/consent/disclosureVersions";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { recordInboundContactRequest } from "@/lib/consent/service";
import { resolveAgentIdByUsername } from "@/lib/marketing-hub/loadHub";
import {
  SESSION_COOKIE,
  VISITOR_COOKIE,
  readCookieFromHeader,
} from "@/lib/marketing-hub/visitor";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/public/hub/[username]/lead — UNAUTHENTICATED.
 *
 * A visitor on an agent's marketing hub becomes a contact belonging to THAT
 * agent. The handle in the path is the only routing key, and it is resolved
 * server-side; nothing about which agent owns the lead comes from the body,
 * because a client-supplied agent id would let anyone plant contacts in
 * anyone's CRM.
 *
 * Writes, in order of importance:
 *   1. the contact — the agent's actual outcome
 *   2. the consent audit row — TCPA defence, records the exact disclosure text
 *      version the visitor saw
 *   3. a traffic_events conversion — attribution, so the agent can later see
 *      that this lead arrived from a particular campaign
 *
 * 2 and 3 are best-effort. A failure to journal must never cost the agent the
 * lead, which is the only irreplaceable part.
 *
 * Rate limiting is deliberately not here yet. The abuse surface is junk
 * contacts in one agent's CRM — annoying, not dangerous — and matches the
 * existing open-house sign-in's stance. Revisit when hubs get real traffic.
 */

function clean(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await ctx.params;
    const agentId = await resolveAgentIdByUsername(username);
    if (agentId === null) {
      return NextResponse.json({ ok: false, error: "unknown_agent" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 40);
    const message = clean(body.message, 2000);
    const smsConsent = body.smsConsent === true;
    const utmSource = clean(body.utmSource, 80) || null;
    const utmCampaign = clean(body.utmCampaign, 120) || null;

    // Mirrors the form. A name plus one way to reply is the minimum that makes
    // the record useful to the agent.
    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json({ ok: false, error: "contact_required" }, { status: 400 });
    }

    // A returning visitor is an UPDATE, not a second contact. `contacts` also
    // carries a unique index on (agent_id, phone), so inserting blindly would
    // fail with 23505 on the second enquiry from the same person — which would
    // read to them as a broken form.
    let contactId: string | null = null;
    const existing = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("agent_id", agentId as never)
      .or([phone ? `phone.eq.${phone}` : null, email ? `email.eq.${email}` : null]
        .filter(Boolean)
        .join(","))
      .limit(1)
      .maybeSingle();

    const existingId = (existing.data as { id: string } | null)?.id ?? null;

    if (existingId) {
      contactId = existingId;
      await supabaseAdmin
        .from("contacts")
        .update({
          // Only fill blanks — never overwrite what the agent has curated with
          // whatever a web form happened to collect this time.
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(smsConsent ? { sms_opt_in: true } : {}),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existingId as never)
        .eq("agent_id", agentId as never);
    } else {
      const inserted = await supabaseAdmin
        .from("contacts")
        .insert({
          agent_id: agentId,
          name,
          email: email || null,
          phone: phone || null,
          source: CONSENT_SOURCE_MARKETING_HUB,
          notes: message || null,
          lead_type: null,
          // Opt-in only when the box was ticked. The column defaults to false,
          // so an unticked form leaves the visitor un-textable by construction.
          sms_opt_in: smsConsent,
        } as never)
        .select("id")
        .maybeSingle();
      contactId = (inserted.data as { id: string } | null)?.id ?? null;
      if (inserted.error) {
        console.error("[hub.lead] contact insert failed:", inserted.error.message);
        return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
      }
    }

    // THE STITCH. Everything this browser did for THIS agent now belongs to
    // the contact they just became — which is what lets the agent be told
    // "they read three of your posts before calling you".
    //
    // Scoped by agent as well as visitor: one browser can visit two agents'
    // hubs, and those are two separate relationships. Without the agent
    // filter, one agent's page views would land in another agent's CRM.
    //
    // Only rows that are still anonymous are claimed, so a shared computer
    // does not reassign an earlier person's history to a later one.
    const visitorId = readCookieFromHeader(req.headers.get("cookie"), VISITOR_COOKIE);
    if (contactId && visitorId) {
      const { error: stitchErr } = await supabaseAdmin
        .from("traffic_events")
        .update({ contact_id: contactId } as never)
        .eq("agent_id", agentId as never)
        .eq("visitor_id", visitorId)
        .is("contact_id", null);
      if (stitchErr) console.warn("[hub.lead] stitch:", stitchErr.message);
    }

    const meta = extractRequestMeta(req);

    // Audit trail. Best-effort: the lead is already saved and must not be lost
    // to a journalling failure.
    void recordInboundContactRequest({
      source: CONSENT_SOURCE_MARKETING_HUB,
      name,
      email,
      phone,
      subject: `marketing hub: @${username}`,
      message,
      smsConsent,
      emailConsent: Boolean(email),
      consentDisclosureVersion: HUB_LEAD_DISCLOSURE_VERSION,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      contactId,
    });

    // Attribution. agent_id is what makes this the agent's number rather than
    // CloseBoss's — platform aggregates filter on `agent_id is null`.
    void supabaseAdmin
      .from("traffic_events")
      .insert({
        event_type: "conversion",
        page_path: `/@${username}`,
        agent_id: agentId,
        source: utmSource,
        campaign: utmCampaign,
        // The conversion belongs to the same visitor and session as the views
        // that led to it, so the journey reads as one story rather than an
        // anonymous trail and an unrelated enquiry.
        visitor_id: readCookieFromHeader(req.headers.get("cookie"), VISITOR_COOKIE),
        session_id: readCookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE),
        contact_id: contactId,
        metadata: { kind: "hub_lead", contactId },
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[hub.lead] traffic_events:", error.message);
      });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[hub.lead] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
