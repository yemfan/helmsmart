"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock, Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AssistantAvatar } from "@/components/closeboss/AssistantAvatar";

/**
 * First-run welcome — hosted by Max, the captain of the AI real estate team.
 *
 * Flow: Max introduces himself as the agent's operations manager, runs a BRIEF
 * interview asking only the profile info we don't already have (name/brokerage
 * come from signup), then lays out a concrete setup plan. Every answer is saved
 * to the agent's profile (agents.onboarding + canonical columns) so it's part
 * of Max's memory and shapes his suggestions everywhere.
 *
 * Voice: calm, confident captain — never a chatbot. Shown once
 * (agents.onboarding_completed / localStorage); login + OAuth route here.
 */

const WELCOME_SEEN_KEY = "rb_welcome_seen_v1";

type Answers = Record<string, string>;
type Known = { name: string; brokerage: string; market: string; focus: string; goal: string };

type Question = {
  field: keyof Known;
  text: string | ((a: Answers) => string);
  input: "text" | "choice";
  choices?: string[];
  placeholder?: string;
};

const FOCUS = ["🏠 Buyers", "🔑 Sellers", "🤝 Both"];
const GOAL = ["🎯 More leads", "⚡ Faster follow-up", "🧾 Less admin", "🏡 More listings", "📣 Better marketing"];

const QUESTIONS: Question[] = [
  { field: "name", input: "text", placeholder: "Your name", text: "Quick one — what should I call you?" },
  { field: "market", input: "text", placeholder: "City or area", text: (a) => `Where do you do most of your business${a.name ? `, ${a.name}` : ""}? 📍` },
  { field: "focus", input: "choice", choices: FOCUS, text: "Who do you work with most?" },
  { field: "goal", input: "choice", choices: GOAL, text: "If I could hand you one win this month, what would it be?" },
  { field: "brokerage", input: "text", placeholder: "Your brokerage", text: "And which brokerage are you with? 🏢" },
];

type PlanItem = { key: string; icon: string; label: string; href?: string; activationKey?: string; interview?: boolean };

const PLAN: PlanItem[] = [
  { key: "profile", icon: "🧭", label: "Tell Max about you", interview: true },
  { key: "email", icon: "📧", label: "Connect your email", href: "/dashboard/settings" },
  { key: "contacts", icon: "👥", label: "Import your contacts", href: "/dashboard/leads/import", activationKey: "import_contacts" },
  { key: "social", icon: "📣", label: "Connect Facebook & Instagram", href: "/dashboard/leads/generate/connect" },
  { key: "receptionist", icon: "📞", label: "Set up your AI Receptionist", href: "/dashboard/settings", activationKey: "ai_receptionist" },
  { key: "campaign", icon: "🚀", label: "Launch your first marketing campaign", href: "/dashboard/marketing" },
];

const resolve = (t: string | ((a: Answers) => string), a: Answers) => (typeof t === "function" ? t(a) : t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Msg = { id: number; role: "max" | "user"; text: string };

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [currentAsk, setCurrentAsk] = useState<Question | null>(null);
  const [draft, setDraft] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [profileDone, setProfileDone] = useState(false);

  const answersRef = useRef<Answers>({});
  const userIdRef = useRef("");
  const answerResolver = useRef<((v: { value?: string; skipped?: boolean }) => void) | null>(null);
  const started = useRef(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pushMsg = useCallback((m: Omit<Msg, "id">) => {
    idRef.current += 1;
    setLog((prev) => [...prev, { id: idRef.current, ...m }]);
  }, []);

  const say = useCallback(
    async (line: string) => {
      setTyping(true);
      await sleep(650);
      setTyping(false);
      pushMsg({ role: "max", text: line });
      await sleep(140);
    },
    [pushMsg],
  );

  const ask = useCallback((q: Question) => {
    setCurrentAsk(q);
    return new Promise<{ value?: string; skipped?: boolean }>((res) => {
      answerResolver.current = res;
    });
  }, []);

  const persistProfile = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const a = answersRef.current;
    try {
      const supabase = supabaseBrowser();
      const agentUpdate: Record<string, unknown> = {
        onboarding: { ...a, completed_at: new Date().toISOString() },
      };
      if (a.brokerage?.trim()) agentUpdate.brokerage = a.brokerage.trim();
      // `.select()` so a write that matches NO rows is visible. Supabase resolves
      // rather than throws on a failed update, so the old bare await reported
      // success for a write that never happened — which is how every agent
      // finished onboarding with `onboarding = {}` and no service area, while
      // the prompt quietly rendered "" everywhere it expected their market.
      const { data: updated, error: agentErr } = await supabase
        .from("agents")
        .update(agentUpdate)
        .eq("auth_user_id", uid)
        .select("id");
      if (agentErr) {
        console.error("[welcome] could not save your answers to agents:", agentErr.message);
      } else if (!updated || updated.length === 0) {
        console.error(
          "[welcome] onboarding answers matched no agent row for auth_user_id",
          uid,
          "— answers were not saved.",
        );
      }
      if (a.name?.trim()) {
        const { error: profErr } = await supabase
          .from("user_profiles")
          .upsert({ user_id: uid, full_name: a.name.trim() }, { onConflict: "user_id" });
        if (profErr) console.error("[welcome] could not save your name:", profErr.message);
      }
    } catch (e) {
      console.error("[welcome] saving your answers threw:", e);
    }
  }, []);

  // Auth gate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabaseBrowser().auth.getUser();
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

  // Real progress for the detectable setup steps.
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log, typing, currentAsk, showPlan]);

  useEffect(() => {
    if (currentAsk?.field === "name" && answersRef.current.name) setDraft(answersRef.current.name);
  }, [currentAsk]);

  // The conversation — runs once.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;

    const setAnswer = (field: string, value: string) => {
      answersRef.current = { ...answersRef.current, [field]: value };
    };

    const fetchKnown = async (): Promise<Known> => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const accountName = String((user?.user_metadata as { full_name?: string } | null)?.full_name ?? "")
        .trim()
        .split(/\s+/)[0] || "";
      let brokerage = "";
      let ob: Record<string, string> = {};
      try {
        const { data: agent } = await supabase
          .from("agents")
          .select("brokerage, onboarding")
          .eq("auth_user_id", user?.id ?? "")
          .maybeSingle();
        const row = agent as { brokerage?: string | null; onboarding?: Record<string, string> | null } | null;
        brokerage = String(row?.brokerage ?? "").trim();
        ob = row?.onboarding ?? {};
      } catch {
        /* best-effort */
      }
      return {
        name: accountName || ob.name || "",
        brokerage: brokerage || ob.brokerage || "",
        market: ob.market ?? "",
        focus: ob.focus ?? "",
        goal: ob.goal ?? "",
      };
    };

    (async () => {
      const known = await fetchKnown();
      // Seed answers with what we already know (part of Max's memory).
      for (const k of Object.keys(known) as (keyof Known)[]) {
        if (known[k]) setAnswer(k, known[k]);
      }
      const greetName = known.name ? `, ${known.name}` : "";

      await say(`👋 Welcome to CloseBoss${greetName}.`);
      await say("I'm Max — Captain of your AI Real Estate Team.");
      await say("Think of me as your operations manager. You don't have to learn every feature — just tell me what you want done, and I'll put your team on it.");

      // Brief interview — only the profile fields we don't already have.
      const toAsk = QUESTIONS.filter((q) => !known[q.field]);
      if (toAsk.length) {
        await say("First, a couple of quick questions so I can tailor everything to you.");
        for (const q of toAsk) {
          await say(resolve(q.text, answersRef.current));
          const r = await ask(q);
          setCurrentAsk(null);
          if (!r.skipped && r.value) setAnswer(q.field, r.value);
        }
        await say("Got it — that's on file. I'll keep it in mind from here on. 🧭");
        await persistProfile();
      }
      setProfileDone(true);

      await say("Here's the plan to get your business up and running.");
      setShowPlan(true);
    })();
  }, [ready, say, ask, persistProfile]);

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

  const isDone = (it: PlanItem) => (it.interview ? profileDone : it.activationKey ? Boolean(doneMap[it.activationKey]) : false);

  function submitText() {
    const v = draft.trim();
    if (!v || !currentAsk) return;
    pushMsg({ role: "user", text: v });
    setDraft("");
    answerResolver.current?.({ value: v });
    answerResolver.current = null;
  }
  function submitChoice(v: string) {
    if (!currentAsk) return;
    pushMsg({ role: "user", text: v });
    answerResolver.current?.({ value: v });
    answerResolver.current = null;
  }
  function skip() {
    if (!currentAsk) return;
    pushMsg({ role: "user", text: "Skip for now →" });
    answerResolver.current?.({ skipped: true });
    answerResolver.current = null;
  }

  function openStep(it: PlanItem) {
    if (it.interview || !it.href) return;
    markSeen();
    router.push(it.href);
  }
  function start() {
    markSeen();
    const next = PLAN.find((it) => !it.interview && !isDone(it));
    router.push(next?.href ?? "/dashboard");
  }
  function skipAll() {
    markSeen();
    router.push("/dashboard");
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <AssistantAvatar id="max" size={32} alt="Max" className="h-8 w-8" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Max</p>
            <p className="text-[11px] text-slate-500">Captain of your AI team</p>
          </div>
        </div>
        <button type="button" onClick={skipAll} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          Skip for now
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-2">
        {log.map((m) =>
          m.role === "max" ? (
            <div key={m.id} className="flex items-start gap-2">
              <AssistantAvatar id="max" size={30} alt="Max" className="h-[30px] w-[30px]" />
              <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-100">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-blue-600 px-4 py-2.5 text-[15px] leading-relaxed text-white">
                {m.text}
              </div>
            </div>
          ),
        )}

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
                {PLAN.map((it) => {
                  const done = isDone(it);
                  const clickable = !it.interview && !!it.href;
                  return (
                    <li key={it.key}>
                      <button
                        type="button"
                        onClick={() => openStep(it)}
                        disabled={!clickable}
                        className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition ${clickable ? "hover:bg-slate-50" : "cursor-default"}`}
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
                        {clickable && !done && (
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

      {/* Input dock — question inputs during the interview, CTA once the plan shows */}
      <div className="sticky bottom-0 bg-slate-50/95 py-3 backdrop-blur">
        {currentAsk && currentAsk.input === "choice" ? (
          <div className="flex flex-wrap gap-2">
            {currentAsk.choices?.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => submitChoice(c)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:border-amber-300 hover:bg-amber-50/60"
              >
                {c}
              </button>
            ))}
            <button type="button" onClick={skip} className="rounded-full px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600">
              Skip
            </button>
          </div>
        ) : currentAsk && currentAsk.input === "text" ? (
          <div className="flex items-end gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitText();
                }
              }}
              placeholder={currentAsk.placeholder ?? "Type your answer…"}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
            <button type="button" onClick={skip} className="px-2 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600">
              Skip
            </button>
            <button
              type="button"
              onClick={submitText}
              disabled={!draft.trim()}
              aria-label="Send"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : showPlan ? (
          <div className="flex flex-col items-center gap-2">
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
        ) : null}
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: delay }} />;
}
