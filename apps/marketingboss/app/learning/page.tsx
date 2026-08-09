import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Performance from "@/components/Performance";
import { buildPerformanceSummary } from "@/lib/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Learning — not analytics. It answers WHY something worked, so the next
 * recommendation is better. v1 shows what the engagement data says is working;
 * narrative learnings with one-click playbook improvements arrive in Phase 5.
 */
export default async function LearningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, summary] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    buildPerformanceSummary(user.id),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">📈 Learning</h2>
        <p className="text-sm text-slate-500">
          What&apos;s working — and where to double down. Your playbooks already use these signals when planning the
          next posts.
        </p>
      </section>
      <Performance summary={summary} />
    </main>
  );
}
