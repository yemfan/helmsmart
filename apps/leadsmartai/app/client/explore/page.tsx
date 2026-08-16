"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClientLeadId } from "@/components/client/useClientLeadId";

type MeRes = {
  ok: boolean;
  primaryLeadId?: string | null;
  leads?: { id: string }[];
};
type SavedRow = {
  id: string;
  address: string;
  ai_score: number | null;
  insights: Record<string, unknown>;
  updated_at: string;
};

export default function ClientExplorePage() {
  const { t } = useTranslation("dashboard");
  const [me, setMe] = useState<MeRes | null>(null);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [address, setAddress] = useState("");
  const [score, setScore] = useState("");
  const [loading, setLoading] = useState(false);
  const leads = me?.leads ?? [];
  const validLeadIds = leads.length ? leads.map((l) => l.id) : null;
  const { leadId } = useClientLeadId(me?.primaryLeadId ?? null, validLeadIds);

  const load = useCallback(async () => {
    const r = await fetch("/api/client/me", { credentials: "include" });
    const m = (await r.json()) as MeRes;
    setMe(m);
    const s = await fetch("/api/client/saved", { credentials: "include" }).then((r) => r.json());
    if (s.ok) setSaved(s.saved ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSaved(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/client/saved", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          ai_score: score ? Number(score) : undefined,
          leadId: leadId ?? undefined,
          insights: { source: "client_portal" },
        }),
      });
      setAddress("");
      setScore("");
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("pages.clientPortal.savedHomes")}</h1>
        <p className="text-sm text-slate-600 mt-1">{t("pages.clientPortal.savedHomesSub")}</p>
      </div>

      <form onSubmit={addSaved} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase">{t("pages.clientPortal.address")}</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="456 Oak Ave, City"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase">{t("pages.clientPortal.yourScore")}</label>
          <input
            type="number"
            min={0}
            max={100}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="optional"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 text-white font-semibold py-2.5 text-sm disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save home"}
        </button>
      </form>

      <div className="space-y-3">
        {saved.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">{t("pages.clientPortal.noSavedHomes")}</p>
        )}
        {saved.map((h) => (
          <div
            key={h.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2"
          >
            <div className="font-semibold text-slate-900">{h.address}</div>
            {h.ai_score != null && (
              <div className="text-xs font-bold text-blue-700">AI score: {h.ai_score}</div>
            )}
            <div className="text-xs text-slate-500">
              Insights: {Object.keys(h.insights ?? {}).length ? JSON.stringify(h.insights) : "Add notes with your agent"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
