"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowRight, Check, Send, Sparkles, X } from "lucide-react";
import type {
  ActivationChecklist as Checklist,
  ActivationStep,
} from "@/lib/activation/checklist";

const DISMISS_KEY = "rb_boss_onboarding_dismissed_v1";

type Msg = { role: "user" | "assistant"; content: string };

type Props = {
  checklist: Checklist;
};

/**
 * Boss Assistant as a proactive onboarding CHANNEL on the dashboard overview.
 * Boss opens the conversation (AI-generated, grounded in real activation state),
 * walks the agent through the next setup step, explains the business value, and
 * takes free-form questions. Hides once setup is complete or when dismissed.
 */
export function BossOnboardingCard({ checklist }: Props) {
  const { t } = useTranslation("dashboard");
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nextStep: ActivationStep | null =
    checklist.steps.find((s) => !s.done) ?? null;
  // Cache the opening per state so we don't re-call the model on every nav.
  const openingCacheKey = `rb_boss_opening_v1:${checklist.nextStepKey ?? "done"}:${checklist.doneCount}`;

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const loadOpening = useCallback(async () => {
    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(openingCacheKey);
    } catch {
      /* ignore */
    }
    if (cached) {
      setMessages([{ role: "assistant", content: cached }]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/boss/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: [] }),
      });
      const data = await res.json().catch(() => ({}));
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : "Let's get your AI team set up — ready when you are.";
      setMessages([{ role: "assistant", content: reply }]);
      try {
        sessionStorage.setItem(openingCacheKey, reply);
      } catch {
        /* ignore */
      }
    } catch {
      setMessages([
        {
          role: "assistant",
          content:
            "Let's get your AI team working. Start with the highlighted step below — I'll be right here.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [openingCacheKey]);

  // Fetch Boss's opening message once we've mounted and know we should show.
  useEffect(() => {
    if (!mounted || dismissed || checklist.complete) return;
    if (messages.length === 0) void loadOpening();
  }, [mounted, dismissed, checklist.complete, messages.length, loadOpening]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/boss/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await res.json().catch(() => ({}));
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : "Sorry, I didn't catch that — mind trying again?";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong — try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  function hide() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (!mounted || dismissed || checklist.complete) return null;

  const pct = Math.round((checklist.doneCount / checklist.total) * 100);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header — Boss identity + real setup progress */}
      <div className="relative bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4">
        <button
          type="button"
          onClick={hide}
          aria-label={t("pages.misc.hideBossGuide")}
          className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Boss · your AI chief of staff</p>
            <p className="text-xs text-slate-300">
              {checklist.doneCount} of {checklist.total} {t("pages.dashFragments.stepsSetUp")}</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Step chips — compact progress the conversation reasons over */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {checklist.steps.map((s) => (
            <span
              key={s.key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                s.done
                  ? "bg-emerald-500/15 text-emerald-300"
                  : s.key === checklist.nextStepKey
                    ? "bg-white/15 text-white ring-1 ring-white/30"
                    : "bg-white/5 text-slate-400"
              }`}
            >
              {s.done && <Check className="h-3 w-3" aria-hidden />}
              {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="max-h-72 space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex items-start gap-2"}
          >
            {m.role === "assistant" && (
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                <Sparkles className="h-3 w-3" aria-hidden />
              </span>
            )}
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
              <Sparkles className="h-3 w-3" aria-hidden />
            </span>
            Boss is typing…
          </div>
        )}
      </div>

      {/* Next-best action — the one-click step Boss is guiding toward */}
      {nextStep && (
        <div className="border-t border-slate-100 px-5 py-3">
          {nextStep.links && nextStep.links.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                {nextStep.cta}:
              </span>
              {nextStep.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ) : nextStep.href ? (
            <Link
              href={nextStep.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {nextStep.cta}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      )}

      {/* Ask Boss anything */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask Boss about setup…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          aria-label={t("pages.misc.send")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
