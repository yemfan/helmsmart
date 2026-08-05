"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AssistantAvatar } from "@/components/realtyboss/AssistantAvatar";

/**
 * First-run welcome — hosted by Max, the captain of the AI real estate team.
 * Max introduces himself as the agent's operations manager, then lays out a
 * concrete 5-step setup plan. Each step deep-links to its real setup page;
 * the two we can detect (contacts, receptionist) check off automatically.
 *
 * Voice: calm, confident, proactive — a dependable captain, never a chatbot.
 * Shown once (agents.onboarding_completed / localStorage); login + OAuth
 * callback route first-run agents here.
 */

const WELCOME_SEEN_KEY = "rb_welcome_seen_v1";

const WELCOME_LINES = [
  "👋 Welcome to CloseBoss.",
  "I'm Max — Captain of your AI Real Estate Team.",
  "Think of me as your operations manager. You don't have to learn every feature of CloseBoss — just tell me what you want done, and I'll put your team on it.",
  "Today, let's get your business up and running.",
];

type Item = { key: string; icon: string; label: string; href: string; activationKey?: string };

const CHECKLIST: Item[] = [
  { key: "email", icon: "📧", label: "Connect your email", href: "/dashboard/settings" },
  { key: "contacts", icon: "👥", label: "Import your contacts", href: "/dashboard/leads/import", activationKey: "import_contacts" },
  { key: "social", icon: "📣", label: "Connect Facebook & Instagram", href: "/dashboard/leads/generate/connect" },
  { key: "receptionist", icon: "📞", label: "Set up your AI Receptionist", href: "/dashboard/settings", activationKey: "ai_receptionist" },
  { key: "campaign", icon: "🚀", label: "Launch your first marketing campaign", href: "/dashboard/marketing" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});

  const userIdRef = useRef("");
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auth gate.
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
        userIdRef.current = user.id;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Real progress for the steps we can detect.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/onboarding-checklist", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        const steps: { key?: string; done?: boolean }[] = data?.checklist?.steps ?? [];
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        for (const s of steps) if (s.key) map[s.key] = Boolean(s.done);
        setDoneMap(map);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Play the welcome, then reveal the plan.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    (async () => {
      for (const line of WELCOME_LINES) {
        setTyping(true);
        await sleep(700);
        setTyping(false);
        setLines((prev) => [...prev, line]);
        await sleep(160);
      }
      setTyping(true);
      await sleep(600);
      setTyping(false);
      setShowPlan(true);
    })();
  }, [ready]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, typing, showPlan]);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    const uid = userIdRef.current;
    if (uid) {
      try {
        void supabaseBrowser().from("agents").update({ onboarding_completed: true }).eq("auth_user_id", uid);
      } catch {
        /* best-effort */
      }
    }
  }, []);

  const isDone = (it: Item) => (it.activationKey ? Boolean(doneMap[it.activationKey]) : false);

  function start() {
    markSeen();
    const next = CHECKLIST.find((it) => !isDone(it));
    router.push(next ? next.href : "/dashboard");
  }

  function openStep(it: Item) {
    markSeen();
    router.push(it.href);
  }

  function skip() {
    markSeen();
    router.push("/dashboard");
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <AssistantAvatar id="max" size={32} alt="Max" className="h-8 w-8" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Max</p>
            <p className="text-[11px] text-slate-500">Captain of your AI team</p>
          </div>
        </div>
        <button type="button" onClick={skip} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          Skip for now
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-2">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <AssistantAvatar id="max" size={30} alt="Max" className="h-[30px] w-[30px]" />
            <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-100">
              {line}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex items-center gap-2">
            <AssistantAvatar id="max" size={30} alt="Max" className="h-[30px] w-[30px]" />
            <div className="flex gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}

        {showPlan && (
          <div className="flex items-start gap-2">
            <AssistantAvatar id="max" size={30} alt="Max" className="h-[30px] w-[30px]" />
            <div className="w-full max-w-[92%] overflow-hidden rounded-2xl rounded-tl-md border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Your setup plan</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> ~5 minutes
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {CHECKLIST.map((it) => {
                  const done = isDone(it);
                  return (
                    <li key={it.key}>
                      <button
                        type="button"
                        onClick={() => openStep(it)}
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] ${
                            done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                          aria-hidden
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : it.icon}
                        </span>
                        <span className={`flex-1 text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {it.label}
                        </span>
                        {!done && (
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-amber-500" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* CTA dock */}
      {showPlan && (
        <div className="sticky bottom-0 flex flex-col items-center gap-2 bg-slate-50/95 py-4 backdrop-blur">
          <button
            type="button"
            onClick={start}
            className="inline-flex w-full max-w-sm items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Let's build your AI team
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <Link href="/dashboard/boss" onClick={markSeen} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
            Or just Ask Max anything
          </Link>
        </div>
      )}
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: delay }} />;
}
