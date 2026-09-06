"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { MarkdownLite } from "@/components/ui/MarkdownLite";
import { trackHubEvent } from "./hubEvents";
import type { HubTheme } from "./theme";

/**
 * The visitor's conversation with the agent's AI assistant, inline on the
 * page — not a widget hiding in a corner. It is the hub's main event.
 *
 * State lives here and nowhere else: the server holds the transcript under
 * an opaque conversation id, the browser holds the id in sessionStorage so a
 * reload continues the thread, and a new tab starts clean.
 *
 * Every string is a prop: this is a client component and the server owns the
 * translator. Errors are short codes mapped to friendly copy — the visitor
 * never sees a model name, a status code, or a stack.
 */

type Msg = { role: "user" | "assistant"; content: string };

type Labels = {
  greeting: string;
  placeholder: string;
  send: string;
  thinking: string;
  disclaimer: string;
  error: string;
  retry: string;
  limit: string;
  leadCaptured: string;
  suggested: string;
  newChat: string;
  you: string;
  assistantName: string;
};

export default function HubChat({
  username,
  prompts,
  labels,
  theme,
  locale,
  utmSource,
  utmCampaign,
}: {
  username: string;
  prompts: string[];
  labels: Labels;
  theme: HubTheme;
  locale: string;
  utmSource: string | null;
  utmCampaign: string | null;
}) {
  const storageKey = `cb_hub_chat:${username}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /** The reply as it streams in, before it becomes a message. */
  const [pending, setPending] = useState("");
  const [error, setError] = useState<"failed" | "limit" | null>(null);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const conversationId = useRef<string | null>(null);
  const opened = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef<string>("");

  // Resume a thread from this tab's session. Wrapped: sessionStorage throws
  // in some private modes, and the chat must work without it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { id: string; messages: Msg[]; lead?: boolean };
      if (saved?.id && Array.isArray(saved.messages)) {
        conversationId.current = saved.id;
        setMessages(saved.messages.slice(-40));
        setLeadCaptured(Boolean(saved.lead));
      }
    } catch {
      /* start fresh */
    }
  }, [storageKey]);

  useEffect(() => {
    const el = listRef.current;
    if (el && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages, busy, pending]);

  function persist(next: Msg[], lead: boolean) {
    try {
      if (conversationId.current) {
        sessionStorage.setItem(storageKey, JSON.stringify({ id: conversationId.current, messages: next, lead }));
      }
    } catch {
      /* fine */
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || limitReached) return;
    if (!opened.current) {
      opened.current = true;
      trackHubEvent(username, "ai_open");
    }
    setError(null);
    setInput("");
    lastSent.current = message;
    const next: Msg[] = [...messages, { role: "user", content: message }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(username)}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          message,
          conversationId: conversationId.current,
          locale,
          utmSource,
          utmCampaign,
        }),
      });
      // Known refusals arrive as JSON with a status; an answer arrives as a
      // stream of server-sent events. Keep the visitor's words on screen
      // either way, so a retry is one tap.
      const isStream = (res.headers.get("content-type") ?? "").includes("text/event-stream");
      if (!res.ok || !isStream || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429 || json.error === "limit") {
          setLimitReached(true);
          setError("limit");
        } else {
          setError("failed");
        }
        return;
      }

      type DoneEvent = { conversationId?: string; reply?: string; leadCaptured?: boolean; limitReached?: boolean };
      let done: DoneEvent | null = null;
      let failed = false;
      let text = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
            if (ev.type === "delta" && typeof ev.text === "string") {
              text += ev.text;
              setPending(text);
            } else if (ev.type === "done") {
              done = ev as unknown as DoneEvent;
            } else if (ev.type === "error") {
              failed = true;
            }
          } catch {
            /* a torn frame; the next one will parse */
          }
        }
      }

      setPending("");
      if (failed || !done) {
        setError("failed");
        return;
      }
      conversationId.current = done.conversationId ?? conversationId.current;
      const reply = (done.reply ?? text).trim();
      const withReply: Msg[] = [...next, { role: "assistant", content: reply }];
      setMessages(withReply);
      const lead = Boolean(done.leadCaptured);
      if (lead && !leadCaptured) setLeadCaptured(true);
      if (done.limitReached) setLimitReached(true);
      persist(withReply, lead || leadCaptured);
    } catch {
      setPending("");
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    if (!lastSent.current) return;
    // Drop the unanswered user bubble, then resend it.
    setMessages((m) => (m.length && m[m.length - 1].role === "user" ? m.slice(0, -1) : m));
    void send(lastSent.current);
  }

  function reset() {
    conversationId.current = null;
    setMessages([]);
    setLeadCaptured(false);
    setLimitReached(false);
    setError(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* fine */
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-raised)] ring-1 ring-slate-200">
      <div
        ref={listRef}
        className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5"
        aria-live="polite"
        aria-busy={busy}
      >
        <Bubble role="assistant" name={labels.assistantName} you={labels.you}>
          {labels.greeting}
        </Bubble>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} name={labels.assistantName} you={labels.you}>
            {m.role === "assistant" ? <MarkdownLite text={m.content} /> : m.content}
          </Bubble>
        ))}
        {busy && pending ? (
          <Bubble role="assistant" name={labels.assistantName} you={labels.you}>
            <MarkdownLite text={pending} />
          </Bubble>
        ) : busy ? (
          <Bubble role="assistant" name={labels.assistantName} you={labels.you}>
            <span className="inline-flex items-center gap-2 text-slate-500">
              <span className="inline-flex gap-1" aria-hidden>
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </span>
              {labels.thinking}
            </span>
          </Bubble>
        ) : null}
        {leadCaptured ? (
          <p className={`self-center rounded-full px-3 py-1 text-xs font-medium ${theme.tint}`}>
            {labels.leadCaptured}
          </p>
        ) : null}
        {error === "failed" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 self-center text-sm text-red-700">
            <span>{labels.error}</span>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-red-50 px-3 py-1 font-medium ring-1 ring-inset ring-red-200 hover:bg-red-100"
            >
              {labels.retry}
            </button>
          </div>
        ) : null}
        {error === "limit" || limitReached ? (
          <p role="status" className="self-center text-center text-sm text-slate-600">
            {labels.limit}
          </p>
        ) : null}
      </div>

      {empty && prompts.length ? (
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{labels.suggested}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void send(p)}
                className="shrink-0 rounded-full bg-slate-50 px-3 py-2 text-left text-sm text-slate-800 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 border-t border-slate-200 bg-slate-50/60 p-3"
      >
        <label className="sr-only" htmlFor={`hub-chat-input-${username}`}>
          {labels.placeholder}
        </label>
        <textarea
          id={`hub-chat-input-${username}`}
          data-hub-focus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={labels.placeholder}
          rows={1}
          maxLength={2000}
          disabled={limitReached}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 sm:text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim() || limitReached}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-50 ${theme.primary} focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${theme.ring}`}
          aria-label={labels.send}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 text-[11px] text-slate-500 sm:px-5">
        <p className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" aria-hidden />
          {labels.disclaimer}
        </p>
        {!empty ? (
          <button type="button" onClick={reset} className="shrink-0 font-medium text-slate-600 underline-offset-2 hover:underline">
            {labels.newChat}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Bubble({
  role,
  name,
  you,
  children,
}: {
  role: "user" | "assistant";
  name: string;
  you: string;
  children: React.ReactNode;
}) {
  const mine = role === "user";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="sr-only">{mine ? you : name}</span>
      <div
        className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[80%] sm:text-sm ${
          mine ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md bg-slate-100 text-slate-900"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}
