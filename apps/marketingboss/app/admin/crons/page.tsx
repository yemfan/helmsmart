import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import CronSwitches from "@/components/CronSwitches";
import { CRON_JOBS, listJobSwitches } from "@/lib/cron/switches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email: string | undefined): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/** Scheduled-job switches. Gated by ADMIN_EMAILS (unset → 404), like /admin/viral. */
export default async function AdminCronsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? undefined)) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("user_id", user.id)
    .maybeSingle();
  const switches = await listJobSwitches();

  return (
    <>
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Scheduled jobs</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          Both jobs are declared in <code className="font-mono text-xs">vercel.json</code> and fire on their own
          schedule. These switches decide whether a tick does anything — the next one after you flip it, with no
          deploy in between.
        </p>
        <CronSwitches initial={switches} jobs={CRON_JOBS} />
      </main>
    </>
  );
}
