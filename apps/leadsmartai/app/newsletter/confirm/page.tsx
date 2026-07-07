import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Double opt-in confirmation landing page (Phase 2, public).
 *
 * Reads ?token (confirm_token) and, via the service-role client, stamps
 * confirmed_at = now() and status = 'subscribed' for that row. Idempotent:
 * an already-confirmed token still shows success. An unknown/invalid token
 * shows a gentle "link expired" message. RLS-deny table → service role only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { searchParams: Promise<{ token?: string | string[] }> };

type Result = "confirmed" | "invalid";

async function confirm(token: string): Promise<Result> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return "invalid";
  if (!UUID_RE.test(token)) return "invalid";

  // Look up the row by confirm_token first so an already-confirmed token still
  // resolves to success (idempotent), and an unknown token is "invalid".
  const { data: found, error: findErr } = await supabaseServer
    .from("newsletter_subscriptions")
    .select("id, confirmed_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (findErr || !found) return "invalid";

  const row = found as { id: string; confirmed_at: string | null };
  if (row.confirmed_at) return "confirmed"; // already confirmed → idempotent

  const { error: updErr } = await supabaseServer
    .from("newsletter_subscriptions")
    .update({ confirmed_at: new Date().toISOString(), status: "subscribed" })
    .eq("id", row.id);

  if (updErr) return "invalid";
  return "confirmed";
}

export default async function NewsletterConfirmPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = (raw ?? "").trim();

  const result = token ? await confirm(token) : "invalid";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">
          RealtyBoss
        </p>
        {result === "confirmed" ? (
          <>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">You're confirmed</h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-600">
              Thanks for confirming your subscription to the RealtyBoss weekly
              housing briefing. Your first issue is on its way.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              This link has expired
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-600">
              We couldn't confirm this subscription — the link may have expired or
              already been used. You can subscribe again to get a fresh
              confirmation email.
            </p>
          </>
        )}
        <Link
          href="/newsletter"
          className="mt-8 inline-flex items-center rounded-lg bg-[#0072ce] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#005ca8]"
        >
          {result === "confirmed" ? "Browse past issues →" : "Back to the newsletter →"}
        </Link>
      </div>
    </main>
  );
}
