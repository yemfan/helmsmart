import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Connections from "@/components/Connections";
import { getConnectionStatuses } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";
import { OAUTH_ADAPTERS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORMS = ["youtube", "facebook", "instagram", "threads", "linkedin", "pinterest", "tiktok"];

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, statuses] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatuses(user.id, PLATFORMS),
  ]);

  const providersConfigured: Record<string, boolean> = {
    meta: OAUTH_ADAPTERS.meta.configured(),
    linkedin: OAUTH_ADAPTERS.linkedin.configured(),
    threads: OAUTH_ADAPTERS.threads.configured(),
    pinterest: OAUTH_ADAPTERS.pinterest.configured(),
    tiktok: OAUTH_ADAPTERS.tiktok.configured(),
    youtube: youtubeConfigured(),
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Connections</h2>
        <p className="text-sm text-slate-500">
          Connect your social accounts to publish generated content directly from the Studio. Tokens are stored
          securely and never leave the server.
        </p>
      </section>
      <Connections providersConfigured={providersConfigured} statuses={statuses} />
      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        Each platform stays hidden until its app credentials are configured.
      </footer>
    </main>
  );
}
