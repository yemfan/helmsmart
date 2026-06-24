import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { recomputeLeadRating } from "@/lib/contacts/recomputeLeadRating";
import type {
  OpenHouseRow,
  OpenHouseVisitorRow,
  VisitorBuyerStatus,
  VisitorTimeline,
} from "./types";

/**
 * Public (unauthenticated) service for the open-house sign-in flow.
 *
 * The only auth is the 12-char `signin_slug` — which is effectively a
 * capability token. Anyone with the URL can sign in. That's by
 * design: the agent shares a QR code on an iPad at the door.
 *
 * Trust boundary:
 *   * NEVER expose agent_id or any fields an authed agent would
 *     care about keeping private.
 *   * Return ONLY the fields the public form + post-signin confirmation
 *     page needs: property address, start/end, agent first name.
 *   * Writes are scoped to a visitor row tied to this open_house_id.
 *     Abuse surface is limited to dumping junk visitor rows — not
 *     great, but not a security hole. Add hCaptcha when it becomes a
 *     real problem.
 *
 * Visitor → contact intake: if the visitor has email or phone AND
 * is_buyer_agented=false, we upsert a contacts row with
 * source='Open House' so the agent has a record of every visitor
 * who walked through the door. If the visitor has their own agent,
 * we capture them for the agent's records but do NOT create a CRM
 * contact — doing so would breach Realtor® code-of-ethics.
 *
 * marketing_consent is recorded on the visitor row but does NOT
 * gate capture. Any auto-outreach (open-house-followups cron,
 * instant-reply) explicitly filters marketing_consent=true before
 * sending, so capture and marketing stay separate concerns.
 */

export type PublicOpenHouseInfo = {
  slug: string;
  propertyAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  listPrice: number | null;
  mlsUrl: string | null;
  startAt: string;
  endAt: string;
  hostAgentFirstName: string | null;
  hostAgentHeadline: string | null;
  status: OpenHouseRow["status"];
  /** Best-effort property details — pulled from the warehouse snapshot
   *  if a row exists for this address. Visitors browsing the sign-in
   *  page like to see beds/baths/sqft at a glance before they walk in.
   *  Any field can be null when the warehouse doesn't have it. */
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
};

export async function getPublicOpenHouseBySlug(
  slug: string,
): Promise<PublicOpenHouseInfo | null> {
  const { data, error } = await supabaseAdmin
    .from("open_houses")
    .select(
      "id, signin_slug, agent_id, property_address, city, state, zip, list_price, mls_url, start_at, end_at, status",
    )
    .eq("signin_slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as OpenHouseRow;

  // Pull agent's first name for a personal touch on the page. Never
  // return agent_id or email to the public. Best-effort — if the agent
  // row fetch fails, we just omit it.
  let firstName: string | null = null;
  let headline: string | null = null;
  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("first_name, brokerage_name")
      .eq("id", row.agent_id)
      .maybeSingle();
    const a = agentRow as { first_name: string | null; brokerage_name: string | null } | null;
    firstName = a?.first_name ?? null;
    headline = a?.brokerage_name ?? null;
  } catch {
    // non-fatal
  }

  // Best-effort enrichment from the property warehouse — beds/baths/
  // sqft/year_built/property_type. Lets the public sign-in page show
  // a quick property card without exposing anything that would leak
  // agent-side data. Match on the same address string the agent
  // entered when scheduling the open house — case-insensitive so a
  // "Los Angeles" vs "los angeles" mismatch doesn't drop the data.
  let beds: number | null = null;
  let baths: number | null = null;
  let sqft: number | null = null;
  let yearBuilt: number | null = null;
  let propertyType: string | null = null;
  try {
    const { data: propertyRow } = await supabaseAdmin
      .from("properties_warehouse")
      .select("beds, baths, sqft, year_built, property_type")
      .ilike("address", row.property_address)
      .maybeSingle();
    const p = propertyRow as
      | {
          beds: number | null;
          baths: number | null;
          sqft: number | null;
          year_built: number | null;
          property_type: string | null;
        }
      | null;
    if (p) {
      beds = p.beds;
      baths = p.baths;
      sqft = p.sqft;
      yearBuilt = p.year_built;
      propertyType = p.property_type;
    }
  } catch {
    // non-fatal
  }

  return {
    slug: row.signin_slug,
    propertyAddress: row.property_address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    listPrice: row.list_price,
    mlsUrl: row.mls_url,
    startAt: row.start_at,
    endAt: row.end_at,
    hostAgentFirstName: firstName,
    hostAgentHeadline: headline,
    status: row.status,
    beds,
    baths,
    sqft,
    yearBuilt,
    propertyType,
  };
}

// ── Sign-in write path ────────────────────────────────────────────────

export type PublicSigninInput = {
  slug: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  isBuyerAgented: boolean;
  buyerAgentName: string | null;
  buyerAgentBrokerage: string | null;
  timeline: VisitorTimeline | null;
  buyerStatus: VisitorBuyerStatus | null;
  marketingConsent: boolean;
  notes: string | null;
};

export type PublicSigninResult = {
  visitorId: string;
  contactCreated: boolean;
};

export async function recordPublicSignin(
  input: PublicSigninInput,
): Promise<PublicSigninResult> {
  if (!input.slug) throw new Error("Missing slug");

  // Soft validation: must provide at least name or email or phone.
  // Empty submissions are noise, not useful leads.
  if (!(input.name || input.email || input.phone)) {
    throw new Error("Please enter at least your name, email, or phone.");
  }

  // Look up the open house by slug. 404 if not found or cancelled.
  const { data: ohData, error } = await supabaseAdmin
    .from("open_houses")
    .select("id, agent_id, status, property_address, start_at, end_at")
    .eq("signin_slug", input.slug)
    .maybeSingle();
  if (error || !ohData) throw new Error("Open house not found");
  const oh = ohData as Pick<
    OpenHouseRow,
    "id" | "agent_id" | "status" | "property_address" | "start_at" | "end_at"
  >;
  if (oh.status === "cancelled") {
    throw new Error("This open house has been cancelled.");
  }

  // Insert the visitor row.
  const { data: visitorData, error: visitorErr } = await supabaseAdmin
    .from("open_house_visitors")
    .insert({
      open_house_id: oh.id,
      agent_id: oh.agent_id,
      name: trim(input.name),
      email: trim(input.email),
      phone: trim(input.phone),
      is_buyer_agented: input.isBuyerAgented,
      buyer_agent_name: input.isBuyerAgented ? trim(input.buyerAgentName) : null,
      buyer_agent_brokerage: input.isBuyerAgented ? trim(input.buyerAgentBrokerage) : null,
      timeline: input.timeline,
      buyer_status: input.buyerStatus,
      marketing_consent: input.marketingConsent,
      notes: trim(input.notes),
    })
    .select("*")
    .single();
  if (visitorErr || !visitorData) {
    throw new Error(visitorErr?.message ?? "Failed to record sign-in");
  }
  const visitor = visitorData as OpenHouseVisitorRow;

  // Conditionally upsert a CRM contact. Skip when:
  //   - Visitor is already agented (ethics — Realtor® code-of-ethics
  //     prohibits poaching another agent's client).
  //   - No email AND no phone (can't follow up anyway).
  //
  // Note: marketing_consent is NO LONGER a gate for capture — every
  // non-agented sign-in becomes a lead in the agent's CRM so they
  // have a record of who walked through the door. The
  // marketing_consent flag is still recorded on the visitor row,
  // and the open-house-followups cron respects it before sending
  // any auto-outreach (see app/api/cron/open-house-followups). This
  // keeps capture (always allowed for non-agented visitors with
  // contact info) separate from marketing (gated on consent).
  let contactCreated = false;
  const hasContactReach = Boolean(visitor.email || visitor.phone);
  if (!input.isBuyerAgented && hasContactReach) {
    try {
      const contactId = await upsertContactFromVisitor(oh.agent_id, visitor, oh.property_address);
      if (contactId) {
        await supabaseAdmin
          .from("open_house_visitors")
          .update({ contact_id: contactId })
          .eq("id", visitor.id);
        contactCreated = true;
        // Feed open-house attendance into the composite lead rating.
        try {
          await supabaseAdmin.from("contact_events").insert({
            contact_id: contactId,
            agent_id: oh.agent_id,
            event_type: "open_house_signin",
            source: "open_house",
            payload: { timeline: visitor.timeline ?? null, property_address: oh.property_address } as never,
          } as never);
          await recomputeLeadRating(contactId);
        } catch {
          /* best-effort */
        }
      }
    } catch (err) {
      // Don't fail the sign-in if contact intake fails — the visitor
      // row still carries all the info, and an agent can manually
      // convert later.
      console.error(
        "[open-houses.publicService] contact upsert failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { visitorId: visitor.id, contactCreated };
}

async function upsertContactFromVisitor(
  agentId: string,
  visitor: OpenHouseVisitorRow,
  propertyAddress: string,
): Promise<string | null> {
  // De-dupe by email or phone within the agent's contacts. First match wins.
  const orParts: string[] = [];
  if (visitor.email) orParts.push(`email.eq.${visitor.email}`);
  if (visitor.phone) orParts.push(`phone.eq.${visitor.phone}`);
  if (visitor.phone) orParts.push(`phone_number.eq.${visitor.phone}`);

  if (orParts.length) {
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("agent_id", agentId)
      .or(orParts.join(","))
      .limit(1)
      .maybeSingle();
    const existingId = (existing as { id: string } | null)?.id ?? null;
    if (existingId) {
      // Bump source/notes without clobbering richer existing data.
      await supabaseAdmin
        .from("contacts")
        .update({
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
      return existingId;
    }
  }

  // Split the name heuristically — "First Last" with leftover → last_name
  // gets everything after the first token.
  const nameParts = (visitor.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.slice(1).join(" ") || null;

  const { data: inserted, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      agent_id: agentId,
      first_name: firstName,
      last_name: lastName,
      name: visitor.name,
      email: visitor.email,
      phone: visitor.phone,
      phone_number: visitor.phone,
      source: "Open House",
      // Timeline "now" or "3_6_months" → hot. Otherwise warm.
      rating: visitor.timeline === "now" || visitor.timeline === "3_6_months" ? "hot" : "warm",
      property_address: propertyAddress,
      notes: visitor.notes,
      last_contacted_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(
      "[open-houses.publicService] contact insert error:",
      error.message,
    );
    return null;
  }
  return (inserted as { id: string } | null)?.id ?? null;
}

function trim(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
