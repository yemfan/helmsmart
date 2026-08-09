import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import OpportunityFeed from "@/components/OpportunityFeed";
import { listCampaigns } from "@/lib/campaigns";
import { listOpenOpportunities } from "@/lib/opportunities";
import { aiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The discovery sources feeding the feed (trends/competitors/performance are
// live; seasonal is next).
const SOURCES = [
  { emoji: "🔥", name: "Trends", desc: "What's going viral in your niche right now — formats and hooks worth riding." },
  { emoji: "🥊", name: "Competitors", desc: "Angles your competitors are using (and gaps they're leaving open)." },
  { emoji: "📈", name: "Your performance", desc: "What's already working for you — do more of it, deliberately." },
  { emoji: "🗓️", name: "Seasonal", desc: "Holidays, events, and moments your audience already cares about. (Coming next.)" },
];

/**
 * Opportunities — the discovery feed. Scouts run automatically (cron) and on
 * demand; every card explains WHY and ends in a human decision.
 */
export default async function OpportunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: brandKit }, campaigns, opportunities] = await Promise.all([
    supabase.from("profiles").select("credits").eq("user_id", user.id).single(),
    supabase.from("brand_kits").select("brand_name").eq("user_id", user.id).maybeSingle(),
    listCampaigns(user.id),
    listOpenOpportunities(user.id),
  ]);

  const hasBrand = Boolean(brandKit?.brand_name);
  const hasPlaybook = campaigns.length > 0;
  const ready = hasBrand || hasPlaybook;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">🎯 Opportunities</h2>
        <p className="text-sm text-slate-500">
          The best things your business could do next — discovered continuously, scored by value and urgency, each one
          explaining <em>why</em>. You decide what happens.
        </p>
      </section>

      <OpportunityFeed initial={opportunities} aiConfigured={aiConfigured()} />

      {opportunities.length === 0 && (
        <section className="rounded-2xl border border-boss-violet/20 bg-boss-violet/5 p-5">
          <h3 className="text-sm font-semibold text-slate-900">Where opportunities come from</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <div key={s.name} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="text-sm font-semibold text-slate-900">
                  <span aria-hidden className="mr-1.5">{s.emoji}</span>
                  {s.name}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!ready && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Get discovery-ready</h3>
          <SetupRow
            done={hasBrand}
            title="Fill in your Brand Kit"
            desc="Your voice, audience, and colors — discovery scouts search your niche with it."
            href="/settings?tab=brand"
            cta="Open Brand Kit"
          />
          <SetupRow
            done={hasPlaybook}
            title="Start a playbook"
            desc="Its market research (competitors, pillars) is the first opportunity source."
            href="/playbooks"
            cta="Start one"
          />
        </section>
      )}
    </main>
  );
}

function SetupRow({
  done,
  title,
  desc,
  href,
  cta,
}: {
  done: boolean;
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span
        aria-hidden
        className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-500/15 text-emerald-600" : "bg-slate-100 text-slate-400"
        }`}
      >
        {done ? "✓" : "○"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      {!done && (
        <Link
          href={href}
          className="shrink-0 rounded-lg bg-boss-violet px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}
