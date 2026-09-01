import { supabaseAdmin } from "@/lib/supabase/admin";
import { findDuplicateCandidates } from "./dedupe";
import { enrichLeadRecord } from "./enrichment";
import { mergeLeadRecords } from "./merge";
import {
  calculateContactCompletenessScore,
  normalizeAddress,
  normalizeEmail,
  normalizePhone,
  displayAddress,
  displayPhone,
} from "./normalize";
import type { LeadLike } from "./types";

const nowIso = () => new Date().toISOString();

export async function normalizeLeadFields(lead: LeadLike) {
  const id = String(lead.id ?? "");
  if (!id) throw new Error("missing lead id");

  const normalized = {
    normalized_email: normalizeEmail(typeof lead.email === "string" ? lead.email : null),
    normalized_phone: normalizePhone(displayPhone(lead)),
    normalized_address: normalizeAddress(displayAddress(lead)),
    contact_completeness_score: calculateContactCompletenessScore(lead),
    updated_at: nowIso(),
  };

  const { error } = await supabaseAdmin.from("contacts").update(normalized).eq("id", id);
  if (error) throw error;

  const { error: runErr } = await supabaseAdmin.from("lead_enrichment_runs").insert({
    contact_id: id,
    run_type: "cleanup",
    status: "completed",
    changes_json: normalized,
  } as Record<string, unknown>);
  if (runErr) throw runErr;

  return normalized;
}

export async function scanForDuplicateLeads(limit = 2000) {
  let q = supabaseAdmin
    .from("contacts")
    .select(
      "id, agent_id, created_at, name, email, phone, property_address, merged_into_lead_id"
    )
    .is("merged_into_lead_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await q;
  if (error) throw error;

  const leads = (data || []) as LeadLike[];
  const raw = findDuplicateCandidates(leads);
  const byId = new Map(leads.map((r) => [String(r.id), r]));
  const candidates = raw.filter((c) => {
    const p = byId.get(c.primaryLeadId);
    const d = byId.get(c.duplicateLeadId);
    if (!p || !d) return false;
    return String(p.agent_id ?? "") === String(d.agent_id ?? "") && String(p.agent_id ?? "") !== "";
  });

  if (candidates.length) {
    const { error: upErr } = await supabaseAdmin.from("lead_duplicate_candidates").upsert(
      candidates.map((c) => ({
        primary_contact_id: c.primaryLeadId,
        duplicate_contact_id: c.duplicateLeadId,
        confidence_score: c.confidenceScore,
        reason_json: c.reasons,
        updated_at: nowIso(),
      })),
      { onConflict: "primary_contact_id,duplicate_contact_id" }
    );
    if (upErr) throw upErr;
  }

  return candidates;
}

export async function mergeDuplicateLeadPair(primaryLeadId: string, duplicateLeadId: string) {
  if (primaryLeadId === duplicateLeadId) throw new Error("Cannot merge a lead into itself");

  const { data: rows, error } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .in("id", [primaryLeadId, duplicateLeadId]);

  if (error) throw error;
  const primary = rows?.find((x: { id: string | number }) => String(x.id) === primaryLeadId);
  const duplicate = rows?.find((x: { id: string | number }) => String(x.id) === duplicateLeadId);
  if (!primary || !duplicate) throw new Error("Lead pair not found");

  if ((primary as LeadLike).merged_into_lead_id != null) {
    throw new Error("Primary lead is already merged into another record");
  }
  if ((duplicate as LeadLike).merged_into_lead_id != null) {
    throw new Error("Duplicate lead is already merged");
  }

  if (String((primary as LeadLike).agent_id ?? "") !== String((duplicate as LeadLike).agent_id ?? "")) {
    throw new Error("Cannot merge leads assigned to different agents");
  }

  const merged = mergeLeadRecords(primary as LeadLike, duplicate as LeadLike);

  const { error: u1 } = await supabaseAdmin
    .from("contacts")
    .update({ ...merged, updated_at: nowIso() })
    .eq("id", primaryLeadId);
  if (u1) throw u1;

  const { error: u2 } = await supabaseAdmin
    .from("contacts")
    .update({ merged_into_lead_id: primaryLeadId, updated_at: nowIso() })
    .eq("id", duplicateLeadId);
  if (u2) throw u2;

  const { error: u3 } = await supabaseAdmin
    .from("lead_duplicate_candidates")
    .update({ status: "merged", updated_at: nowIso() })
    .eq("primary_contact_id", primaryLeadId)
    .eq("duplicate_contact_id", duplicateLeadId);
  if (u3) throw u3;

  const { error: runErr } = await supabaseAdmin.from("lead_enrichment_runs").insert({
    contact_id: primaryLeadId,
    run_type: "merge",
    status: "completed",
    changes_json: { mergedFrom: duplicateLeadId, merged },
  } as Record<string, unknown>);
  if (runErr) throw runErr;

  return merged;
}

export async function runLeadEnrichment(limit = 200) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .is("merged_into_lead_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const results: Array<{ leadId: string; enrichment: Awaited<ReturnType<typeof enrichLeadRecord>> }> = [];

  for (const row of data || []) {
    const lead = row as LeadLike;
    const leadId = String(lead.id ?? "");
    if (!leadId) continue;

    const enrichment = await enrichLeadRecord(lead);
    const updatePayload: Record<string, unknown> = {
      contact_completeness_score: enrichment.contactCompletenessScore,
      enrichment_status: Object.keys(enrichment.changes).length ? "enriched" : "skipped_no_ai",
      updated_at: nowIso(),
    };
    for (const [k, v] of Object.entries(enrichment.changes)) {
      if (v !== undefined) updatePayload[k] = v;
    }

    const { error: upErr } = await supabaseAdmin.from("contacts").update(updatePayload).eq("id", leadId);
    if (upErr) throw upErr;

    const { error: insErr } = await supabaseAdmin.from("lead_enrichment_runs").insert({
      contact_id: leadId,
      run_type: "enrichment",
      status: "completed",
      changes_json: enrichment.changes,
    } as Record<string, unknown>);
    if (insErr) throw insErr;

    results.push({ leadId, enrichment });
  }

  return results;
}

export async function getContactHealthSummary(agentId?: string | null) {
  let q = supabaseAdmin
    .from("contacts")
    .select(
      "id, email, phone, property_address, birthday, home_purchase_date, contact_completeness_score, merged_into_lead_id"
    )
    .is("merged_into_lead_id", null)
    .limit(5000);

  if (agentId) q = q.eq("agent_id", agentId as unknown as number);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []) as Record<string, unknown>[];

  const hasEmail = (r: Record<string, unknown>) =>
    typeof r.email === "string" && r.email.trim().length > 0;
  const hasPhone = (r: Record<string, unknown>) => Boolean(displayPhone(r));
  const hasBirthday = (r: Record<string, unknown>) => Boolean(r.birthday);
  const hasHomePurchase = (r: Record<string, unknown>) => Boolean(r.home_purchase_date);

  return {
    totalContacts: rows.length,
    avgCompletenessScore: rows.length
      ? Math.round(
          rows.reduce((s, r) => s + Number(r.contact_completeness_score || 0), 0) / rows.length
        )
      : 0,
    withEmailPct: rows.length ? Math.round((rows.filter(hasEmail).length / rows.length) * 100) : 0,
    withPhonePct: rows.length ? Math.round((rows.filter(hasPhone).length / rows.length) * 100) : 0,
    withBirthdayPct: rows.length ? Math.round((rows.filter(hasBirthday).length / rows.length) * 100) : 0,
    withHomePurchaseDatePct: rows.length
      ? Math.round((rows.filter(hasHomePurchase).length / rows.length) * 100)
      : 0,
  };
}

export async function runBulkNormalize(limit = 500) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, email, phone, property_address, city, state, zip_code, birthday, home_purchase_date, relationship_stage, merged_into_lead_id"
    )
    .is("merged_into_lead_id", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const out: string[] = [];
  for (const row of data || []) {
    await normalizeLeadFields(row as LeadLike);
    out.push(String((row as LeadLike).id));
  }
  return { normalizedLeadIds: out };
}
