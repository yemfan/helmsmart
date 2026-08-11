import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import { MarketingLanding } from "@/components/marketing/MarketingLanding";
import { retrieveSession } from "@/lib/stripe";
import { fulfillSession } from "@/lib/fulfill";
import { getConnectionStatuses } from "@/lib/social";
import { listCampaigns, listDrafts, listHistory, listScheduled } from "@/lib/campaigns";
import { listOpenOpportunities } from "@/lib/opportunities";
import { listLearnings } from "@/lib/learnings";
import { engagementScore } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "youtube", "tiktok"];
const TYPE_EMOJI: Record<string, string> = { text: "✍️", image: "🖼️", video: "🎬" };

function fmt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Home — mission control. One question: what should I do today?
 * A briefing, not a dashboard: today's opportunities, the action queue,
 * a learning highlight, business health, and quick access to the Studio.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; subscribed?: string; youtube?: string; social?: string; provider?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Logged-out visitors get the public marketing homepage (marketingbossai.com)
  // instead of an immediate bounce to /login.
  if (!user) return <MarketingLanding />;

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
      // webhook backstops fulfillment
    }
  }

  const [{ data: profile }, socialStatuses, campaigns, drafts, scheduled, history, { data: brandKit }, opportunities, learnings] =
    await Promise.all([
      supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
      getConnectionStatuses(user.id, ALL_PLATFORMS),
      listCampaigns(user.id),
      listDrafts(user.id, 5),
      listScheduled(user.id),
      listHistory(user.id, 20),
      supabase.from("brand_kits").select("brand_name").eq("user_id", user.id).maybeSingle(),
      listOpenOpportunities(user.id, 2).catch(() => []),
      listLearnings(user.id, 1).catch(() => []),
    ]);

  const credits = profile?.credits ?? 0;
  const connectedCount = ALL_PLATFORMS.filter((p) => socialStatuses[p]?.connected).length;
  const activePlaybooks = campaigns.filter((c) => c.status === "active");
  const upcoming = scheduled.slice(0, 3);

  // Learning highlight v1 — the best-performing recent post, straight from the
  // metrics the cron already collects. (Narrative learnings arrive in Phase 5.)
  const scored = history
    .filter((p) => p.status === "published")
    .map((p) => ({ p, score: engagementScore(p.metrics) }))
    .sort((a, b) => b.score - a.score);
  const topPost = scored.length > 0 && scored[0].score > 0 ? scored[0] : null;

  const ytNotice =
    sp.youtube === "connected"
      ? { kind: "ok" as const, text: "YouTube connected. You can publish videos now. 🎬" }
      : sp.youtube === "denied"
        ? { kind: "warn" as const, text: "YouTube connection was cancelled." }
        : sp.youtube === "error"
          ? { kind: "warn" as const, text: "Couldn't connect YouTube — please try again." }
          : null;

  const socialNotice =
    sp.social === "connected"
      ? { kind: "ok" as const, text: `${providerLabel(sp.provider)} connected. ✨` }
      : sp.social === "denied"
        ? { kind: "warn" as const, text: `${providerLabel(sp.provider)} connection was cancelled.` }
        : sp.social === "error"
          ? { kind: "warn" as const, text: `Couldn't connect ${providerLabel(sp.provider)} — please try again.` }
          : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={credits} />

      {creditsAdded !== null && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-600">
          Payment received — {creditsAdded > 0 ? `${creditsAdded} credits added` : "your credits have been added"}.
          Happy creating! 🎬
        </div>
      )}
      {sp.subscribed && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-600">
          You&apos;re subscribed 🎉 Your monthly credits will appear within a few seconds — refresh if the balance
          hasn&apos;t updated yet.
        </div>
      )}
      {[ytNotice, socialNotice].map((n, i) =>
        n ? (
          <div
            key={i}
            className={`rounded-xl border p-3.5 text-sm ${
              n.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {n.text}
          </div>
        ) : null,
      )}

      {/* Briefing header */}
      <section className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">
          {brandKit?.brand_name ? `${brandKit.brand_name} — today's briefing` : "Today's briefing"}
        </h2>
        <p className="text-sm text-slate-500">What should we do today? Here&apos;s where things stand.</p>
      </section>

      {/* Business health */}
      <section className="grid grid-cols-3 gap-3">
        <HealthTile label="Credits" value={String(credits)} href="/settings?tab=billing" />
        <HealthTile label="Channels" value={`${connectedCount}/${ALL_PLATFORMS.length}`} href="/settings?tab=connections" />
        <HealthTile label="Playbooks" value={String(activePlaybooks.length)} href="/playbooks" />
      </section>

      {/* Today's opportunities */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">🎯 Today&apos;s opportunities</h3>
          {opportunities.length > 0 && (
            <Link href="/opportunities" className="text-xs text-slate-500 transition hover:text-slate-900">
              All opportunities →
            </Link>
          )}
        </div>
        {opportunities.length > 0 ? (
          <div className="flex flex-col gap-2">
            {opportunities.map((o) => (
              <Link
                key={o.id}
                href="/opportunities"
                className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-boss-violet/40"
              >
                <div className="text-sm font-semibold text-slate-900">{o.title}</div>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{o.reasoning}</p>
              </Link>
            ))}
          </div>
        ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {activePlaybooks.length === 0 ? (
            <>
              The fastest opportunity right now: start a playbook. Point us at your product or business link — the AI
              researches your market and plans what to post.{" "}
              <Link href="/playbooks" className="font-semibold text-boss-gold underline underline-offset-2">
                Start a playbook →
              </Link>
            </>
          ) : drafts.length > 0 ? (
            <>
              Your playbooks drafted {drafts.length} post{drafts.length === 1 ? "" : "s"} for review — approving them
              is today&apos;s highest-leverage move.{" "}
              <Link href="/actions" className="font-semibold text-boss-gold underline underline-offset-2">
                Review now →
              </Link>
            </>
          ) : (
            <>
              Your playbooks are running on schedule. Scan for fresh openings — trends, competitor gaps, and
              what&apos;s already working — under{" "}
              <Link href="/opportunities" className="font-semibold text-boss-gold underline underline-offset-2">
                Opportunities
              </Link>
              .
            </>
          )}
        </div>
        )}
      </section>

      {/* Action queue */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">⚡ Action queue</h3>
          <Link href="/actions" className="text-xs text-slate-500 transition hover:text-slate-900">
            All actions →
          </Link>
        </div>
        {drafts.length === 0 && upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Nothing queued.{" "}
            <Link href="/actions/new" className="font-medium text-boss-gold hover:underline">
              Create a post
            </Link>{" "}
            or let a{" "}
            <Link href="/playbooks" className="font-medium text-boss-gold hover:underline">
              playbook
            </Link>{" "}
            plan for you.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {drafts.map((p) => (
              <Link
                key={p.id}
                href={p.campaign_id ? `/playbooks/${p.campaign_id}` : "/actions"}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-boss-violet/40"
              >
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
                  Waiting approval
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {TYPE_EMOJI[p.type]} {p.title || p.caption || p.angle}
                </span>
              </Link>
            ))}
            {upcoming.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                {p.status === "scheduled" ? (
                  <span className="rounded-full bg-boss-violet/15 px-2 py-0.5 text-xs font-semibold text-boss-violet">
                    {fmt(p.scheduled_for)}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                    ✓ Publishing soon
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {TYPE_EMOJI[p.type]} {p.title || p.caption}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Learning highlight */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">📈 Learning highlight</h3>
          <Link href="/learning" className="text-xs text-slate-500 transition hover:text-slate-900">
            All learning →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {learnings.length > 0 ? (
            <>
              <span className="font-medium text-slate-900">{learnings[0].insight}</span>{" "}
              <Link href="/learning" className="font-semibold text-boss-gold underline underline-offset-2">
                See the evidence →
              </Link>
            </>
          ) : topPost ? (
            <>
              Your best recent post: <span className="font-medium text-slate-900">“{topPost.p.title || topPost.p.caption?.slice(0, 60)}”</span>{" "}
              ({TYPE_EMOJI[topPost.p.type]} {topPost.p.angle || topPost.p.type}, engagement {topPost.score}). More like
              this is the safest bet.
            </>
          ) : (
            <>Publish a few posts and the engagement data will start telling us what works for your audience.</>
          )}
        </div>
      </section>

      {/* Quick studio */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">🧰 Quick studio</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickTile href="/studio" emoji="🖼️" label="Image" />
          <QuickTile href="/studio" emoji="🎬" label="Video" />
          <QuickTile href="/actions/ugc" emoji="🎥" label="UGC ad" />
          <QuickTile href="/actions/new" emoji="✨" label="AI post" />
        </div>
      </section>

      <footer className="mt-auto pt-6 text-center text-[11px] text-slate-400">
        The AI recommends. You decide. · MarketingBoss
      </footer>
    </main>
  );
}

function HealthTile({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-boss-violet/40"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-xl font-bold text-slate-900">{value}</span>
    </Link>
  );
}

function QuickTile({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 transition hover:border-boss-violet/40 hover:text-slate-900"
    >
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      {label}
    </Link>
  );
}

function providerLabel(provider?: string): string {
  switch (provider) {
    case "meta":
      return "Facebook & Instagram";
    case "threads":
      return "Threads";
    case "linkedin":
      return "LinkedIn";
    case "pinterest":
      return "Pinterest";
    default:
      return "Account";
  }
}
