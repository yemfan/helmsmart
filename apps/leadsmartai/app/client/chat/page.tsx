"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClientLeadId } from "@/components/client/useClientLeadId";

type MeRes = { ok: boolean; primaryLeadId?: string | null; leads?: { id: string; property_address: string | null }[] };
type Msg = { id: string; role: string; body: string; created_at: string; mine?: boolean };

export default function ClientChatPage() {
  const [me, setMe] = useState<MeRes | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const leads = me?.leads ?? [];
  const validLeadIds = leads.length ? leads.map((l) => l.id) : null;
  const { leadId, setLeadId } = useClientLeadId(me?.primaryLeadId ?? null, validLeadIds);

  const loadMe = useCallback(async () => {
    const r = await fetch("/api/client/me", { credentials: "include" });
    const j = (await r.json()) as MeRes;
    setMe(j);
  }, []);

  const loadChat = useCallback(async () => {
    if (!leadId) {
      setMessages([]);
      return;
    }
    const j = await fetch(`/api/client/chat?leadId=${encodeURIComponent(leadId)}`, {
      credentials: "include",
    }).then((r) => r.json());
    if (j.ok) setMessages(j.messages ?? []);
  }, [leadId]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  /** Near–real-time: poll every 4s while tab visible */
  useEffect(() => {
    if (!leadId) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadChat();
    }, 4000);
    return () => clearInterval(t);
  }, [leadId, loadChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const b = text.trim();
    if (!b || !leadId || sending) return;
    setSending(true);
    try {
      const r = await fetch("/api/client/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, body: b }),
      });
      const j = await r.json();
      if (j.ok) {
        setText("");
        setMessages((m) => [...m, j.message]);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-slate-900">Chat</h1>
        <p className="text-sm text-slate-600">Message your agent — they see this on RealtyBoss.</p>
      </div>

      {leads.length > 1 && (
        <select
          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={leadId ?? ""}
          onChange={(e) => setLeadId(e.target.value)}
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.property_address || `Deal ${l.id}`}
            </option>
          ))}
        </select>
      )}

      {!leadId ? (
        <p className="text-sm text-slate-500">Connect a lead to start chatting.</p>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "agent"
                    ? "bg-white border border-slate-200 text-slate-800 mr-auto"
                    : "bg-blue-600 text-white ml-auto"
                }`}
              >
                <div className="text-[10px] opacity-70 mb-0.5">
                  {m.role === "agent" ? "Agent" : "You"} · {new Date(m.created_at).toLocaleString()}
                </div>
                {m.body}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Type a message…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="rounded-xl bg-blue-600 text-white font-semibold px-4 text-sm disabled:opacity-50"
            >
              Send
            </button>
          </form>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            Updates every few seconds. Your agent replies from RealtyBoss (coming soon) or in person.
          </p>
        </>
      )}
    </div>
  );
}
