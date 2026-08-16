import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Unsubscribe landing page (Phase 2, public GET). Reads ?token
 * (unsubscribe_token) and sets status = 'unsubscribed' via the service-role
 * client. Idempotent: an already-unsubscribed or unknown token still shows the
 * friendly "you've been unsubscribed" confirmation (we never leak whether an
 * address is on the list). RLS-deny table → service role only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { searchParams: Promise<{ token?: string | string[] }> };

async function unsubscribe(token: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  if (!UUID_RE.test(token)) return;
  await supabaseServer
    .from("newsletter_subscriptions")
    .update({ status: "unsubscribed" })
    .eq("unsubscribe_token", token);
}

export default async function NewsletterUnsubscribePage({ searchParams }: Props) {
  const t = await getServerT();
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = (raw ?? "").trim();

  // Best-effort; always show the same confirmation regardless of token validity.
  if (token) await unsubscribe(token);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">
          CloseBoss
        </p>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          You've been unsubscribed
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-600">
          You won't receive any more CloseBoss weekly housing briefings. If this
          was a mistake, you can subscribe again anytime.
        </p>
        <Link
          href="/newsletter"
          className="mt-8 inline-flex items-center rounded-lg bg-[#0072ce] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#005ca8]"
        >
          Back to the newsletter →
        </Link>
      </div>
    </main>
  );
}
