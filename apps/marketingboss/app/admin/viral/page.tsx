import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import { pipelineStats, SCORE_WEIGHTS } from "@/lib/viralIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email: string | undefined): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/** Marketing-Intelligence pipeline monitor. Gated by ADMIN_EMAILS (unset → 404). */
export default async function AdminViralPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? undefined)) notFound();

  const { data: profile } = await supabase.from("profiles").select("credits").eq("user_id", user.id).single();
  const stats = (await pipelineStats().catch(() => ({ migrated: false }))) as {
    migrated: boolean;
    items?: number;
    templates?: number;
    byStatus?: Record<string, number>;
    byVelocity?: Record<string, number>;
    lastDiscoveredAt?: string | null;
    avgScore?: number;
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8 sm:py-12">
      <Nav email={user.email ?? ""} credits={profile?.credits ?? 0} />
      <section className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">🛠 Intelligence pipeline</h2>
        <p className="text-sm text-slate-500">Shared viral library — discovery, analysis, and templates at a glance.</p>
      </section>

      {!stats.migrated ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Migration 0022 isn&apos;t applied yet — the library tables don&apos;t exist.
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Library items" value={String(stats.items ?? 0)} />
            <Tile label="Templates" value={String(stats.templates ?? 0)} />
            <Tile label="Avg viral score" value={String(stats.avgScore ?? 0)} />
            <Tile
              label="Last discovery"
              value={stats.lastDiscoveredAt ? new Date(stats.lastDiscoveredAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never"}
            />
          </section>

          <Breakdown title="By status" data={stats.byStatus ?? {}} />
          <Breakdown title="By velocity" data={stats.byVelocity ?? {}} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Score weights (code constant)</h3>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
              {Object.entries(SCORE_WEIGHTS).map(([k, w]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span>{k}</span>
                  <span className="font-semibold text-slate-900">{Math.round(w * 100)}%</span>
                </div>
              ))}
            </div>
          </section>

          <p className="text-[11px] text-slate-400">
            Discovery runs inside the *​/15 cron, once per ~22h, staged (scout+analyze in one pass; Template DNA for
            the top 3 new items only). Rights posture: metadata-only, remix-as-concept.
          </p>
        </>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-xl font-bold text-slate-900">{value}</span>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">
            {k}: <span className="font-semibold text-slate-900">{v}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
