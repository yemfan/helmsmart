import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  CONSENT_SOURCE_IDX_LEAD_CAPTURE,
  IDX_LEAD_CAPTURE_DISCLOSURE_VERSION,
} from "@/lib/consent/disclosureVersions";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { recordInboundContactRequest } from "@/lib/consent/service";
import { scheduleEmailSequenceForLeadSkipDay0 } from "@/lib/emailSequences";
import { generateReply, type IdxReplyContext } from "@/lib/aiReplyGenerator";
import { sendSMS } from "@/lib/twilioSms";
import { appendMessages, getOrCreateConversation } from "@/lib/leadConversationHelpers";
import { createSavedSearch } from "@/lib/contacts/savedSearches";
import {
  buildSavedSearchName,
  idxFiltersToSavedSearchCriteria,
} from "@/lib/idx/savedSearch";
import { assignNextAgentForIdxLead } from "@/lib/leadAssignment/service";
import { extractZipFromAddress } from "@/lib/leadAssignment/zipCoverage";

/**
 * IDX public-site lead capture. Single-shot handler called by the IDX modal
 * when a consumer favorites / saves a search / requests a tour / hits the
 * view-threshold gate.
 *
 * Differences from /api/leads/capture-email:
 *   - No property warehouse / report generation. The "asset" is the IDX
 *     listing/search itself, not a generated home-value report.
 *   - The `notes` field carries the listing/search context as JSON so the AI
 *     auto-reply has full context about what the consumer was looking at.
 *   - `agent_id` is resolved by `assignNextAgentForIdxLead`, which uses a
 *     least-recently-assigned rotation across IDX_ROUND_ROBIN_AGENT_IDS
 *     (comma-separated). Falls back to single IDX_DEMO_AGENT_ID, then to
 *     null (unassigned pool) when neither env is set.
 *
 * Table is `contacts` (not `leads` — renamed when the schema unified
 * leads/sphere/past_clients in 20260319_*).
 */

type IdxLeadAction =
  | "favorite"
  | "save_search"
  | "schedule_tour"
  | "contact_agent"
  | "view_threshold";

type Body = {
  email?: string;
  name?: string | null;
  phone?: string | null;
  action?: IdxLeadAction;
  listingId?: string | null;
  listingAddress?: string | null;
  listingPrice?: number | null;
  searchFilters?: Record<string, unknown> | null;
  /** TCPA consent: must be set true for SMS path. Captured from a checkbox. */
  smsConsent?: boolean;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function pickStage(action: IdxLeadAction, hasPhone: boolean): string {
  if (action === "schedule_tour" || action === "contact_agent") return "high_intent";
  if (action === "favorite" || action === "save_search") return hasPhone ? "phone_captured" : "email_captured";
  return hasPhone ? "phone_captured" : "email_captured";
}

function pickRating(action: IdxLeadAction): string {
  return action === "schedule_tour" || action === "contact_agent" ? "hot" : "warm";
}

function isHighIntent(action: IdxLeadAction): boolean {
  return action === "schedule_tour" || action === "contact_agent";
}

function digitsToE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+1${d}` : null;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const email = String(body.email ?? "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : null;
    const phoneRaw = body.phone ? String(body.phone).trim() : null;
    const phone = phoneRaw ? formatUsPhone(phoneRaw) : null;
    const action: IdxLeadAction = (body.action ?? "favorite") as IdxLeadAction;
    const smsConsent = body.smsConsent === true;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required." }, { status: 400 });
    }
    if (phoneRaw && !phone) {
      return NextResponse.json({ ok: false, error: "Phone must be a valid US number." }, { status: 400 });
    }

    // Resolve the lead's ZIP for coverage-based routing. searchFilters.zip
    // is the explicit signal (set by save_search). For listing-based actions
    // we fall back to extracting from the formatted address — better than
    // round-robin'ing across out-of-market agents when the data is right
    // there in the listing string.
    const filterZip = (() => {
      const raw = (body.searchFilters as { zip?: unknown } | null | undefined)?.zip;
      return typeof raw === "string" ? raw : null;
    })();
    const leadZip = filterZip ?? extractZipFromAddress(body.listingAddress ?? null);

    const agentId = await assignNextAgentForIdxLead({ zip: leadZip });

    const notesPayload = {
      idx_action: action,
      listing_id: body.listingId ?? null,
      listing_address: body.listingAddress ?? null,
      listing_price: body.listingPrice ?? null,
      search_filters: body.searchFilters ?? null,
    };

    const insert = {
      agent_id: agentId,
      name,
      email,
      phone,
      phone_number: phone,
      property_address: body.listingAddress ?? null,
      source: "idx_homes_for_sale",
      stage: pickStage(action, Boolean(phone)),
      lead_status: "new",
      lead_type: "buyer",
      intent: action,
      rating: pickRating(action),
      contact_frequency: "weekly",
      contact_method: phone && smsConsent ? "sms" : "email",
      sms_opt_in: Boolean(phone && smsConsent),
      tcpa_consent_at: phone && smsConsent ? new Date().toISOString() : null,
      tcpa_consent_source: phone && smsConsent ? "web_form" : null,
      next_contact_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // first AI touch within 5 min
      notes: JSON.stringify(notesPayload),
    } as any;

    const { data: inserted, error } = await supabaseServer
      .from("contacts")
      .insert(insert)
      .select("id")
      .single();

    if (error || !inserted?.id) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Failed to save lead." },
        { status: 500 },
      );
    }

    const leadId = String(inserted.id);

    // Audit trail (TCPA defense). Best-effort — never blocks the lead
    // capture. The contacts row already stamps tcpa_consent_at when SMS
    // consent + phone are present, but the audit row carries the EXACT
    // disclosure text (via the version tag) plus the IP + UA — the
    // load-bearing artifacts if a regulator or carrier ever asks "show
    // me proof this number consented on date X".
    const meta = extractRequestMeta(req);
    void recordInboundContactRequest({
      source: CONSENT_SOURCE_IDX_LEAD_CAPTURE,
      name,
      email,
      phone,
      subject: `idx ${action}`,
      message: typeof body.listingAddress === "string" ? body.listingAddress : null,
      smsConsent,
      emailConsent: null,
      consentDisclosureVersion: IDX_LEAD_CAPTURE_DISCLOSURE_VERSION,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      contactId: leadId,
    });

    // Best-effort: kick off the existing email follow-up sequence.
    try {
      await scheduleEmailSequenceForLeadSkipDay0(leadId);
    } catch (e) {
      console.warn("[idx-lead-capture] email sequence scheduling failed", e);
    }

    // Persist a saved-search row for the digest cron when the action is
    // save_search and we have an agent + filters. Without this row the cron
    // never runs the search alert; the contact would just sit there.
    let savedSearchId: string | null = null;
    if (action === "save_search" && agentId && body.searchFilters) {
      try {
        const criteria = idxFiltersToSavedSearchCriteria(body.searchFilters);
        const hasAnyCriterion = Object.keys(criteria).length > 0;
        if (hasAnyCriterion) {
          const created = await createSavedSearch(agentId, {
            contactId: leadId,
            name: buildSavedSearchName(criteria),
            criteria,
            alertFrequency: "daily",
          });
          savedSearchId = created.id;
        }
      } catch (e) {
        console.warn("[idx-lead-capture] saved search creation failed", e);
      }
    }

    // Schedule the 1h/24h/3d AI text follow-ups so the cron picks this lead
    // up. Requires an agent_id (the table FKs to agents). When no agent could
    // be assigned (both IDX_ROUND_ROBIN_AGENT_IDS and IDX_DEMO_AGENT_ID unset)
    // we silently skip — the email sequence still runs.

    // Speed-to-lead: fire an immediate AI SMS for high-intent actions when the
    // consumer gave a phone + TCPA consent. This is the differentiator vs.
    // FUB/BoldTrail — they send the first text from cron (~minutes later).
    // Quietly skipped if Twilio isn't configured or consent missing.
    let firstTouchSent = false;
    if (
      agentId &&
      phone &&
      smsConsent &&
      isHighIntent(action) &&
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER)
    ) {
      const idxCtx: IdxReplyContext = {
        action,
        listingId: body.listingId ?? null,
        listingAddress: body.listingAddress ?? null,
        listingPrice: body.listingPrice ?? null,
        searchFilters: body.searchFilters ?? null,
      };
      try {
        const text = await generateReply({
          lead: {
            name,
            property_address: body.listingAddress ?? null,
            intent: action,
            rating: "hot",
            source: "idx_homes_for_sale",
            lead_status: "new",
          },
          messages: [],
          task: "initial outreach to a high-intent IDX lead — they just requested contact",
          idx: idxCtx,
        });

        const to = digitsToE164(phone);
        if (to) {
          await sendSMS(to, text, leadId);
          // Persist into the conversation timeline so subsequent cron messages have context.
          try {
            await getOrCreateConversation(leadId, agentId);
            await appendMessages(leadId, agentId, [
              {
                role: "assistant",
                content: text,
                created_at: new Date().toISOString(),
                source: "idx_first_touch",
              },
            ]);
          } catch (e) {
            console.warn("[idx-lead-capture] conversation append failed", e);
          }
          // Push last_contacted_at so other automation knows we already touched.
          try {
            await supabaseServer
              .from("contacts")
              .update({ last_contacted_at: new Date().toISOString() } as Record<string, unknown>)
              .eq("id", leadId);
          } catch {}
          firstTouchSent = true;
        }
      } catch (e) {
        console.warn("[idx-lead-capture] first-touch SMS failed", e);
      }
    }

    return NextResponse.json({
      ok: true,
      leadId,
      stage: insert.stage,
      action,
      firstTouchSent,
      savedSearchId,
    });
  } catch (e: any) {
    console.error("[idx-lead-capture] error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
