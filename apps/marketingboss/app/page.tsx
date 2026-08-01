import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import Studio from "@/components/Studio";
import { retrieveSession } from "@/lib/stripe";
import { fulfillSession } from "@/lib/fulfill";
import { getConnectionStatus } from "@/lib/social";
import { youtubeConfigured } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; youtube?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Just returned from a successful Checkout (?purchased=<session_id>): credit the
  // account (idempotent — deduped by session id) and confirm it in the Studio.
  let creditsAdded: number | null = null;
  if (sp.purchased) {
    try {
      const session = await retrieveSession(sp.purchased);
      const balance = await fulfillSession(session);
      if (balance !== null) {
        const n = Number.parseInt(session.metadata?.credits ?? "", 10);
        creditsAdded = Number.isFinite(n) ? n : 0;
      }
    } catch {
      // Ignore — the webhook backstops fulfillment and the badge still shows the balance.
    }
  }

  const [{ data: profile }, youtube] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    getConnectionStatus(user.id, "youtube"),
  ]);
  const credits = profile?.credits ?? 0;

  const ytNotice =
    sp.youtube === "connected"
      ? { kind: "ok" as const, text: `YouTube connected${youtube.accountName ? ` — ${youtube.accountName}` : ""}. You can publish videos now. 🎬` }
      : sp.youtube === "denied"
        ? { kind: "warn" as const, text: "YouTube connection was cancelled." }
        : sp.youtube === "error"
          ? { kind: "warn" as const, text: "Couldn't connect YouTube — please try again." }
          : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={credits} />
      {creditsAdded !== null && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-200">
          Payment received —{" "}
          {creditsAdded > 0 ? `${creditsAdded} credits added` : "your credits have been added"}. Happy
          creating! 🎬
        </div>
      )}
      {ytNotice && (
        <div
          className={`rounded-xl border p-3.5 text-sm ${
            ytNotice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-white/15 bg-white/5 text-white/60"
          }`}
        >
          {ytNotice.text}
        </div>
      )}
      <Studio
        youtubeEnabled={youtubeConfigured()}
        youtubeConnected={youtube.connected}
        youtubeChannel={youtube.accountName}
      />
      <footer className="mt-auto pt-6 text-center text-[11px] text-white/25">
        Powered by fal.ai · image 1 credit · edit 2 · video 20 · every render is saved to your gallery
      </footer>
    </main>
  );
}
