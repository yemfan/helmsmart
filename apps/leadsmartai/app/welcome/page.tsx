"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AssistantAvatar } from "@/components/realtyboss/AssistantAvatar";

/**
 * Post-login onboarding as a conversation with Max, the captain of the AI
 * real estate team. Max greets the agent, gets acquainted, then asks the
 * onboarding questions one at a time (each skippable, revisited at the end),
 * previews what the team does, and closes on the signature "Ask Max" surface.
 *
 * The flow is scripted (deterministic, controllable) with typing beats for a
 * chat feel. Answers live in localStorage for now; the real Ask Max brain is
 * the command center at /dashboard/boss (the closing prompts deep-link there).
 */

const WELCOME_SEEN_KEY = "rb_welcome_seen_v1";
const ANSWERS_KEY = "rb_onboarding_answers_v1";

type Answers = Record<string, string>;

type Question = {
  field: string;
  text: string | ((a: Answers) => string);
  input: "text" | "choice";
  choices?: string[];
  placeholder?: string;
  after?: (a: Answers) => string;
};

const INTRO_LINES = [
  "👋 Hey! I'm Max.",
  "I'm the captain of your AI real estate team here at CloseBoss — Emma, Chris, Ruby, Grace and Oliver do the heavy lifting; I make sure it all runs like clockwork. 🧭",
  "Give me a minute to get to know you and I'll tune everything to how YOU work. Skip anything you like — we can always circle back. 🙌",
];

const QUESTIONS: Question[] = [
  {
    field: "name",
    input: "text",
    placeholder: "What should I call you?",
    text: "First things first — what should I call you?",
    after: (a) => `Awesome, ${a.name || "friend"} — great to meet you! 🤝`,
  },
  {
    field: "market",
    input: "text",
    placeholder: "City or area",
    text: "Where do you do most of your business? 📍",
  },
  {
    field: "focus",
    input: "choice",
    choices: ["🏠 Buyers", "🔑 Sellers", "🤝 Both"],
    text: "Who do you work with most?",
  },
  {
    field: "goal",
    input: "choice",
    choices: ["🎯 More leads", "⚡ Faster follow-up", "🧾 Less admin", "🏡 More listings", "📣 Better marketing"],
    text: "If I could hand you ONE win this month, what would it be?",
  },
  {
    field: "brokerage",
    input: "text",
    placeholder: "Your brokerage",
    text: "Last one — what brokerage are you with? 🏢",
    after: () => "Perfect. 🎉",
  },
];

const TEAM_FUNCTIONS = [
  { id: "emma", name: "Emma", fn: "Answers every call & books appointments" },
  { id: "chris", name: "Chris", fn: "Follows up with leads by call & text" },
  { id: "ruby", name: "Ruby", fn: "Creates & posts your marketing" },
  { id: "grace", name: "Grace", fn: "Handles offers & keeps deals on track" },
  { id: "oliver", name: "Oliver", fn: "Tracks expenses & the numbers" },
];

const ASK_MAX_PROMPTS = [
  { emoji: "💡", label: "I've got an idea to grow my business", ask: "I have an idea to grow my business — help me turn it into a plan." },
  { emoji: "✅", label: "Follow up with my hot leads today", ask: "Follow up with all my hot leads today." },
  { emoji: "📊", label: "How's my business doing?", ask: "How did my business do this week?" },
  { emoji: "❓", label: "What should I focus on next?", ask: "What should I focus on next?" },
];

const resolve = (t: string | ((a: Answers) => string), a: Answers) => (typeof t === "function" ? t(a) : t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Msg = { id: number; role: "max" | "user"; kind?: "text" | "features" | "askmax"; text?: string };

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [currentAsk, setCurrentAsk] = useState<(Question & { skippable: boolean }) | null>(null);
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(false);

  const answersRef = useRef<Answers>({});
  const firstNameRef = useRef("");
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

  const ask = useCallback((q: Question, skippable: boolean) => {
    setCurrentAsk({ ...q, skippable });
    return new Promise<{ value?: string; skipped?: boolean }>((res) => {
      answerResolver.current = res;
    });
  }, []);

  // Auth gate + name prefill.
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
        const name = String((user.user_metadata as { full_name?: string } | null)?.full_name ?? "").trim();
        firstNameRef.current = name.split(/\s+/)[0] ?? "";
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log, typing, currentAsk]);

  // Prefill the name box with the account's first name.
  useEffect(() => {
    if (currentAsk?.field === "name" && firstNameRef.current) setDraft(firstNameRef.current);
  }, [currentAsk]);

  // The conversation itself — runs once.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;

    const setAnswer = (field: string, value: string) => {
      answersRef.current = { ...answersRef.current, [field]: value };
      try {
        localStorage.setItem(ANSWERS_KEY, JSON.stringify(answersRef.current));
      } catch {
        /* ignore */
      }
    };

    const askOne = async (q: Question): Promise<boolean> => {
      await say(resolve(q.text, answersRef.current));
      const r = await ask(q, true);
      setCurrentAsk(null);
      if (r.skipped || !r.value) return false;
      setAnswer(q.field, r.value);
      if (q.after) await say(resolve(q.after, answersRef.current));
      return true;
    };

    (async () => {
      for (const line of INTRO_LINES) await say(line);

      const skipped: Question[] = [];
      for (const q of QUESTIONS) {
        const answered = await askOne(q);
        if (!answered) skipped.push(q);
      }

      if (skipped.length) {
        await say(
          `You breezed past ${skipped.length} — want to knock ${skipped.length > 1 ? "them" : "it"} out now? No pressure. 😊`,
        );
        const choice = await ask(
          { field: "_revisit", text: "", input: "choice", choices: ["Sure, let's do it 👍", "Maybe later"] },
          false,
        );
        setCurrentAsk(null);
        if (choice.value?.startsWith("Sure")) {
          for (const q of skipped) await askOne(q);
        }
      }

      const name = answersRef.current.name || "";
      await say("Here's what your team takes off your plate 👇");
      pushMsg({ role: "max", kind: "features" });
      await sleep(200);
      await say(name ? `And here's the part you'll love most, ${name}:` : "And here's the part you'll love most:");
      await say("Anytime you have an idea, a question, or something you want done — just Ask Max. 💬 I'll figure out who does what and get it moving.");
      pushMsg({ role: "max", kind: "askmax" });
      setDone(true);
    })();
  }, [ready, say, ask, pushMsg]);

  function markSeen() {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

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
        <button type="button" onClick={enterDashboard} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          Skip onboarding
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-2">
        {log.map((m) =>
          m.kind === "features" ? (
            <FeatureCards key={m.id} />
          ) : m.kind === "askmax" ? (
            <AskMaxCard key={m.id} onAsk={goAsk} onEnter={enterDashboard} onCommandCenter={markSeen} />
          ) : m.role === "max" ? (
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
      </div>

      {/* Input dock */}
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
            {currentAsk.skippable && (
              <button type="button" onClick={skip} className="rounded-full px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600">
                Skip for now
              </button>
            )}
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
            {currentAsk.skippable && (
              <button type="button" onClick={skip} className="px-2 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600">
                Skip
              </button>
            )}
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
        ) : done ? null : (
          <p className="text-center text-xs text-slate-400">Max is getting things ready…</p>
        )}
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: delay }} />;
}

function FeatureCards() {
  return (
    <div className="flex items-start gap-2">
      <AssistantAvatar id="max" size={30} alt="Max" className="h-[30px] w-[30px]" />
      <div className="max-w-[92%] grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEAM_FUNCTIONS.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <AssistantAvatar id={m.id} size={38} alt={m.name} className="h-[38px] w-[38px]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{m.name}</p>
              <p className="text-[12px] leading-snug text-slate-500">{m.fn}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AskMaxCard({
  onAsk,
  onEnter,
  onCommandCenter,
}: {
  onAsk: (text: string) => void;
  onEnter: () => void;
  onCommandCenter: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <AssistantAvatar id="max" size={30} alt="Max" className="h-[30px] w-[30px]" />
      <div className="w-full max-w-[92%] overflow-hidden rounded-2xl rounded-tl-md border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-center">
          <p className="text-lg font-bold text-white">
            Just <span className="text-amber-400">Ask Max</span> 💬
          </p>
        </div>
        <div className="space-y-2 px-3 py-3">
          {ASK_MAX_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onAsk(p.ask)}
              className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition hover:border-amber-300 hover:bg-amber-50/60"
            >
              <span className="text-lg" aria-hidden>{p.emoji}</span>
              <span className="flex-1 text-sm font-medium text-slate-800">{p.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-amber-500" aria-hidden />
            </button>
          ))}
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onEnter}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Enter my dashboard
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <Link href="/dashboard/boss" onClick={onCommandCenter} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              Open Ask Max
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
