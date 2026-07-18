import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOpenAIConfig } from "@/lib/ai/openaiClient";
import { findContactByPhone, toUsDisplayPhone } from "@/lib/missed-call/service";
import { hasOpenVoiceFollowUpForCall } from "@/lib/ai-call/hot-call-task";
import { recomputeLeadRating } from "@/lib/contacts/recomputeLeadRating";

/**
 * Turn a completed inbound AI receptionist call into CRM value:
 *   1. Extract the caller's lead details from Lucy's call summary (OpenAI).
 *   2. Upsert a contact by phone (agent-scoped) — never duplicates a known caller.
 *   3. Create a follow-up task (crm_tasks) linked to the contact, idempotent per
 *      call so a re-delivered webhook won't double-task.
 *
 * Best-effort throughout: a failure in any step is logged, never thrown, so the
 * call-events webhook always returns 200.
 */

type PartyType = "buyer" | "seller" | "renter" | "other";

type CallRating = "hot" | "warm" | "cold" | null;

type Extracted = {
  name: string;
  partyType: PartyType;
  interest: string;
  location: string;
  timeline: string;
  /** Lead potential from this call — drives contacts.rating so hot leads
   *  surface at the top of the list. null when we can't judge (no OpenAI). */
  rating: CallRating;
  /** ISO 639-1 code of the language the caller spoke, e.g. "en" | "zh" | "es".
   *  "" when unclear. Stored on contacts.preferred_language for future outreach. */
  language: string;
  /** Budget + property preferences the caller stated — persisted as durable
   *  contact memory (search_location, price_min/max, beds, baths). null = unknown. */
  priceMin: number | null;
  priceMax: number | null;
  beds: number | null;
  baths: number | null;
};

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Pull structured lead fields from the call summary + transcript. Degrades to a
 *  phone-only contact (no name) when OpenAI is unavailable. */
async function extractLead(summary: string, transcript: string): Promise<Extracted> {
  const fallback: Extracted = {
    name: "",
    partyType: "other",
    interest: summary.slice(0, 200),
    location: "",
    timeline: "",
    rating: null,
    language: "",
    priceMin: null,
    priceMax: null,
    beds: null,
    baths: null,
  };

  const { apiKey, model } = getOpenAIConfig();
  if (!apiKey) return fallback;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 250,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Extract the caller\'s lead details from a real-estate AI receptionist phone call. ' +
              'Return ONLY a JSON object with keys: name (caller\'s full name, or "" if not given), ' +
              'party_type (one of "buyer","seller","renter","other"), interest (one short phrase, ' +
              'e.g. "buying in Alhambra, ~$1M"), location (city/area they want to buy/rent, or the ' +
              'address they\'re selling, or ""), timeline (e.g. "2 months", or ""), ' +
              'language (ISO 639-1 code of the language the caller mainly SPOKE: "en", "zh", "es", ' +
              '"vi", "ko", etc.; "" if unclear), ' +
              'price_min (number in USD, or null), price_max (number in USD, or null), ' +
              'beds (integer bedrooms wanted, or null), baths (number of bathrooms wanted, or null), ' +
              'rating (lead potential: "hot" = ready / near-term / ' +
              'strong intent or pre-approved; "warm" = interested but exploring; "cold" = low or ' +
              'no real-estate intent, wrong number, or just a question). Use "" or null when unknown. ' +
              'Never invent details.',
          },
          {
            role: "user",
            content: `Summary:\n${summary}\n\nTranscript (may be partial):\n${transcript.slice(0, 2000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const pt = String(parsed.party_type ?? "other").toLowerCase();
    const rt = String(parsed.rating ?? "").toLowerCase();
    const lang = String(parsed.language ?? "").trim().toLowerCase().slice(0, 5);
    const bedsN = toNum(parsed.beds);
    return {
      name: String(parsed.name ?? "").trim().slice(0, 120),
      partyType: (["buyer", "seller", "renter", "other"].includes(pt) ? pt : "other") as PartyType,
      interest: String(parsed.interest ?? "").trim().slice(0, 200),
      location: String(parsed.location ?? "").trim().slice(0, 120),
      timeline: String(parsed.timeline ?? "").trim().slice(0, 80),
      rating: (["hot", "warm", "cold"].includes(rt) ? rt : null) as CallRating,
      language: /^[a-z]{2}$/.test(lang) ? lang : "",
      priceMin: toNum(parsed.price_min),
      priceMax: toNum(parsed.price_max),
      beds: bedsN != null ? Math.round(bedsN) : null,
      baths: toNum(parsed.baths),
    };
  } catch {
    return fallback;
  }
}

/** Durable contact memory from a call — only the fields the AI actually captured,
 *  so a later call refreshes what's known without wiping prior values. For a
 *  buyer/renter, `location` is where they want to buy (→ search_location); for a
 *  seller it's the address they're selling (→ property_address). */
function contactMemoryPatch(
  ex: Extracted,
  opts: { includeName: boolean },
): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (opts.includeName && ex.name) p.name = ex.name;
  if (ex.language) p.preferred_language = ex.language;
  if (ex.location) {
    if (ex.partyType === "seller") p.property_address = ex.location;
    else p.search_location = ex.location;
  }
  if (ex.priceMin != null) p.price_min = ex.priceMin;
  if (ex.priceMax != null) p.price_max = ex.priceMax;
  if (ex.beds != null) p.beds = ex.beds;
  if (ex.baths != null) p.baths = ex.baths;
  if (ex.timeline) p.timeline = ex.timeline;
  return p;
}

export async function captureLeadFromInboundCall(args: {
  agentId: string;
  fromPhone: string; // E.164 caller
  summary: string;
  transcript?: string;
  providerCallId: string; // Retell call_id
}): Promise<{ contactId: string | null; taskId: string | null; created: boolean }> {
  const summary = (args.summary || "").trim();
  if (!summary) return { contactId: null, taskId: null, created: false };

  const ex = await extractLead(summary, args.transcript || "");
  const display = toUsDisplayPhone(args.fromPhone) || args.fromPhone;

  // 1. Upsert contact by phone (agent-scoped) — reuse the known-caller match.
  let contactId: string | null = null;
  let existingName: string | null = null;
  try {
    const existing = await findContactByPhone(args.agentId, args.fromPhone);
    if (existing) {
      contactId = existing.id;
      existingName = existing.name;
    }
  } catch {
    // fall through to insert
  }

  if (!contactId) {
    const row: Record<string, unknown> = {
      agent_id: args.agentId,
      name: ex.name || null,
      phone: display,
      phone_number: display,
      source: "ai_receptionist",
      lead_status: "new",
      notes: `AI receptionist call: ${summary}`,
      // Durable memory captured on this call: language, area, budget, beds/baths.
      ...contactMemoryPatch(ex, { includeName: false }),
    };
    if (ex.partyType === "buyer" || ex.partyType === "seller") row.type = ex.partyType;
    // Note: the lead's rating is set by the composite recomputeLeadRating below
    // (off a `call_rated` event), not written directly here.
    try {
      const { data, error } = await supabaseAdmin
        .from("contacts")
        .insert(row as never)
        .select("id")
        .single();
      if (error) console.error("[lead-capture] contact insert:", error.message);
      else if (data) contactId = String((data as { id: unknown }).id);
    } catch (e) {
      console.error("[lead-capture] contact insert threw:", e);
    }
  } else {
    // Known caller — refresh their memory with anything new from this call
    // (name if we lacked it, language, area, budget, beds/baths, timeline).
    // Only fields the AI captured are included, so we never wipe prior values.
    const patch = contactMemoryPatch(ex, {
      includeName: !(existingName && existingName.trim()),
    });
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      try {
        await supabaseAdmin
          .from("contacts")
          .update(patch as never)
          .eq("id", contactId as never);
      } catch {
        /* best-effort */
      }
    }
  }

  if (!contactId) return { contactId: null, taskId: null, created: false };

  // 2. Follow-up task — ONLY for calls that captured an actionable lead.
  // A greeting, a wrong number, or a quick disconnect is already in the call
  // log; it shouldn't manufacture a high-priority to-do that just goes overdue.
  // "Actionable" = the AI identified a buyer/seller/renter or a stated timeline.
  // (interest is not a signal — it falls back to the call summary, so it's
  // almost always set.)
  const actionable =
    ex.partyType === "buyer" ||
    ex.partyType === "seller" ||
    ex.partyType === "renter" ||
    Boolean(ex.timeline.trim());
  if (!actionable) {
    return { contactId, taskId: null, created: false };
  }

  // Idempotent per call (a re-delivered webhook won't double-task).
  try {
    if (await hasOpenVoiceFollowUpForCall(contactId, args.providerCallId)) {
      return { contactId, taskId: null, created: false };
    }
  } catch {
    /* if the check fails, fall through and attempt the insert */
  }

  const who = ex.name || display;
  const typeLabel =
    ex.partyType === "buyer" ? "buyer" : ex.partyType === "seller" ? "seller" : ex.partyType === "renter" ? "renter" : "";
  const title = `Follow up with ${who}${typeLabel ? ` (${typeLabel})` : ""} — AI call`;
  const description = [
    ex.interest ? `Interest: ${ex.interest}` : "",
    ex.location ? `Area: ${ex.location}` : "",
    ex.timeline ? `Timeline: ${ex.timeline}` : "",
    summary,
    "Captured by Lucy (AI receptionist).",
  ]
    .filter(Boolean)
    .join("\n\n");
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  let taskId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("crm_tasks")
      .insert({
        agent_id: args.agentId,
        contact_id: contactId,
        title,
        description,
        status: "open",
        priority: "high",
        task_type: "voice_follow_up",
        source: "ai_call",
        due_at: dueAt,
        metadata_json: {
          twilio_call_sid: args.providerCallId,
          reason: "ai_inbound_lead",
          party_type: ex.partyType,
          captured_by: "ai_receptionist",
        },
      } as never)
      .select("id")
      .single();
    if (error) console.error("[lead-capture] task insert:", error.message);
    else if (data) taskId = String((data as { id: unknown }).id);
  } catch (e) {
    console.error("[lead-capture] task insert threw:", e);
  }

  // 3. Timeline event (best-effort).
  try {
    await supabaseAdmin.from("contact_events").insert({
      contact_id: contactId,
      agent_id: args.agentId,
      event_type: "ai_lead_captured",
      metadata: { retell_call_id: args.providerCallId, task_id: taskId, party_type: ex.partyType },
    } as never);
  } catch {
    /* best-effort */
  }

  // 4. Feed this call's rating into the composite lead rating.
  if (ex.rating) {
    try {
      await supabaseAdmin.from("contact_events").insert({
        contact_id: contactId,
        agent_id: args.agentId,
        event_type: "call_rated",
        source: "ai_call",
        payload: { rating: ex.rating, retell_call_id: args.providerCallId } as never,
      } as never);
    } catch {
      /* best-effort */
    }
  }
  try {
    await recomputeLeadRating(contactId);
  } catch {
    /* best-effort */
  }

  return { contactId, taskId, created: true };
}

export type CallOutcome = {
  interest: "interested" | "not_interested" | "unknown";
  /** Lead potential from this call (drives contacts.rating). */
  rating: CallRating;
};

/**
 * Read an AI call and judge both the caller's interest (to decide whether to
 * keep nurturing or close them out) AND their lead potential (to rate the
 * lead). Degrades to interest="unknown"/rating=null when OpenAI is unavailable
 * or ambiguous — we only ever close on a clear decline.
 */
export async function classifyCallInterest(
  summary: string,
  transcript?: string,
): Promise<CallOutcome> {
  const none: CallOutcome = { interest: "unknown", rating: null };
  if (!summary.trim()) return none;
  const { apiKey, model } = getOpenAIConfig();
  if (!apiKey) return none;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 30,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You read a real-estate AI phone call and return ONLY JSON {"interest":"interested"|"not_interested"|"unknown","rating":"hot"|"warm"|"cold"}. ' +
              'interest: "not_interested" ONLY on a clear decline — stop / not interested / remove me / do not call / wrong number / no real-estate need; "interested" when they want to buy/sell/rent/tour or asked for follow-up; "unknown" if unclear. ' +
              'rating: "hot" = ready / near-term / strong intent or pre-approved; "warm" = interested but exploring; "cold" = low or no intent.',
          },
          {
            role: "user",
            content: `Summary:\n${summary}\n\nTranscript (may be partial):\n${(transcript ?? "").slice(0, 2000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return none;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as {
      interest?: unknown;
      rating?: unknown;
    };
    const i = String(parsed.interest ?? "").toLowerCase();
    const r = String(parsed.rating ?? "").toLowerCase();
    return {
      interest: i === "interested" || i === "not_interested" ? i : "unknown",
      rating: (["hot", "warm", "cold"].includes(r) ? r : null) as CallRating,
    };
  } catch {
    return none;
  }
}

/**
 * Close a contact out as not-interested: archive them + stamp lead_status, so
 * they drop out of active follow-up AND the leads-only call-back gate
 * (scheduleCallBacks) won't re-start a ladder if they're dialed again.
 */
export async function markContactNotInterested(contactId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("contacts")
      .update({
        lead_status: "not_interested",
        lifecycle_stage: "archived",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", contactId as never);
    await supabaseAdmin.from("contact_events").insert({
      contact_id: contactId,
      event_type: "closed_not_interested",
      metadata: { by: "ai_follow_up_call" },
    } as never);
  } catch (e) {
    console.error("[lead-capture] markContactNotInterested:", e);
  }
}
