import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Performance from "@/components/Performance";
import LearningFeed from "@/components/LearningFeed";
import { buildPerformanceSummary } from "@/lib/performance";
import { listLearnings } from "@/lib/learnings";
import { listCampaigns } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Learning — not analytics. Narrative learnings first (why something worked +
 * a one-click way to make playbooks act on it), the raw aggregates below as
 * supporting context.
 */
export default async function LearningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, summary, learnings, campaigns] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    buildPerformanceSummary(user.id),
    listLearnings(user.id),
    listCampaigns(user.id),
  ]);

  const playbooks = campaigns
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, name: c.name || "Playbook" }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">📈 Learning</h2>
        <p className="text-sm text-slate-500">
          Why things worked — from your own results, with the evidence shown. Apply a learning and your playbooks plan
          with it.
        </p>
      </section>

      <LearningFeed learnings={learnings} playbooks={playbooks} />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">The numbers behind it</h3>
        <Performance summary={summary} />
      </section>
    </main>
  );
}
