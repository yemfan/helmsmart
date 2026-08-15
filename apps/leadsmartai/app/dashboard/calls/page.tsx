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

  const { data: calls } = await supabaseServer
    .from("lead_calls")
    .select("id, contact_id, direction, from_phone, to_phone, status, duration_seconds, summary, transcript, recording_url, needs_human, hot_lead, started_at, created_at")
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
    lead_name: c.contact_id ? leadMap.get(String(c.contact_id)) ?? null : null,
  }));

  return <CallsClient calls={enriched} />;
}
