import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Performance from "@/components/Performance";
import { buildPerformanceSummary } from "@/lib/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Performance dashboard — engagement across everything the user has published. */
export default async function PerformancePage() {
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
        <h2 className="text-2xl font-bold tracking-tight">Performance</h2>
        <p className="text-sm text-slate-500">What&apos;s working across everything you&apos;ve published.</p>
      </section>
      <Performance summary={summary} />
    </main>
  );
}
