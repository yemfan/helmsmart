import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import PostingHub, { type ScheduleRow } from "@/components/PostingHub";
import { listCampaigns, listHistory, listScheduled } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PostingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, campaigns, scheduled, history] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    listCampaigns(user.id),
    listScheduled(user.id),
    listHistory(user.id),
  ]);

  const cadences: ScheduleRow[] = campaigns
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, name: c.name || "Campaign", frequency: c.frequency, nextRunAt: c.next_run_at }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Posting</h2>
        <p className="text-sm text-white/50">
          Your posting schedule, what&apos;s queued, and everything you&apos;ve published — in one place.
        </p>
      </section>
      <PostingHub cadences={cadences} scheduled={scheduled} history={history} />
    </main>
  );
}
