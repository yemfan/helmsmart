import { enrichLeadRecord } from "@/lib/contact-enrichment/enrichment";
import { mergeLeadRecords } from "@/lib/contact-enrichment/merge";
import {
  calculateContactCompletenessScore,
  displayAddress,
  displayPhone,
  normalizeAddress,
  normalizeEmail,
  normalizePhone,
} from "@/lib/contact-enrichment/normalize";
import { normalizeLeadFields } from "@/lib/contact-enrichment/service";
import type { LeadLike } from "@/lib/contact-enrichment/types";
import { runLeadMarketplacePipeline } from "@/lib/leadScorePipeline";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { findBestDuplicateMatchForAgent } from "./findDuplicateCandidates";
import { toLeadLike } from "./leadLike";
import { formatUsPhoneDigits } from "./phone";
import type { ContactFieldsInput, DuplicateStrategy, IngestResult, IntakeChannel } from "./types";

export type { ContactFieldsInput, DuplicateStrategy, IngestResult, IntakeChannel };

/**
 * The richer CRM-export fields → their `contacts` columns, including only the
 * ones actually present so we never null out a column on merge. `lead_type`
 * lands in `lead_type` and tags in `lead_tags_json` (the real columns).
 */
function contactExtraColumns(fields: ContactFieldsInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (fields.lead_type) out.lead_type = fields.lead_type;
  if (fields.search_location) out.search_location = fields.search_location;
  if (fields.city) out.city = fields.city;
  if (fields.state) out.state = fields.state;
  if (fields.timeline) out.timeline = fields.timeline;
  if (fields.price_min != null) out.price_min = fields.price_min;
  if (fields.price_max != null) out.price_max = fields.price_max;
  if (fields.beds != null) out.beds = fields.beds;
  if (fields.baths != null) out.baths = fields.baths;
  if (fields.tags && fields.tags.length > 0) out.lead_tags_json = fields.tags;
  return out;
}

/** Keep only the extra columns the primary row hasn't already filled — so a
 *  merge enriches (adds missing area/budget/etc.) without clobbering existing
 *  data. */
function fillMissingColumns(
  primary: Record<string, unknown>,
  extras: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extras)) {
    const cur = primary[k];
    const empty = cur == null || cur === "" || (Array.isArray(cur) && cur.length === 0);
    if (empty) out[k] = v;
  }
  return out;
}

export async function assertLeadQuota(agentId: string, planType: string): Promise<void> {
  const pt = planType.toLowerCase();
  if (pt === "free") {
    throw new Error("CRM is not available on Free. Upgrade to Pro to add leads.");
  }
  if (pt === "pro") {
    const { count, error } = await supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId);
    if (error) throw error;
    if ((count ?? 0) >= 500) {
      throw new Error("Upgrade to Premium for unlimited leads.");
    }
  }
}

async function logIntakeActivity(params: {
  leadId: string;
  agentId: string;
  intakeChannel: IntakeChannel;
  importJobId?: string | null;
  extra?: Record<string, unknown>;
}) {
  const leadIdNum = Number(params.leadId);
  if (!Number.isFinite(leadIdNum)) return;

  const aid = params.agentId?.trim();
  const row: Record<string, unknown> = {
    contact_id: leadIdNum,
    event_type: "contact_intake",
    metadata: {
      intake_channel: params.intakeChannel,
      import_job_id: params.importJobId ?? null,
      ...params.extra,
    },
  };
  if (aid) {
    row.agent_id = aid;
  }

  const { error } = await supabaseAdmin.from("contact_events").insert(row);

  if (error) console.error("[contact_intake] lead_events insert", error.message);
}

/**
 * Shared pipeline: duplicate check → insert or merge → normalize (service) → optional AI enrichment → marketplace pipeline → activity log.
 */
export async function runContactIngestion(params: {
  agentId: string;
  planType: string;
  fields: ContactFieldsInput;
  intakeChannel: IntakeChannel;
  duplicateStrategy: DuplicateStrategy;
  importJobId?: string | null;
  /** Bulk CSV: skip per-row OpenAI to stay fast (normalization still runs). */
  skipEnrichment?: boolean;
}): Promise<IngestResult> {
  const { agentId, planType, fields, intakeChannel, duplicateStrategy, importJobId, skipEnrichment } = params;

  const phoneDisplay = formatUsPhoneDigits(fields.phone ?? "");
  const incoming: LeadLike = toLeadLike({ ...fields, phone: phoneDisplay ?? fields.phone }, agentId);

  const dup = await findBestDuplicateMatchForAgent(agentId, incoming);

  if (dup && duplicateStrategy === "skip") {
    return { action: "skipped", duplicateLeadId: dup.leadId, score: dup.score };
  }

  if (dup && duplicateStrategy === "merge") {
    const { data: primaryRow, error: fetchErr } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", dup.leadId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!primaryRow) throw new Error("Duplicate lead not found for merge");

    const primary = primaryRow as LeadLike;
    const merged = mergeLeadRecords(primary, incoming);

    const { error: upErr } = await supabaseAdmin
      .from("contacts")
      .update({
        ...merged,
        // Enrich the existing contact with any richer fields it's missing —
        // never overwrite what's already there.
        ...fillMissingColumns(primaryRow as Record<string, unknown>, contactExtraColumns(fields)),
        updated_at: new Date().toISOString(),
        intake_channel: intakeChannel,
        import_job_id: importJobId ?? null,
      } as Record<string, unknown>)
      .eq("id", dup.leadId);

    if (upErr) throw upErr;

    await normalizeLeadFields({ ...(primary as LeadLike), ...merged, id: dup.leadId });

    if (!skipEnrichment) {
      const { data: fresh } = await supabaseAdmin.from("contacts").select("*").eq("id", dup.leadId).maybeSingle();
      if (fresh) {
        const enrichment = await enrichLeadRecord(fresh as LeadLike);
        const updatePayload: Record<string, unknown> = {
          contact_completeness_score: enrichment.contactCompletenessScore,
          enrichment_status: Object.keys(enrichment.changes).length ? "enriched" : "skipped_no_ai",
          updated_at: new Date().toISOString(),
        };
        for (const [k, v] of Object.entries(enrichment.changes)) {
          if (v !== undefined) updatePayload[k] = v;
        }
        await supabaseAdmin.from("contacts").update(updatePayload).eq("id", dup.leadId);
      }
    }

    await logIntakeActivity({
      leadId: dup.leadId,
      agentId,
      intakeChannel,
      importJobId,
      extra: { merged_from_import: true, duplicate_match_score: dup.score },
    });

    return { action: "merged", leadId: dup.leadId };
  }

  await assertLeadQuota(agentId, planType);

  const ne = normalizeEmail(typeof fields.email === "string" ? fields.email : null);
  const np = phoneDisplay ? normalizePhone(phoneDisplay) : null;
  const na = normalizeAddress(displayAddress(incoming));

  const insertPayload: Record<string, unknown> = {
    agent_id: agentId,
    name: fields.name?.trim() || null,
    email: fields.email?.trim() || null,
    phone: phoneDisplay,
    property_address: fields.property_address?.trim() || null,
    source: fields.source?.trim() || "crm",
    intake_channel: intakeChannel,
    import_job_id: importJobId ?? null,
    notes: fields.notes?.trim() || null,
    normalized_email: ne,
    normalized_phone: np,
    normalized_address: na,
    contact_completeness_score: calculateContactCompletenessScore(incoming),
    lead_status: "new",
    rating: "warm",
    contact_frequency: "weekly",
    contact_method: "email",
    sms_opt_in: false,
    next_contact_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    // Richer captured fields (lead_type, area, budget, beds/baths, timeline, tags).
    ...contactExtraColumns(fields),
  };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("contacts")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr) throw insErr;

  const leadId = String((inserted as { id?: unknown })?.id ?? "");
  if (!leadId) throw new Error("Insert failed");

  // From this point on the contact row is committed — every step below is
  // best-effort enrichment / audit. A missing table, missing column, or
  // external-service hiccup must not bubble up as a 500 to the caller, or
  // the user sees "Server error" even though the contact saved.
  const withId: LeadLike = { ...incoming, id: leadId };
  try {
    await normalizeLeadFields(withId);
  } catch (e) {
    console.warn("[ingest] normalizeLeadFields", e);
  }

  if (!skipEnrichment) {
    try {
      const { data: row } = await supabaseAdmin.from("contacts").select("*").eq("id", leadId).maybeSingle();
      if (row) {
        const enrichment = await enrichLeadRecord(row as LeadLike);
        const updatePayload: Record<string, unknown> = {
          contact_completeness_score: enrichment.contactCompletenessScore,
          enrichment_status: Object.keys(enrichment.changes).length ? "enriched" : "skipped_no_ai",
          updated_at: new Date().toISOString(),
        };
        for (const [k, v] of Object.entries(enrichment.changes)) {
          if (v !== undefined) updatePayload[k] = v;
        }
        const { error: enrichUpdErr } = await supabaseAdmin.from("contacts").update(updatePayload).eq("id", leadId);
        if (enrichUpdErr) console.warn("[ingest] contacts enrichment update", enrichUpdErr.message);

        const { error: runInsErr } = await supabaseAdmin.from("lead_enrichment_runs").insert({
          contact_id: leadId,
          run_type: "enrichment",
          status: "completed",
          changes_json: enrichment.changes,
        } as Record<string, unknown>);
        if (runInsErr) console.warn("[ingest] lead_enrichment_runs insert", runInsErr.message);
      }
    } catch (e) {
      console.warn("[ingest] enrichment step", e);
    }
  }

  try {
    await runLeadMarketplacePipeline(leadId);
  } catch (e) {
    console.warn("[ingest] runLeadMarketplacePipeline", e);
  }

  try {
    await logIntakeActivity({
      leadId,
      agentId,
      intakeChannel,
      importJobId,
      extra: { duplicate_ignored: Boolean(dup && duplicateStrategy === "create_anyway") },
    });
  } catch (e) {
    console.warn("[ingest] logIntakeActivity", e);
  }

  return { action: "inserted", leadId };
}
