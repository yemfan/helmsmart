import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recommendPropertiesForContact } from "@/lib/contacts/recommendations/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI property recommender. On-demand: the agent clicks "Suggest
 * properties" on the contact profile and we synthesize a candidate
 * list from the contact's favorites + saved searches + recent views,
 * run the AI house-search engine (Claude + web search) with derived
 * criteria, score against the contact's pattern, and (optionally)
 * rerank + write rationale via GPT-4o-mini.
 *
 * Not cached server-side — the agent wants fresh candidates every time
 * they hit the button. The Opus web-search pass takes ~30-60s, so this
 * route runs with maxDuration = 60.
 */

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id: contactId } = await ctx.params;

    // Ensure the contact belongs to this agent.
    const { data: contactRow } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .eq("agent_id", agentId as never)
      .maybeSingle();
    if (!contactRow) {
      return NextResponse.json(
        { ok: false, error: "Contact does not belong to this agent" },
        { status: 403 },
      );
    }

    const result = await recommendPropertiesForContact(contactId, { limit: 10 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[recommendations/suggested] error", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
