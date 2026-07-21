"use client";

import { useCallback, useEffect, useState } from "react";
import type { CrmLeadRow } from "@leadsmart/shared";

export default function LeadAiAssistantPanel({ lead }: { lead: CrmLeadRow }) {
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentMode, setAgentMode] = useState<"auto" | "manual">("manual");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [suggestion, setSuggestion] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch("/api/dashboard/agent/ai-settings");
      const json = (await res.json().catch(() => ({}))) as any;
      if (json?.ok && json?.settings) {
        setAgentEnabled(json.settings.ai_assistant_enabled !== false);
        setAgentMode(json.settings.ai_assistant_mode === "auto" ? "auto" : "manual");
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadSuggestion = useCallback(async () => {
    setLoadingSuggest(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/leads/${lead.id}/ai-suggest`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not generate suggestion");
      const text = String(json.suggestion ?? "");
      setSuggestion(text);
      setDraft(text);
    } catch (e: any) {
      setMsg(e?.message ?? "Suggestion failed.");
    } finally {
      setLoadingSuggest(false);
    }
  }, [lead.id]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadSuggestion();
  }, [loadSuggestion]);

  async function saveAgentSettings(next: { ai_assistant_enabled?: boolean; ai_assistant_mode?: "auto" | "manual" }) {
    try {
      const res = await fetch("/api/dashboard/agent/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Save failed");
      if (json?.settings) {
        setAgentEnabled(json.settings.ai_assistant_enabled !== false);
        setAgentMode(json.settings.ai_assistant_mode === "auto" ? "auto" : "manual");
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to save settings");
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/leads/${lead.id}/ai-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, scheduleFollowups: true }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Send failed");
      setMsg(`Sent via ${json.channel ?? "channel"}. Follow-ups scheduled.`);
      await fetch(`/api/dashboard/leads/${lead.id}/conversation`).catch(() => {});
    } catch (e: any) {
      setMsg(e?.message ?? "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-800">CloseBoss assistant</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Suggested replies from your lead context. Auto follow-ups (1h / 24h / 3d) run only in{" "}
            <span className="font-medium">auto</span> mode when Twilio/email are configured.
          </p>
        </div>
      </div>

      {loadingSettings ? (
        <div className="text-xs text-slate-500">Loading preferences…</div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={agentEnabled}
              onChange={(e) => {
                const v = e.target.checked;
                setAgentEnabled(v);
                void saveAgentSettings({ ai_assistant_enabled: v });
              }}
            />
            Enable AI
          </label>
          <select
            value={agentMode}
            onChange={(e) => {
              const v = e.target.value === "auto" ? "auto" : "manual";
              setAgentMode(v);
              void saveAgentSettings({ ai_assistant_mode: v });
            }}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white"
          >
            <option value="manual">Manual (suggest only)</option>
            <option value="auto">Auto (send follow-ups)</option>
          </select>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-700">Suggested reply</span>
          <button
            type="button"
            disabled={loadingSuggest}
            onClick={() => void loadSuggestion()}
            className="text-[11px] font-semibold text-brand-primary hover:underline disabled:opacity-50"
          >
            {loadingSuggest ? "Generating…" : "Refresh"}
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-primary"
          placeholder="AI suggestion appears here — edit before sending."
        />
      </div>

      {msg ? <div className="text-xs text-slate-600">{msg}</div> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={sending || !draft.trim()}
          onClick={() => void sendMessage()}
          className="inline-flex items-center justify-center rounded-lg bg-brand-primary text-white text-xs font-semibold px-4 py-2 hover:bg-[#005ca8] disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => setDraft(suggestion)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 text-xs font-semibold px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Reset to AI draft
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setMsg("Skipped — draft cleared.");
          }}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 text-xs font-semibold px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
