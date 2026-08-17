"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Per-assistant call settings + knowledge base.
 *
 * Each AI team member that talks on the phone speaks from its OWN
 * brief. Two forms here:
 *
 *  • AssistantCallSettings — the assistant-level overlay stored on
 *    its ai_assistants row (voice name + knowledge), used by the
 *    Sales Assistant's outbound lead calls.
 *  • ReceptionistVoiceForm — the Receptionist's greeting + knowledge,
 *    which live in its richer inbound config
 *    (/api/dashboard/voice-receptionist-settings).
 */

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0B1F44] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-gray-700";
const hintCls = "mt-1 text-[11px] text-gray-400";

function SaveButton({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="rounded-lg bg-[#0B1F44] px-4 py-2 text-xs font-semibold text-white hover:bg-[#142c5c] disabled:opacity-50"
    >
      {saving ? "Saving…" : saved ? "Saved" : "Save"}
    </button>
  );
}

export function AssistantCallSettings({
  type,
  knowledgePlaceholder,
  showName = true,
  knowledgeHint,
  defaultKnowledge,
}: {
  type: "sales_assistant" | "receptionist" | "marketing_assistant";
  knowledgePlaceholder: string;
  /** Hide the voice-name field for assistants that don't speak (Marketing). */
  showName?: boolean;
  /** Override the knowledge helper line (defaults to call framing). */
  knowledgeHint?: string;
  /** Seed the knowledge box with this starter brief when none is saved yet. */
  defaultKnowledge?: string;
}) {
  const { t } = useTranslation("dashboard");
  const [voiceName, setVoiceName] = useState("");
  const [voiceKnowledge, setVoiceKnowledge] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/dashboard/realtyboss/assistant-voice?type=${type}`)
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        setVoiceName(res?.voiceName ?? "");
        // Prefill the starter brief when the agent hasn't saved one yet,
        // so the assistant launches with a usable default instead of blank.
        setVoiceKnowledge(res?.voiceKnowledge || defaultKnowledge || "");
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [type, defaultKnowledge]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/realtyboss/assistant-voice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, voiceName, voiceKnowledge }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Save failed.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-4 text-sm text-gray-400">Loading call settings…</p>;

  return (
    <form onSubmit={save} className="space-y-4">
      {showName && (
        <div>
          <label className={labelCls} htmlFor={`${type}-voice-name`}>{t("pages.assistantCall.voiceName")}</label>
          <input
            id={`${type}-voice-name`}
            className={inputCls}
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder={t("pages.assistantCall.voicePlaceholder")}
            maxLength={100}
          />
          <p className={hintCls}>{t("pages.assistantCall.voiceHint")}</p>
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor={`${type}-voice-knowledge`}>{t("pages.assistantCall.knowledgeBase")}</label>
        <textarea
          id={`${type}-voice-knowledge`}
          className={`${inputCls} min-h-[120px]`}
          value={voiceKnowledge}
          onChange={(e) => setVoiceKnowledge(e.target.value)}
          placeholder={knowledgePlaceholder}
          maxLength={4000}
        />
        <p className={hintCls}>
          {knowledgeHint ??
            "What this assistant may state as fact on its calls. Leave blank to share the Receptionist's knowledge base."}
        </p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <SaveButton saving={saving} saved={saved} />
    </form>
  );
}

export function ReceptionistVoiceForm() {
  const { t } = useTranslation("dashboard");
  const [greeting, setGreeting] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/voice-receptionist-settings")
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        setGreeting(res?.settings?.greeting ?? "");
        setExtraNotes(res?.settings?.extraNotes ?? "");
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/voice-receptionist-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ greeting, extraNotes }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Save failed.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-4 text-sm text-gray-400">Loading voice settings…</p>;

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="receptionist-greeting">{t("pages.assistantCall.greeting")}</label>
        <input
          id="receptionist-greeting"
          className={inputCls}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder={t("pages.assistantCall.greetingPlaceholder")}
          maxLength={1000}
        />
        <p className={hintCls}>{t("pages.assistantCall.greetingHint")}</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="receptionist-knowledge">{t("pages.assistantCall.knowledgeBase")}</label>
        <textarea
          id="receptionist-knowledge"
          className={`${inputCls} min-h-[120px]`}
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          placeholder="Service areas, office address, your specialties, current listings, FAQs…"
          maxLength={4000}
        />
        <p className={hintCls}>
          What your Receptionist may state as fact when answering calls. Business name, number,
          and hours live in Settings → Voice.
        </p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <SaveButton saving={saving} saved={saved} />
    </form>
  );
}
