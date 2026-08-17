"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClientLeadId } from "@/components/client/useClientLeadId";

type MeRes = { ok: boolean; primaryLeadId?: string | null };

export default function ClientAssistantPage() {
  const { t } = useTranslation("dashboard");
  const [me, setMe] = useState<MeRes | null>(null);
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { leadId } = useClientLeadId(me?.primaryLeadId ?? null, null);

  useEffect(() => {
    void fetch("/api/client/me", { credentials: "include" })
      .then((r) => r.json())
      .then((j: MeRes) => setMe(j));
  }, []);

  const ask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const question = q.trim();
      if (!question || loading) return;
      setLoading(true);
      setA(null);
      try {
        const r = await fetch("/api/client/ai", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, leadId: leadId ?? undefined }),
        });
        const j = await r.json();
        setA(j.ok ? j.answer : j.message ?? "Error");
      } finally {
        setLoading(false);
      }
    },
    [q, leadId, loading]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("pages.clientPortal.assistant")}</h1>
        <p className="text-sm text-slate-600 mt-1">{t("pages.clientPortal.assistantSub")}</p>
      </div>

      <form onSubmit={ask} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <textarea
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[100px]"
          placeholder={t("pages.clientPortal.assistantPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {a && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
          {a}
        </div>
      )}
    </div>
  );
}
