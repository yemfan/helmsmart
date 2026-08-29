import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import CallsClient from "./CallsClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.calls.metaTitle", { ns: "dashboard" }),
    description: t("pages.calls.metaDescription", { ns: "dashboard" }),
    keywords: ["calls", "phone tracking", "communication"],
    robots: { index: false },
  };
}

export default async function CallsPage() {
  const ctx = await getCurrentAgentContext();

  // `call_logs`, not `lead_calls`. lead_calls is written only by the retired
  // Twilio voice flow (/api/voice/status-callback) and has never held a single
  // row; the Retell receptionist writes call_logs, which has hundreds. This
  // page has therefore always said "No calls yet" no matter how many calls
  // were answered.
  //
  // call_logs carries the AI summary in `notes` and has no transcript column,
  // so those are mapped rather than selected.
  const { data: calls } = await supabaseServer
    .from("call_logs")
    .select("id, contact_id, direction, from_phone, to_phone, status, duration_seconds, recording_url, notes, created_at")
    .eq("agent_id", ctx.agentId)
    .order("created_at", { ascending: false })
    .limit(200);

  // Enrich with lead names
  const leadIds = [...new Set((calls ?? []).map((c: any) => c.contact_id).filter(Boolean))];
  let leadMap = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads } = await supabaseServer.from("contacts").select("id, name").in("id", leadIds);
    for (const l of (leads ?? []) as any[]) leadMap.set(String(l.id), l.name);
  }

  const enriched = (calls ?? []).map((c: any) => ({
    ...c,
    // The client expects the lead_calls shape; fill the fields call_logs
    // does not have rather than leaving the columns blank.
    summary: c.notes ?? null,
    transcript: null,
    started_at: c.created_at,
    needs_human: false,
    hot_lead: false,
    lead_name: c.contact_id ? leadMap.get(String(c.contact_id)) ?? null : null,
  }));

  return <CallsClient calls={enriched} />;
}
