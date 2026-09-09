"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Send, User, RotateCcw } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

/** Keys under `ask.suggested` — the question the owner sees, translated at render. */
const SUGGESTED = [
  "outstandingRevenue",
  "activeClients",
  "topExpenses",
  "overdueInvoices",
  "netIncome",
];

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isStreaming,
}: {
  msg: Message;
  isStreaming: boolean;
}) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
        }`}
      >
        {msg.content ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : isStreaming ? (
          <TypingDots />
        ) : null}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="w-4 h-4 text-slate-600" />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AskClient() {
  const { t } = useTranslation("home");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom when message count changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newHistory: Message[] = [...messages, userMsg];
    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
        signal: abort.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Request failed: ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + chunk },
          ];
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: t("ask.error"),
          },
        ];
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Focus input after response
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function handleNewChat() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setStreaming(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">{t("ask.title")}</h1>
            <p className="text-xs text-slate-500">{t("ask.subtitle")}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            {t("ask.newChat")}
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              {t("ask.emptyTitle")}
            </h2>
            <p className="text-sm text-slate-500 max-w-md mb-8 leading-relaxed">
              {t("ask.emptyBody")}
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTED.map((key) => {
                const q = t(`ask.suggested.${key}`);
                return (
                  <button
                    key={key}
                    onClick={() => send(q)}
                    disabled={streaming}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-40"
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Chat history */
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                isStreaming={streaming && i === messages.length - 1}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 border-t border-slate-100 bg-white px-8 py-4">
        <div className="flex gap-3 items-end max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={t("ask.placeholder")}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white overflow-y-auto disabled:opacity-60 transition-opacity"
            style={{ lineHeight: "1.5", minHeight: "42px", maxHeight: "128px" }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">{t("ask.footer")}</p>
      </div>
    </div>
  );
}
