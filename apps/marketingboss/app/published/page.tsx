import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import PublishedHistory from "@/components/PublishedHistory";
import { listHistory } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Published — the marketing timeline: every completed action and how it performed. */
export default async function PublishedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, history] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    listHistory(user.id),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">📢 Published</h2>
        <p className="text-sm text-slate-500">
          Your marketing timeline — every completed action, where it went, and the engagement it earned. What worked
          feeds{" "}
          <a href="/learning" className="text-boss-gold underline underline-offset-2">
            Learning
          </a>
          .
        </p>
      </section>
      <PublishedHistory history={history} />
    </main>
  );
}
