import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import DeepReportView from "@/components/deep-report/DeepReportView";
import type { DeepReport } from "@/lib/deep-report/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("routeMeta.deepReport.title", { ns: "web_marketing" }),
    robots: { index: false },
  };
}

/**
 * A saved Property Deep Report, readable by the agent who ran it.
 *
 * This URL used to be public — read by id, no auth, share-by-link — which made
 * the report a client-facing artifact. It isn't one: it is the agent's working
 * document, and it is written in the AGENT's language. So the route is back at
 * the address it always had, but it now asks who you are.
 *
 * The ownership filter is part of the QUERY, not a check on the result. This
 * reads through the service-role client, which bypasses RLS entirely, so
 * `agent_id` is the only thing standing between one agent and another's
 * reports — and a row fetched first and compared second is one refactor away
 * from being fetched and rendered.
 *
 * A report that exists but belongs to someone else 404s rather than 403s: a
 * "forbidden" would confirm the id is real to anyone guessing at them.
 */
export default async function SavedDeepReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirect=/deep-report/${encodeURIComponent(id)}`);
  }

  const { data, error } = await supabaseAdmin
    .from("deep_reports")
    .select("id, report")
    .eq("id", id)
    .eq("agent_id", user.id)
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
