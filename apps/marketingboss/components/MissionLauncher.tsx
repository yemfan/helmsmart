"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "What do you want to accomplish?" — the primary entry to the whole product.
 *
 * One input, above everything else on Home. The examples are not decoration:
 * a blank box invites "make me a post", which is the one thing the old Studio
 * already did. The examples teach that a goal is the unit of work now.
 */

const EXAMPLES = [
  "Promote my new restaurant for the next 30 days",
  "Grow my Instagram following",
  "Get more customers from TikTok",
  "Launch my new product",
];

type Needs = "brand_profile" | "destination" | "not_ready";

/** The gates answer with what to do next, so the error carries its own fix. */
const FIX: Record<Needs, { label: string; href: string } | null> = {
  brand_profile: { label: "Add your website", href: "/settings" },
  destination: { label: "Add a destination", href: "/settings" },
  not_ready: null,
};

export default function MissionLauncher({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; needs: Needs | null } | null>(null);

  async function launch() {
    const goal = objective.trim();
    if (!goal || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: goal }),
      });
      const data = (await res.json().catch(() => ({}))) as { missionId?: string; error?: string; needs?: Needs };
      if (!res.ok || !data.missionId) {
        setError({ message: data.error ?? "Something went wrong starting that. Please try again.", needs: data.needs ?? null });
        return;
      }
      router.push(`/missions/${data.missionId}`);
    } catch {
      setError({ message: "I couldn't reach the server. Check your connection and try again.", needs: null });
    } finally {
      setBusy(false);
    }
  }

  const fix = error?.needs ? FIX[error.needs] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-boss-violet text-sm font-bold text-white">
          N
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">What do you want to accomplish?</h2>
          <p className="text-xs text-slate-500">Nina and the team will work out how.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") launch();
          }}
          disabled={disabled || busy}
          placeholder="Get more customers from Instagram this month"
          aria-label="Your marketing goal"
          className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-boss-violet disabled:bg-slate-50"
        />
        <button
          onClick={launch}
          disabled={disabled || busy || !objective.trim()}
          className="shrink-0 rounded-xl bg-boss-violet px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Starting…" : "Start"}
        </button>
      </div>

      {busy && (
        <p className="mt-2 text-xs text-slate-500">
          Nina is planning this — it can take a minute. You&apos;ll land on the mission page as soon as she&apos;s started.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{error.message}</p>
          {fix && (
            <a href={fix.href} className="mt-1.5 inline-block font-semibold underline underline-offset-2">
              {fix.label} →
            </a>
          )}
        </div>
      )}

      {!busy && !error && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setObjective(ex)}
              disabled={disabled}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-boss-violet hover:text-slate-900 disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
