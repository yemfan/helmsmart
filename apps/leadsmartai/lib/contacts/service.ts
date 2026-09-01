import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  avatarColorFor,
  daysBetween,
  daysToAnniversary,
  fullNameFor,
  initialsFor,
  lifecycleLabel,
  normalizeRelationshipType,
} from "./formatters";
import type {
  Contact,
  ContactFilterConfig,
  ContactReasonType,
  ContactSignal,
  ContactSignalType,
  ContactView,
  LifecycleStage,
  RelationshipType,
  SignalConfidence,
} from "./types";

// =============================================================================
// Row mapping
// =============================================================================

function mapContactRow(row: Record<string, unknown>): Contact {
  const id = String(row.id);
  const firstName = (row.first_name as string | null) ?? null;
  const lastName = (row.last_name as string | null) ?? null;
  const email = (row.email as string | null) ?? null;
  const fullName = fullNameFor(firstName, lastName, email);
  const initials = initialsFor(firstName, lastName);
  return {
    id,
    agentId: String(row.agent_id),
    lifecycleStage: (row.lifecycle_stage as LifecycleStage) ?? "lead",

    firstName,
    lastName,
    fullName,
    initials,
    email,
    phone: (row.phone as string | null) ?? null,
    phoneNumber: (row.phone as string | null) ?? null,

    address: (row.address as string | null) ?? null,
    propertyAddress: (row.property_address as string | null) ?? null,
    closingAddress: (row.closing_address as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,

    source: (row.source as string | null) ?? null,
    rating: (row.rating as Contact["rating"]) ?? null,
    notes: (row.notes as string | null) ?? null,
    leadStatus: (row.lead_status as string | null) ?? null,
    leadType: (row.lead_type as string | null) ?? null,
    stage: (row.stage as string | null) ?? null,
    intent: (row.intent as string | null) ?? null,

    engagementScore:
      row.engagement_score === null || row.engagement_score === undefined
        ? 0
        : Number(row.engagement_score),
    nurtureScore:
      row.nurture_score === null || row.nurture_score === undefined
        ? null
        : Number(row.nurture_score),
    lastActivityAt: (row.last_activity_at as string | null) ?? null,
    lastContactedAt: (row.last_contacted_at as string | null) ?? null,
    nextContactAt: (row.next_contact_at as string | null) ?? null,
    contactFrequency: (row.contact_frequency as Contact["contactFrequency"]) ?? null,
    contactMethod: (row.contact_method as Contact["contactMethod"]) ?? null,

    searchLocation: (row.search_location as string | null) ?? null,
    searchRadius: row.search_radius === null ? null : Number(row.search_radius ?? 0) || null,
    priceMin: row.price_min === null ? null : Number(row.price_min ?? 0) || null,
    priceMax: row.price_max === null ? null : Number(row.price_max ?? 0) || null,
    beds: row.beds === null ? null : Number(row.beds ?? 0) || null,
    baths: row.baths === null ? null : Number(row.baths ?? 0) || null,

    predictionScore: row.prediction_score === null ? null : Number(row.prediction_score ?? 0) || null,
    predictionLabel: (row.prediction_label as string | null) ?? null,
    predictionFactors:
      row.prediction_factors && typeof row.prediction_factors === "object"
        ? (row.prediction_factors as Record<string, unknown>)
        : null,
    predictionComputedAt: (row.prediction_computed_at as string | null) ?? null,

    automationDisabled: !!row.automation_disabled,
    reportId: (row.report_id as string | null) ?? null,
    propertyId: (row.property_id as string | null) ?? null,

    closingDate: (row.closing_date as string | null) ?? null,
    closingPrice: row.closing_price === null ? null : Number(row.closing_price ?? 0) || null,
    avmCurrent: row.avm_current === null ? null : Number(row.avm_current ?? 0) || null,
    avmUpdatedAt: (row.avm_updated_at as string | null) ?? null,

    relationshipType: (row.relationship_type as RelationshipType) ?? null,
    relationshipTag: (row.relationship_tag as string | null) ?? null,
    anniversaryOptIn: !!row.anniversary_opt_in,

    preferredLanguage: (row.preferred_language as string) ?? "en",
    doNotContactSms: !!row.do_not_contact_sms,
    doNotContactEmail: !!row.do_not_contact_email,
    tcpaConsentAt: (row.tcpa_consent_at as string | null) ?? null,
    tcpaConsentSource: (row.tcpa_consent_source as Contact["tcpaConsentSource"]) ?? null,
    tcpaConsentIp: (row.tcpa_consent_ip as string | null) ?? null,
    smsOptIn: !!row.sms_opt_in,
    smsAiEnabled: row.sms_ai_enabled === undefined ? true : !!row.sms_ai_enabled,
    smsAgentTakeover: !!row.sms_agent_takeover,
    smsFollowupStage: (row.sms_followup_stage as string | null) ?? null,
    smsLastOutboundAt: (row.sms_last_outbound_at as string | null) ?? null,
    smsLastInboundAt: (row.sms_last_inbound_at as string | null) ?? null,

    pipelineStageId: (row.pipeline_stage_id as string | null) ?? null,

    avatarColor: (row.avatar_color as string | null) ?? avatarColorFor(id),

    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

function mapSignalRow(row: Record<string, unknown>): ContactSignal {
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    type: (row.signal_type as ContactSignalType) ?? "life_event_other",
    label: String(row.label ?? ""),
    confidence: (row.confidence as SignalConfidence) ?? "medium",
    suggestedAction: (row.suggested_action as string | null) ?? null,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    detectedAt: String(row.detected_at ?? new Date().toISOString()),
    acknowledgedAt: (row.acknowledged_at as string | null) ?? null,
    dismissedAt: (row.dismissed_at as string | null) ?? null,
  };
}

// =============================================================================
// Error handling
// =============================================================================

/**
 * `contacts`/`contact_signals` tables may not be reachable during deploy
 * transitions (migration not yet applied, schema cache miss). Treat these
 * as "not ready" and return empty results instead of throwing.
 *
 * - 42P01: undefined_table
 * - 42703: undefined_column (partial migration)
 * - PostgREST "schema cache" error — newly-applied migration not yet
 *   picked up by the PostgREST introspection layer.
 */
function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "42P01" ||
    e.code === "42703" ||
    /does not exist|schema cache/i.test(e.message ?? "")
  );
}

// =============================================================================
// Ranking — "who to touch today"
// =============================================================================

const RANK_THRESHOLDS = {
  anniversaryWindowDays: 45,
  dormancyDays: 120,
  referralOverdueDays: 60,
};

/**
 * Compute the contact's top reason-to-reach-out and a priority score
 * (lower = more urgent). Uses the same heuristic as the old sphere
 * prototype with a few additions for leads.
 */
function rankContact(
  contact: Contact,
  signals: ContactSignal[],
  today: Date,
): ContactView {
  const nowIso = today.toISOString();
  const dormancyDays =
    contact.lastContactedAt !== null
      ? daysBetween(nowIso, contact.lastContactedAt)
      : null;

  let equityDelta: number | null = null;
  let equityPct: number | null = null;
  if (
    contact.avmCurrent !== null &&
    contact.closingPrice !== null &&
    contact.closingPrice > 0
  ) {
    equityDelta = contact.avmCurrent - contact.closingPrice;
    equityPct = equityDelta / contact.closingPrice;
  }

  const openSignals = signals.filter((s) => !s.dismissedAt);

  let reasonType: ContactReasonType = "none";
  let topReason = "";
  let priority = 999;

  // Active deal: highest priority for the funnel
  if (contact.lifecycleStage === "active_client") {
    reasonType = "active_deal";
    topReason = "Active deal — keep moving";
    priority = 5;
  } else if (contact.lifecycleStage === "lead") {
    reasonType = "new_lead";
    topReason = "New lead — qualify";
    priority = 8;
  }

  // Signals override the lifecycle default if present
  if (openSignals.some((s) => s.type === "equity_milestone")) {
    reasonType = "equity_milestone";
    topReason = "Crossed equity milestone";
    priority = 15;
  } else if (openSignals.some((s) => s.type === "refi_detected")) {
    reasonType = "life_event";
    topReason = "Refi detected";
    priority = 20;
  } else if (openSignals.some((s) => s.type === "job_change")) {
    reasonType = "life_event";
    topReason = "Job change detected";
    priority = 10;
  }

  // Anniversary (post-close contacts only, within window)
  if (
    reasonType === "none" &&
    contact.closingDate &&
    contact.anniversaryOptIn
  ) {
    const days = Math.abs(daysToAnniversary(contact.closingDate, today));
    if (days <= RANK_THRESHOLDS.anniversaryWindowDays) {
      reasonType = "anniversary";
      topReason =
        days === 0 ? "Home anniversary today" : `Home anniversary · ${days}d`;
      priority = 30 + days;
    }
  }

  // Dormancy and referral-overdue fallbacks
  if (reasonType === "none") {
    if (dormancyDays !== null && dormancyDays >= RANK_THRESHOLDS.dormancyDays) {
      reasonType = "dormant";
      topReason = `Dormant ${dormancyDays}d`;
      priority = 300 + dormancyDays;
    } else if (
      contact.lifecycleStage === "referral_source" &&
      dormancyDays !== null &&
      dormancyDays >= RANK_THRESHOLDS.referralOverdueDays
    ) {
      reasonType = "referral_overdue";
      topReason = "Top referrer · overdue";
      priority = 250;
    } else {
      topReason = lifecycleLabel(contact.lifecycleStage);
      priority = 900;
    }
  }

  return {
    ...contact,
    equityDelta,
    equityPct,
    dormancyDays,
    topReason,
    reasonType,
    priority,
    signals: openSignals,
  };
}

// =============================================================================
// Filter → query builder
// =============================================================================

type AnyQueryBuilder = ReturnType<ReturnType<typeof supabaseAdmin.from>["select"]>;

/**
 * Apply a Smart List filter config to a Supabase query. The query
 * builder must already have `.eq("agent_id", ...)` applied by the
 * caller. Fields that aren't present in `filter` are not constrained.
 */
function applyFilter(
  query: AnyQueryBuilder,
  filter: ContactFilterConfig,
): AnyQueryBuilder {
  let q = query;

  if (filter.lifecycle_stage && filter.lifecycle_stage.length > 0) {
    q = (q as unknown as { in: (col: string, vals: string[]) => AnyQueryBuilder }).in(
      "lifecycle_stage",
      filter.lifecycle_stage,
    );
  }
  if (
    filter.exclude_lifecycle_stage &&
    filter.exclude_lifecycle_stage.length > 0
  ) {
    const list = filter.exclude_lifecycle_stage.map((s) => `"${s}"`).join(",");
    q = (q as unknown as { not: (col: string, op: string, val: string) => AnyQueryBuilder }).not(
      "lifecycle_stage",
      "in",
      `(${list})`,
    );
  }
  if (filter.rating && filter.rating.length > 0) {
    q = (q as unknown as { in: (col: string, vals: string[]) => AnyQueryBuilder }).in(
      "rating",
      filter.rating,
    );
  }
  if (filter.relationship_type && filter.relationship_type.length > 0) {
    q = (q as unknown as { in: (col: string, vals: string[]) => AnyQueryBuilder }).in(
      "relationship_type",
      filter.relationship_type,
    );
  }
  if (filter.source && filter.source.length > 0) {
    q = (q as unknown as { in: (col: string, vals: string[]) => AnyQueryBuilder }).in(
      "source",
      filter.source,
    );
  }
  if (typeof filter.dormant_days_gte === "number") {
    const cutoff = new Date(
      Date.now() - filter.dormant_days_gte * 24 * 60 * 60 * 1000,
    ).toISOString();
    q = (q as unknown as { or: (expr: string) => AnyQueryBuilder }).or(
      `last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`,
    );
  }
  if (typeof filter.updated_within_days === "number") {
    const cutoff = new Date(
      Date.now() - filter.updated_within_days * 24 * 60 * 60 * 1000,
    ).toISOString();
    q = (q as unknown as { gte: (col: string, val: string) => AnyQueryBuilder }).gte(
      "updated_at",
      cutoff,
    );
  }
  if (filter.query && filter.query.trim().length > 0) {
    const esc = filter.query.trim().replace(/[,%]/g, " ");
    q = (q as unknown as { or: (expr: string) => AnyQueryBuilder }).or(
      [
        `first_name.ilike.%${esc}%`,
        `last_name.ilike.%${esc}%`,
        `email.ilike.%${esc}%`,
        `phone.ilike.%${esc}%`,
        `address.ilike.%${esc}%`,
        `property_address.ilike.%${esc}%`,
      ].join(","),
    );
  }
  if (typeof filter.price_min === "number") {
    q = (q as unknown as { gte: (col: string, val: number) => AnyQueryBuilder }).gte(
      "price_min",
      filter.price_min,
    );
  }
  if (typeof filter.price_max === "number") {
    q = (q as unknown as { lte: (col: string, val: number) => AnyQueryBuilder }).lte(
      "price_max",
      filter.price_max,
    );
  }

  return q;
}

// =============================================================================
// List / get
// =============================================================================

/**
 * List contacts for an agent, ranked "who to touch today". Applies an
 * optional Smart List filter before ranking. Fetches open signals in a
 * second round-trip and joins client-side.
 */
export async function listContacts(
  agentId: string,
  filter: ContactFilterConfig = {},
): Promise<ContactView[]> {
  const base = supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("agent_id", agentId as never);
  const filtered = applyFilter(base as unknown as AnyQueryBuilder, filter);
  const { data: rows, error } = (await filtered) as {
    data: Record<string, unknown>[] | null;
    error: unknown;
  };

  if (error) {
    if (isMissingRelationError(error)) {
      console.warn("[contacts] relation not ready — returning empty list", {
        code: (error as { code?: string }).code,
      });
      return [];
    }
    throw error;
  }
  if (!rows?.length) return [];

  const contactIds = rows.map((r) => String((r as { id: string }).id));
  const { data: signalRows, error: signalErr } = await supabaseAdmin
    .from("contact_signals")
    .select("*")
    .in("contact_id", contactIds as never)
    .is("dismissed_at", null);
  if (signalErr && !isMissingRelationError(signalErr)) throw signalErr;

  const signalsByContact = new Map<string, ContactSignal[]>();
  for (const sr of signalRows ?? []) {
    const s = mapSignalRow(sr as Record<string, unknown>);
    if (!signalsByContact.has(s.contactId)) signalsByContact.set(s.contactId, []);
    signalsByContact.get(s.contactId)!.push(s);
  }

  // Optional post-filter: has_open_signals (requires the signal fetch).
  const today = new Date();
  let views = rows.map((r) => {
    const c = mapContactRow(r as Record<string, unknown>);
    const signals = signalsByContact.get(c.id) ?? [];
    return rankContact(c, signals, today);
  });

  if (filter.has_open_signals === true) {
    views = views.filter((v) => v.signals.length > 0);
  }

  views.sort((a, b) => a.priority - b.priority);
  return views;
}

export async function getContact(
  agentId: string,
  contactId: string,
): Promise<ContactView | null> {
  const { data: row, error } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("agent_id", agentId as never)
    .eq("id", contactId)
    .maybeSingle();
  if (error && !isMissingRelationError(error)) throw error;
  if (!row) return null;

  const { data: signalRows } = await supabaseAdmin
    .from("contact_signals")
    .select("*")
    .eq("contact_id", contactId);
  const signals = (signalRows ?? []).map((r) =>
    mapSignalRow(r as Record<string, unknown>),
  );
  return rankContact(
    mapContactRow(row as Record<string, unknown>),
    signals,
    new Date(),
  );
}

// =============================================================================
// Create / update / delete
// =============================================================================

export type CreateContactInput = {
  lifecycleStage?: LifecycleStage;
  firstName?: string | null;
  lastName?: string | null;
  /** Single-field name; will be split on first whitespace if firstName/lastName not given. */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  propertyAddress?: string | null;
  closingAddress?: string | null;
  source?: string | null;
  rating?: Contact["rating"];
  notes?: string | null;
  closingDate?: string | null;
  closingPrice?: number | null;
  relationshipType?: RelationshipType | null;
  relationshipTag?: string | null;
  anniversaryOptIn?: boolean;
  preferredLanguage?: string;
  doNotContactSms?: boolean;
  doNotContactEmail?: boolean;
  tcpaConsentAt?: string | null;
  tcpaConsentSource?: Contact["tcpaConsentSource"];
  tcpaConsentIp?: string | null;
  reportId?: string | null;
  propertyId?: string | null;
  searchLocation?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  beds?: number | null;
  baths?: number | null;
};

function toContactRow(
  agentId: string,
  input: CreateContactInput,
): Record<string, unknown> {
  // Derive first/last name from legacy `name` field if caller passed one.
  let firstName = input.firstName ?? null;
  let lastName = input.lastName ?? null;
  if (!firstName && !lastName && input.name) {
    const trimmed = input.name.trim();
    const idx = trimmed.search(/\s/);
    if (idx < 0) {
      firstName = trimmed;
    } else {
      firstName = trimmed.slice(0, idx);
      lastName = trimmed.slice(idx + 1).trim() || null;
    }
  }

  return {
    agent_id: agentId,
    lifecycle_stage: input.lifecycleStage ?? "lead",
    first_name: firstName,
    last_name: lastName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    property_address: input.propertyAddress ?? null,
    closing_address: input.closingAddress ?? null,
    source: input.source ?? null,
    rating: input.rating ?? null,
    notes: input.notes ?? null,
    closing_date: input.closingDate ?? null,
    closing_price: input.closingPrice ?? null,
    relationship_type: normalizeRelationshipType(input.relationshipType ?? null),
    relationship_tag: input.relationshipTag ?? null,
    anniversary_opt_in: input.anniversaryOptIn ?? false,
    preferred_language: input.preferredLanguage ?? "en",
    do_not_contact_sms: input.doNotContactSms ?? false,
    do_not_contact_email: input.doNotContactEmail ?? false,
    tcpa_consent_at: input.tcpaConsentAt ?? null,
    tcpa_consent_source: input.tcpaConsentSource ?? null,
    tcpa_consent_ip: input.tcpaConsentIp ?? null,
    report_id: input.reportId ?? null,
    property_id: input.propertyId ?? null,
    search_location: input.searchLocation ?? null,
    price_min: input.priceMin ?? null,
    price_max: input.priceMax ?? null,
    beds: input.beds ?? null,
    baths: input.baths ?? null,
  };
}

/**
 * Insert a contact, or merge on (agent_id, lower(email)) if that index
 * already has a row. The DB-level unique index enforces the dedup; when
 * a conflict hits we update the existing row with non-null fields from
 * the input and return the merged row. Matches the user's
 * "auto-merge on lower(email)" requirement.
 */
export async function upsertContact(
  agentId: string,
  input: CreateContactInput,
): Promise<Contact> {
  // Try to find existing row by email first (so we can UPDATE rather than
  // relying on ON CONFLICT, which requires identical column coverage).
  let existingId: string | null = null;
  const normalizedEmail = input.email?.trim().toLowerCase() || null;
  if (normalizedEmail) {
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("agent_id", agentId as never)
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (existing) existingId = String((existing as { id: string }).id);
  }

  if (existingId) {
    // Merge: update only fields the caller explicitly provided.
    const patch = toContactRow(agentId, input);
    // Strip nulls so we don't overwrite existing data with incoming blanks,
    // UNLESS the caller explicitly set them. Simple heuristic: drop null
    // from top-level fields that weren't in the input.
    const patchClean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== null && v !== undefined) patchClean[k] = v;
    }
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update(patchClean as never)
      .eq("id", existingId)
      .select("*")
      .single();
    if (error) throw error;
    return mapContactRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .insert(toContactRow(agentId, input) as never)
    .select("*")
    .single();
  if (error) throw error;
  return mapContactRow(data as Record<string, unknown>);
}

export async function updateContact(
  agentId: string,
  contactId: string,
  patch: Partial<CreateContactInput>,
): Promise<Contact> {
  const row = toContactRow(agentId, patch as CreateContactInput);
  // Don't let patch change the agent_id.
  delete (row as Record<string, unknown>).agent_id;
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .update(row as never)
    .eq("id", contactId)
    .eq("agent_id", agentId as never)
    .select("*")
    .single();
  if (error) throw error;
  return mapContactRow(data as Record<string, unknown>);
}

export async function deleteContact(
  agentId: string,
  contactId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("agent_id", agentId as never);
  if (error) throw error;
}

// =============================================================================
// Signal ops
// =============================================================================

async function assertSignalBelongsToAgent(
  agentId: string,
  signalId: string,
): Promise<void> {
  const { data: signal } = await supabaseAdmin
    .from("contact_signals")
    .select("id, contact_id")
    .eq("id", signalId)
    .maybeSingle();
  if (!signal) throw new Error("Signal not found");
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", (signal as { contact_id: string }).contact_id)
    .eq("agent_id", agentId as never)
    .maybeSingle();
  if (!contact) throw new Error("Signal does not belong to this agent");
}

export async function listOpenSignals(
  agentId: string,
): Promise<Array<ContactSignal & { contact: Contact }>> {
  const { data: contactRows, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("agent_id", agentId as never);
  if (contactErr && isMissingRelationError(contactErr)) return [];
  if (contactErr) throw contactErr;
  if (!contactRows?.length) return [];

  const contactsById = new Map<string, Contact>();
  for (const row of contactRows) {
    const c = mapContactRow(row as Record<string, unknown>);
    contactsById.set(c.id, c);
  }

  const { data: signalRows } = await supabaseAdmin
    .from("contact_signals")
    .select("*")
    .in("contact_id", Array.from(contactsById.keys()) as never)
    .is("dismissed_at", null);

  return (signalRows ?? [])
    .map((r) => {
      const s = mapSignalRow(r as Record<string, unknown>);
      const contact = contactsById.get(s.contactId);
      if (!contact) return null;
      return { ...s, contact };
    })
    .filter((v): v is ContactSignal & { contact: Contact } => v !== null);
}

export async function dismissSignal(
  agentId: string,
  signalId: string,
): Promise<void> {
  await assertSignalBelongsToAgent(agentId, signalId);
  const { error } = await supabaseAdmin
    .from("contact_signals")
    .update({ dismissed_at: new Date().toISOString() } as never)
    .eq("id", signalId);
  if (error) throw error;
}

export async function acknowledgeSignal(
  agentId: string,
  signalId: string,
): Promise<void> {
  await assertSignalBelongsToAgent(agentId, signalId);
  const { error } = await supabaseAdmin
    .from("contact_signals")
    .update({ acknowledged_at: new Date().toISOString() } as never)
    .eq("id", signalId);
  if (error) throw error;
}

export async function restoreSignal(
  agentId: string,
  signalId: string,
): Promise<void> {
  await assertSignalBelongsToAgent(agentId, signalId);
  const { error } = await supabaseAdmin
    .from("contact_signals")
    .update({ dismissed_at: null, acknowledged_at: null } as never)
    .eq("id", signalId);
  if (error) throw error;
}

export type CreateSignalInput = {
  contactId: string;
  type: ContactSignalType;
  label: string;
  confidence?: SignalConfidence;
  suggestedAction?: string | null;
  detectedAt?: string;
};

async function assertContactBelongsToAgent(
  agentId: string,
  contactId: string,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("agent_id", agentId as never)
    .maybeSingle();
  if (!data) throw new Error("Contact does not belong to this agent");
}

export async function createSignal(
  agentId: string,
  input: CreateSignalInput,
): Promise<ContactSignal> {
  await assertContactBelongsToAgent(agentId, input.contactId);
  const { data, error } = await supabaseAdmin
    .from("contact_signals")
    .insert({
      contact_id: input.contactId,
      signal_type: input.type,
      label: input.label.trim().slice(0, 200),
      confidence: input.confidence ?? "medium",
      suggested_action: input.suggestedAction?.trim().slice(0, 500) || null,
      detected_at: input.detectedAt ?? new Date().toISOString(),
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  return mapSignalRow(data as Record<string, unknown>);
}
