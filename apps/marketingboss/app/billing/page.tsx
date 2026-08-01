import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import BuyCredits from "@/components/BuyCredits";
import { CREDIT_PACKS } from "@/lib/billing";
import { retrieveSession, stripeConfigured } from "@/lib/stripe";
import { fulfillSession } from "@/lib/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session_id?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // On return from a successful Checkout, credit the account immediately
  // (idempotent — the webhook may also fire, but the session id dedupes).
  let justCredited = false;
  if (sp.status === "success" && sp.session_id) {
    try {
      const session = await retrieveSession(sp.session_id);
      const balance = await fulfillSession(session);
      justCredited = balance !== null;
    } catch {
      // Fall through — the webhook is the backstop; the balance below still shows.
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("user_id", user.id)
    .single();
  const credits = profile?.credits ?? 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={credits} />

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Buy credits</h2>
        <p className="text-sm text-white/50">
          Pay-as-you-go — no subscription. Credits never expire. Image = 1 credit · edit = 2 · video = 20.
        </p>
      </section>

      {sp.status === "success" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-200">
          {justCredited
            ? "Payment received — your credits have been added. Happy creating! 🎬"
            : "Payment received — your credits will appear within a few seconds. Refresh if the balance hasn't updated."}
        </div>
      )}
      {sp.status === "cancel" && (
        <div className="rounded-xl border border-white/15 bg-white/5 p-3.5 text-sm text-white/60">
          Checkout canceled — no charge was made.
        </div>
      )}

      <BuyCredits packs={CREDIT_PACKS} configured={stripeConfigured()} />

      <footer className="mt-auto pt-6 text-center text-[11px] text-white/25">
        Secure payments by Stripe · every render is saved to your gallery
      </footer>
    </main>
  );
}
