import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import MissionView, { type MissionPayload } from "@/components/MissionView";
import { getMissionDetail } from "@/lib/workforce/missions";

/**
 * A mission's detail page. Deep-link only, by design — there is no Missions tab
 * (3.0 §G1). Owners reach it from Home, from an accepted opportunity, or from
 * the launcher that created it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [detail, { data: profile }] = await Promise.all([
    getMissionDetail(user.id, id),
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
  ]);
  if (!detail) notFound();

  const initial: MissionPayload = {
    mission: {
      id: detail.mission.id,
      objective: detail.mission.objective,
      status: detail.mission.status,
      measured_by: detail.mission.measured_by,
      spent_credits: detail.mission.spent_credits,
      summary: detail.mission.summary,
    },
    steps: detail.steps.map((s) => ({
      id: s.id,
      worker: s.worker,
      tool: s.tool_name,
      status: s.status,
      approvalState: s.approval_state,
      summary: s.summary,
      artifactUrl: s.artifact_url,
      creditsSpent: s.credits_spent,
      createdAt: s.created_at,
    })),
    report: detail.runs.at(-1)?.report ?? null,
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <Link href="/" className="text-xs text-slate-500 transition hover:text-slate-900">
        ← Home
      </Link>
      <MissionView initial={initial} />
    </main>
  );
}
