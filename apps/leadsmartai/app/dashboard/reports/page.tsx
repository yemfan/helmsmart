import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentAgentContext, getLeads } from "@/lib/dashboardService";
import ReportsClient from "./ReportsClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.reports.metaTitle", { ns: "dashboard" }),
    description: t("pages.reports.metaDescription", { ns: "dashboard" }),
    keywords: ["reports", "CMA", "market analysis"],
    robots: { index: false },
  };
}

export default async function ReportsPage() {
  await getCurrentAgentContext();
  const leads = await getLeads({ limit: 500 });
  const leadIds = leads.map((l) => l.id);
  const leadMap = new Map(leads.map((l) => [l.id, { name: l.name, email: l.email }]));

  let reports: any[] = [];
  if (leadIds.length) {
    const res = await supabaseServer
      .from("reports")
      .select("id,property_id,contact_id,created_at,report_data")
      .in("contact_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(50);
    reports = (res.data ?? []).map((r: any) => {
      const lead = r.contact_id ? leadMap.get(r.contact_id) : null;
      return {
        id: r.id,
        property_address: r.report_data?.property?.address ?? null,
        lead_name: lead?.name ?? null,
        lead_email: lead?.email ?? null,
        created_at: r.created_at,
      };
    });
  }

  return <ReportsClient reports={reports} />;
}
