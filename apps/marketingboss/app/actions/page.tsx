import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import ActionsQueue, { type ScheduleRow } from "@/components/ActionsQueue";
import { listCampaigns, listDrafts, listScheduled } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Actions — the operational center: what's waiting, what's scheduled, what needs you. */
export default async function ActionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, campaigns, drafts, scheduled] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    listCampaigns(user.id),
    listDrafts(user.id),
    listScheduled(user.id),
  ]);

  const cadences: ScheduleRow[] = campaigns
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, name: c.name || "Playbook", frequency: c.frequency, nextRunAt: c.next_run_at }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">⚡ Actions</h2>
        <p className="text-sm text-slate-500">
          Everything in flight: what&apos;s waiting for your approval, what&apos;s scheduled, and the playbooks
          producing new actions. Completed actions live in{" "}
          <a href="/published" className="text-boss-gold underline underline-offset-2">
            Published
          </a>
          .
        </p>
      </section>
      <ActionsQueue cadences={cadences} drafts={drafts} scheduled={scheduled} />
    </main>
  );
}
