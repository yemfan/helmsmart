/**
 * Persists rules-based score + price on `public.leads` and records product `public.events`.
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { rulesMarketplaceEngine } from "@/lib/engines/leadMarketplaceEngine";
import {
  LEAD_SCORING_MODEL_VERSION,
  type LeadScoringInput,
} from "@/lib/scoring";
import {
  LEAD_PRICING_MODEL_VERSION,
  calculateLeadPriceDetailed,
  parseUsStateFromText,
} from "@/lib/pricing";

type LeadRow = {
  id: string | number;
  intent?: string | null;
  email?: string | null;
  phone?: string | null;
  property_value?: number | null;
  estimated_home_value?: number | null;
  timeframe?: string | null;
  location?: string | null;
  tool_used?: string | null;
  property_address?: string | null;
  traffic_source?: string | null;
};

function numOr(...vals: (number | null | undefined)[]) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractToolFromTraffic(trafficSource: string | null | undefined): string | null {
  const t = String(trafficSource ?? "");
  const i = t.indexOf(":");
  if (i === -1) return null;
  const rest = t.slice(i + 1).trim();
  return rest || null;
}

function collectDistinctToolsFromLeadEvents(rows: { metadata?: unknown }[] | null): Set<string> {
  const tools = new Set<string>();
  for (const row of rows ?? []) {
    const m = row?.metadata as Record<string, unknown> | null | undefined;
    const tool = m?.tool;
    if (tool != null && String(tool).trim()) tools.add(String(tool).trim());
  }
  return tools;
}

function resolveToolUsed(lead: LeadRow, eventTools: Set<string>): string | null {
  if (lead.tool_used && String(lead.tool_used).trim()) return String(lead.tool_used).trim();
  const fromTraffic = extractToolFromTraffic(lead.traffic_source);
  if (fromTraffic) return fromTraffic;
  if (eventTools.size >= 1) return [...eventTools][0];
  return null;
}

function resolveState(lead: LeadRow): string | null {
  return (
    parseUsStateFromText(lead.location) ??
    parseUsStateFromText(lead.property_address) ??
    null
  );
}

export function buildLeadScoringInput(lead: LeadRow, leadEvents: { metadata?: unknown }[] | null): LeadScoringInput {
  const eventTools = collectDistinctToolsFromLeadEvents(leadEvents);
  const primaryTool = resolveToolUsed(lead, eventTools);

  let distinct = eventTools.size;
  if (distinct === 0 && primaryTool) distinct = 1;

  return {
    intent: lead.intent,
    tool_used: primaryTool,
    email: lead.email,
    phone: lead.phone,
    property_value: numOr(lead.property_value, lead.estimated_home_value),
    timeframe: lead.timeframe,
    distinct_tools_used: distinct,
  };
}

export type LeadMarketplacePipelineResult = {
  score: number;
  price: number;
  basePrice: number;
  multiplier: number;
};

export async function runLeadMarketplacePipeline(leadId: string): Promise<LeadMarketplacePipelineResult | null> {
  const { data: lead, error: leadErr } = await supabaseServer
    .from("contacts")
    .select(
      "id,intent,email,phone,property_value,estimated_home_value,timeframe,location,tool_used,property_address,traffic_source"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    console.warn("runLeadMarketplacePipeline: lead not found", leadId, leadErr);
    return null;
  }

  const { data: leadEvents, error: evErr } = await supabaseServer
    .from("contact_events")
    .select("metadata,event_type")
    .eq("contact_id", leadId as any);

  if (evErr) {
    console.warn("runLeadMarketplacePipeline: lead_events read failed", evErr);
  }

  const input = buildLeadScoringInput(lead as LeadRow, leadEvents ?? []);
  const score = rulesMarketplaceEngine.score(input);
  const state = resolveState(lead as LeadRow);
  const pv = numOr(
    (lead as any).property_value as number | null,
    (lead as any).estimated_home_value as number | null
  );

  const quote = calculateLeadPriceDetailed(score, { state: state ?? undefined, property_value: pv ?? undefined });
  const price = quote.price;

  const { error: upErr } = await supabaseServer
    .from("contacts")
    .update({ score, price } as Record<string, unknown>)
    .eq("id", leadId);

  if (upErr) {
    console.error("runLeadMarketplacePipeline: leads update failed", upErr);
    return null;
  }

  const metaBase = {
    contact_id: String(leadId),
    score,
    price,
    scoring_model: LEAD_SCORING_MODEL_VERSION,
    pricing_model: LEAD_PRICING_MODEL_VERSION,
  };

  const { error: evInsertErr } = await supabaseServer.from("events").insert([
    {
      user_id: null,
      event_type: "lead_scored",
      metadata: {
        ...metaBase,
        breakdown: input,
      },
    },
    {
      user_id: null,
      event_type: "price_assigned",
      metadata: {
        ...metaBase,
        base_price: quote.basePrice,
        multiplier: quote.multiplier,
        adjustments: quote.adjustments,
      },
    },
  ] as any);

  if (evInsertErr) {
    console.warn("runLeadMarketplacePipeline: events insert failed", evInsertErr);
  }

  return { score, price, basePrice: quote.basePrice, multiplier: quote.multiplier };
}
