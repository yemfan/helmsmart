import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CONTACT_SCORES_SELECT,
  unpackScoreRow,
} from "@/lib/contactScores";
import {
  fetchRecentCallsForLead,
  fetchRecentEmailForLead,
  fetchRecentSmsForLead,
} from "@/lib/mobile/conversations";
import type {
  MobileLeadDetailResponseDto,
  MobileLeadPipelineDto,
  MobileLeadRecordDto,
  MobileLeadsListResponseDto,
  MobilePipelineStageOptionDto,
} from "@leadsmart/shared";
import { crmSlugToMobileSlug, listMobilePipelineStages } from "@/lib/mobile/mobilePipeline";
import {
  fetchNextAppointmentForLead,
  listRecentBookingLinksForLead,
} from "@/lib/mobile/calendarMobile";
import { fetchNextOpenTaskForLead } from "@/lib/mobile/leadTasksMobile";

const LIST_SELECT =
  "id,agent_id,name,email,phone,property_address,source,lead_status,notes,engagement_score,last_activity_at,rating,contact_frequency,contact_method,last_contacted_at,next_contact_at,search_location,created_at,merged_into_lead_id,prediction_score,prediction_label,prediction_computed_at,pipeline_stage_id";

/**
 * Paginated leads for mobile (active leads only — not merged into another).
 */
export async function listMobileLeads(params: {
  agentId: string;
  page: number;
  pageSize: number;
  filter?: string;
  /** Free-text search across name / phone / email (contact picker autocomplete). */
  search?: string;
}): Promise<MobileLeadsListResponseDto> {
  const { agentId, page, pageSize, filter, search } = params;
  const size = Math.min(Math.max(pageSize, 1), 100);
  const pageIndex = Math.max(page, 1);
  const from = (pageIndex - 1) * size;
  const to = from + size - 1;

  let q = supabaseAdmin
    .from("contacts")
    .select(LIST_SELECT, { count: "exact" })
    .eq("agent_id", agentId as unknown as number)
    .is("merged_into_lead_id", null)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  // Contact-picker autocomplete: match name / phone / email. Strip the
  // characters PostgREST uses to delimit an `.or()` filter (`,` `(` `)` and
  // the `*` wildcard) so a user typing them can't break or inject into the
  // query; a plain substring search is all the picker needs.
  const term = (search ?? "").trim().replace(/[,()*%]/g, "");
  if (term) {
    q = q.or(
      `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
    );
  }

  if (filter === "hot") q = q.eq("rating", "hot");
  else if (filter === "inactive") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    q = q.lte("last_activity_at", sevenDaysAgo);
  } else if (filter === "high_deal_potential") {
    q = q.gte("prediction_score", 70);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  const leads = data ?? [];
  const leadIds = leads.map((l) => String((l as { id: unknown }).id)).filter(Boolean);

  // `contact_scores` carries score + a flexible `factors` JSONB
  // (intent / timeline / confidence / explanation live inside).
  // Use the shared unpacker so the SELECT + extraction stays
  // consistent with dashboardService / clientPortalContext.
  let scoreMap: Record<string, ReturnType<typeof unpackScoreRow>> = {};
  if (leadIds.length) {
    const { data: scoreRows } = await supabaseAdmin
      .from("contact_scores")
      .select(CONTACT_SCORES_SELECT)
      .in("contact_id", leadIds as unknown as string[])
      .order("computed_at", { ascending: false })
      .limit(3000);

    for (const row of scoreRows ?? []) {
      const key = String((row as { contact_id: unknown }).contact_id ?? "");
      if (!key || scoreMap[key]) continue;
      scoreMap[key] = unpackScoreRow(row as Record<string, unknown>);
    }
  }

  const hydrated: MobileLeadRecordDto[] = leads.map((l) => {
    const row = l as Record<string, unknown>;
    const id = String(row.id ?? "");
    const s = scoreMap[id];
    return {
      ...row,
      id,
      display_phone: String(row.phone || "").trim() || null,
      ai_lead_score: s ? s.score : null,
      ai_intent: s?.intent ?? null,
      ai_timeline: s?.timeline ?? null,
      ai_confidence: s?.confidence ?? null,
      ai_explanation: s?.explanation ?? [],
    };
  });

  return {
    leads: hydrated,
    total: count ?? 0,
    page: pageIndex,
    pageSize: size,
  };
}

export async function hydrateMobileLeadRecord(
  agentId: string,
  leadId: string
): Promise<MobileLeadRecordDto | null> {
  const { data: lead, error } = await supabaseAdmin
    .from("contacts")
    .select(LIST_SELECT)
    .eq("id", leadId)
    .eq("agent_id", agentId as unknown as number)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!lead) return null;

  const row = lead as Record<string, unknown>;
  if (row.merged_into_lead_id != null) return null;

  const { data: scoreRow } = await supabaseAdmin
    .from("contact_scores")
    .select(CONTACT_SCORES_SELECT)
    .eq("contact_id", leadId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const s = unpackScoreRow(scoreRow as Record<string, unknown> | null);

  return {
    ...row,
    id: String(row.id ?? leadId),
    display_phone: String(row.phone || "").trim() || null,
    ai_lead_score: s ? s.score : null,
    ai_intent: s?.intent ?? null,
    ai_timeline: s?.timeline ?? null,
    ai_confidence: s?.confidence ?? null,
    ai_explanation: s?.explanation ?? [],
  };
}

/**
 * Lead profile plus recent SMS/email rows (same tables as dashboard thread routes).
 */
async function loadPipelineBlockForLead(
  agentId: string,
  pipelineStageId: string | null
): Promise<MobileLeadPipelineDto> {
  if (!pipelineStageId) {
    return { stage_id: null, mobile_slug: null, name: null };
  }
  const { data: st, error } = await supabaseAdmin
    .from("crm_pipeline_stages")
    .select("id,slug,name")
    .eq("id", pipelineStageId)
    .eq("agent_id", agentId as never)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!st) return { stage_id: null, mobile_slug: null, name: null };

  const r = st as { id: string; slug: string; name: string };
  return {
    stage_id: r.id,
    mobile_slug: crmSlugToMobileSlug(r.slug),
    name: r.name,
  };
}

export async function getMobileLeadDetail(
  agentId: string,
  leadId: string
): Promise<MobileLeadDetailResponseDto | null> {
  const lead = await hydrateMobileLeadRecord(agentId, leadId);
  if (!lead) return null;

  const row = lead as Record<string, unknown>;
  const psId = row.pipeline_stage_id != null ? String(row.pipeline_stage_id) : null;

  const [sms, email, calls, pipeline_stages, pipeline, next_open_task, next_appointment, booking_links] =
    await Promise.all([
      fetchRecentSmsForLead(leadId),
      fetchRecentEmailForLead(leadId),
      fetchRecentCallsForLead(leadId),
      listMobilePipelineStages(agentId),
      loadPipelineBlockForLead(agentId, psId),
      fetchNextOpenTaskForLead(agentId, leadId),
      fetchNextAppointmentForLead(agentId, leadId),
      listRecentBookingLinksForLead({ agentId, leadId, limit: 5 }),
    ]);

  return {
    lead,
    conversations: { sms, email, calls },
    pipeline,
    next_open_task,
    pipeline_stages: pipeline_stages as MobilePipelineStageOptionDto[],
    next_appointment,
    booking_links,
  };
}
