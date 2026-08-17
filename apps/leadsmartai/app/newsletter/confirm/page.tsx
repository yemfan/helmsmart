import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { getServerT } from "@/lib/i18n/server";

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

type Result =
  | { status: "confirmed"; agentName: string | null }
  | { status: "invalid" };

async function confirm(token: string): Promise<Result> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return { status: "invalid" };
  if (!UUID_RE.test(token)) return { status: "invalid" };

  // Look up the row by confirm_token first so an already-confirmed token still
  // resolves to success (idempotent), and an unknown token is "invalid".
  const { data: found, error: findErr } = await supabaseServer
    .from("newsletter_subscriptions")
    .select("id, confirmed_at, agent_id")
    .eq("confirm_token", token)
    .maybeSingle();

  if (findErr || !found) return { status: "invalid" };

  const row = found as {
    id: string;
    confirmed_at: string | null;
    agent_id: number | string | null;
  };

  // Best-effort agent name for the confirmed copy (never blocks confirmation).
  const agentName = await agentNameFor(row.agent_id);

  if (row.confirmed_at) return { status: "confirmed", agentName }; // idempotent

  const { error: updErr } = await supabaseServer
    .from("newsletter_subscriptions")
    .update({ confirmed_at: new Date().toISOString(), status: "subscribed" })
    .eq("id", row.id);

  if (updErr) return { status: "invalid" };
  return { status: "confirmed", agentName };
}

async function agentNameFor(
  agentId: number | string | null,
): Promise<string | null> {
  if (agentId === null || agentId === undefined) return null;
  const aid = typeof agentId === "number" ? agentId : Number(agentId);
  if (!Number.isFinite(aid)) return null;
  try {
    const a = await loadPresentationAgent(aid);
    return a.name?.trim() || null;
  } catch {
    return null;
  }
}

export default async function NewsletterConfirmPage({ searchParams }: Props) {
  const t = await getServerT();
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = (raw ?? "").trim();

  const result: Result = token ? await confirm(token) : { status: "invalid" };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">
          CloseBoss
        </p>
        {result.status === "confirmed" ? (
          <>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">{t("pages.dashFragments.confirmed", { ns: "dashboard" })}</h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-600">
              {result.agentName
                ? `Thanks for confirming — you'll hear from ${result.agentName} each week with a plain-English housing briefing for your region.`
                : "Thanks for confirming your subscription to the CloseBoss weekly housing briefing. Your first issue is on its way."}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">{t("pages.dashFragments.linkExpired", { ns: "dashboard" })}</h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-600">{t("pages.dashFragments.couldntConfirm", { ns: "dashboard" })}</p>
          </>
        )}
        <Link
          href="/newsletter"
          className="mt-8 inline-flex items-center rounded-lg bg-[#0072ce] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#005ca8]"
        >
          {result.status === "confirmed" ? "Browse past issues →" : "Back to the newsletter →"}
        </Link>
      </div>
    </main>
  );
}
