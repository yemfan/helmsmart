import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import type { ComparisonReportRow, ComparisonReportResult } from "@/lib/comparisonReportTypes";
import type { PropertyInput } from "@/lib/propertyScoring";
import ComparisonReportClient from "@/components/comparison-report/ComparisonReportClient";

export const dynamic = "force-dynamic";

function parseRow(data: Record<string, unknown>): ComparisonReportRow | null {
  const id = String(data.id ?? "");
  const agent_id = String(data.agent_id ?? "");
  const client_name = String(data.client_name ?? "");
  const created_at = String(data.created_at ?? "");
  const properties = Array.isArray(data.properties) ? (data.properties as PropertyInput[]) : [];
  const rawResult = data.result as Record<string, unknown> | null | undefined;
  if (!id || !rawResult) return null;

  const result = rawResult as unknown as ComparisonReportResult;
  if (!result.scored || !Array.isArray(result.scored)) return null;

  return {
    id,
    agent_id,
    client_name,
    properties,
    result,
    created_at,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `Property Comparison Report | RealtyBoss`,
    description: `View your AI property comparison report (${id.slice(0, 8)}…).`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicComparisonReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("comparison_reports")
    .select("id, agent_id, client_name, properties, result, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const report = parseRow(data as Record<string, unknown>);
  if (!report) {
    notFound();
  }

  return <ComparisonReportClient report={report} />;
}
