import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SubscribeForm from "@/components/newsletter/SubscribeForm";
import { listRegionOptions } from "@/lib/newsletter/regions";
import { resolveAgentIdByNewsletterToken } from "@/lib/newsletter/agentToken";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Agent-branded client-newsletter signup (Phase 3, PUBLIC).
 *
 * An agent shares /newsletter/a/[token]; their clients land here and subscribe.
 * The subscription is attributed to the agent (agent_id set via agentToken), so
 * the weekly issue goes out under the AGENT's brand. Token → agents.id via the
 * service-role client; loadPresentationAgent hydrates the agent's identity.
 *
 * This is a per-agent private link, so it's noindex — we don't want each
 * agent's signup page in search results.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  // Per-agent private signup link — never index.
  return {
    title: "Subscribe — Weekly Housing Briefing",
    robots: { index: false, follow: false },
  };
}

export default async function AgentNewsletterSignupPage({ params }: Props) {
  const t = await getServerT();
  const { token: rawToken } = await params;
  const token = (rawToken ?? "").trim();
  if (!UUID_RE.test(token)) notFound();

  const agentId = await resolveAgentIdByNewsletterToken(token);
  if (agentId === null) notFound();

  const [agent, regions] = await Promise.all([
    loadPresentationAgent(agentId),
    listRegionOptions(),
  ]);

  const agentName = agent.name?.trim() || "Your agent";
  const brokerage = agent.brokerage?.trim() || null;
  const brandImg =
    (agent.logoUrl && agent.logoUrl.trim()) ||
    (agent.photoUrl && agent.photoUrl.trim()) ||
    null;
  const showImg = brandImg && /^https?:\/\//i.test(brandImg) ? brandImg : null;

  return (
    <main className="bg-white text-slate-900">
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
          {/* Agent is the headline identity; CloseBoss is the quiet platform. */}
          <div className="flex items-center gap-4">
            {showImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={showImg}
                alt={agentName}
                className="h-16 w-16 shrink-0 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#0072ce]/10 text-xl font-bold text-[#0072ce]">
                {agentName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">
                Weekly Housing Briefing
              </p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight md:text-3xl">
                Subscribe to {agentName}&apos;s Weekly Housing Briefing
              </h1>
              {brokerage && (
                <p className="mt-1 text-sm text-slate-600">{brokerage}</p>
              )}
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Every week, {agentName} sends a plain-English digest of where mortgage
            rates went and what moved the housing market — paired with a local
            market snapshot for the region you pick. No jargon, every number
            linked to its source.
          </p>

          <div className="mt-8">
            <SubscribeForm
              regions={regions}
              defaultSlug="national"
              agentToken={token}
              agentName={agentName}
            />
          </div>

          <p className="mt-6 text-xs text-slate-400">
            Delivered by {agentName}
            {brokerage ? `, ${brokerage}` : ""} · powered by{" "}
            <Link href="/" className="text-slate-500 hover:text-[#0072ce]">
              CloseBoss
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
