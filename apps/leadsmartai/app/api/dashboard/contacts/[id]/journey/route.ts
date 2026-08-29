import { NextResponse } from "next/server";
import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { journeyHeadline, summariseJourney } from "@/lib/marketing-hub/visitor";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/contacts/[id]/journey
 *
 * What this contact did on the agent's marketing hub before — and after —
 * they got in touch. This is the payoff of the visitor stitch: the agent is
 * told "read three of your posts across two visits, first found you via
 * Facebook" rather than being handed another anonymous name.
 *
 * Scoped twice on purpose: by the caller's agent id AND by the contact id.
 * The contact id alone would let any signed-in agent read any other agent's
 * lead journey by guessing a uuid.
 *
 * Returns an empty journey rather than a 404 when there is nothing recorded.
 * Most contacts arrive by phone, import or open house and will never have web
 * events; that is a normal, uninteresting absence, not an error.
 */

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    const { id } = await ctx.params;
    const contactId = (id ?? "").trim();
    if (!contactId) {
      return NextResponse.json({ ok: false, error: "missing_contact" }, { status: 400 });
    }

    // Confirm the contact belongs to THIS agent before reading anything about
    // it. Without this the journey query alone would happily answer for a
    // contact the caller does not own.
    const owned = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("id", contactId as never)
      .eq("agent_id", auth.agentId as never)
      .maybeSingle();

    if (!owned.data) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("traffic_events")
      .select("event_type, page_path, source, campaign, session_id, created_at")
      .eq("agent_id", auth.agentId as never)
      .eq("contact_id", contactId as never)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.warn("[contacts.journey]", error.message);
      return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
    }

    const journey = summariseJourney(
      (data as Record<string, unknown>[] | null) ?? [],
    );

    return NextResponse.json({
      ok: true,
      journey,
      headline: journeyHeadline(journey),
    });
  } catch (e) {
    console.error("[contacts.journey] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
