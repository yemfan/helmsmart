"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEffect } from "react";
import { ArrowRight, Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AssistantAvatar } from "@/components/realtyboss/AssistantAvatar";

/**
 * Post-login welcome — the agent's first-run onboarding, hosted by Max, the
 * captain of the AI real estate team. The page introduces the team and sells
 * the signature "Ask Max" surface: every example prompt (and the free-form
 * box) deep-links into the real command center at /dashboard/boss?ask=…,
 * which prefills the command bar so the agent can send it with one tap.
 *
 * Shown once per device (localStorage flag, set on "Enter my dashboard" / when
 * the agent launches an Ask Max prompt). Login routes first-time agents here;
 * see app/login/page.tsx.
 */

const WELCOME_SEEN_KEY = "rb_welcome_seen_v1";

const TEAM = [
  { id: "emma", name: "Emma", role: "Receptionist" },
  { id: "chris", name: "Chris", role: "Sales" },
  { id: "ruby", name: "Ruby", role: "Marketing" },
  { id: "grace", name: "Grace", role: "Transactions" },
  { id: "oliver", name: "Oliver", role: "Accounting" },
];

const PROMPTS = [
  {
    emoji: "💡",
    label: "I have an idea to win more listings",
    ask: "I have an idea to win more listings — help me turn it into a plan.",
  },
  {
    emoji: "✅",
    label: "Follow up with my hot leads today",
    ask: "Follow up with all my hot leads today.",
  },
  {
    emoji: "📊",
    label: "How did my business do this week?",
    ask: "How did my business do this week?",
  },
  {
    emoji: "❓",
    label: "What should I focus on next?",
    ask: "What should I focus on next?",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [ready, setReady] = useState(false);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) {
          router.replace("/login?redirect=/welcome");
          return;
        }
        const name = String(
          (user.user_metadata as { full_name?: string } | null)?.full_name ?? "",
        ).trim();
        if (!cancelled) {
          setFirstName(name.split(/\s+/)[0] ?? "");
          setReady(true);
        }
      } catch {
        // Session lookup failed — still show the page generically.
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function markSeen() {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function goAsk(text: string) {
    const q = text.trim();
    if (!q) return;
    markSeen();
    router.push(`/dashboard/boss?ask=${encodeURIComponent(q)}`);
  }

  function enterDashboard() {
    markSeen();
    router.push("/dashboard");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-slate-900">CloseBoss</span>
        <button
          type="button"
          onClick={enterDashboard}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Skip for now
        </button>
      </div>

      {/* Hero — Max introduces himself */}
      <section className="text-center">
        <div className="mx-auto mb-4 h-28 w-28 rounded-full ring-4 ring-amber-400/70 ring-offset-2">
          <AssistantAvatar id="max" size={112} alt="Max" className="h-28 w-28" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
          Meet your captain
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {firstName ? `Hi ${firstName} — I'm Max.` : "Hi — I'm Max."}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
          Captain of your AI real estate team — Emma, Chris, Ruby, Grace &amp; Oliver. I run the
          team so you don&apos;t have to. Tell me what you need and I&apos;ll take it from here.
        </p>
      </section>

      {/* The signature feature — Ask Max */}
      <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 text-center">
          <h2 className="text-2xl font-bold text-white">
            Just <span className="text-amber-400">Ask Max</span>.
          </h2>
          <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-relaxed text-slate-300">
            Have a business idea? Want something done? Want to know how your business is
            performing? Have a question? Ask me — I&apos;ll handle it.
          </p>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="grid gap-2 sm:grid-cols-2">
            {PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => goAsk(p.ask)}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/60"
              >
                <span className="text-lg" aria-hidden>
                  {p.emoji}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-800">{p.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-amber-500" aria-hidden />
              </button>
            ))}
          </div>

          {/* Free-form Ask Max box */}
          <div className="mt-3 flex items-end gap-2">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  goAsk(ask);
                }
              }}
              placeholder="Or ask Max anything…"
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="button"
              onClick={() => goAsk(ask)}
              disabled={!ask.trim()}
              aria-label="Ask Max"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {/* Meet the team */}
      <section className="mt-9">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Your team, ready to work
        </p>
        <div className="mt-4 flex flex-wrap items-start justify-center gap-5">
          {TEAM.map((m) => (
            <div key={m.id} className="w-16 text-center">
              <AssistantAvatar id={m.id} size={56} alt={m.name} className="mx-auto h-14 w-14" />
              <p className="mt-1.5 text-xs font-semibold text-slate-800">{m.name}</p>
              <p className="text-[11px] leading-tight text-slate-500">{m.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTAs */}
      <section className="mt-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={enterDashboard}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Enter my dashboard
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
        <Link
          href="/dashboard/boss"
          onClick={markSeen}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Open the full command center
        </Link>
      </section>
    </main>
  );
}
