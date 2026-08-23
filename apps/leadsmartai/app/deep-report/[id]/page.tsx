import { notFound } from "next/navigation";
import type { Metadata } from "next";

import DeepReportView from "@/components/deep-report/DeepReportView";
import type { DeepReport } from "@/lib/deep-report/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.deepReport.title", { ns: "web_marketing" });
  return {
  title,
  robots: { index: false },
};
}

/**
 * Public, shareable Property Deep Report — read by id (no auth; share-by-link).
 * Renders the same DeepReportView the dashboard uses.
 */
export default async function PublicDeepReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getServerT();
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("deep_reports")
    .select("id, report")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return notFound();
  const report = (data as { report: DeepReport }).report;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <DeepReportView report={report} />
      </div>
    </div>
  );
}
