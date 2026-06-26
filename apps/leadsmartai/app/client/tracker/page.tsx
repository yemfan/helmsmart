"use client";

import { useCallback, useEffect, useState } from "react";
import TransactionPipeline from "@/components/client/TransactionPipeline";
import { useClientLeadId } from "@/components/client/useClientLeadId";

type MeRes = { ok: boolean; primaryLeadId?: string | null; leads?: { id: string }[] };
type TrackRes = {
  ok: boolean;
  leadStatus?: string | null;
  stages?: { id: string; label: string; description: string }[];
  activeIndex?: number;
};

export default function ClientTrackerPage() {
  const [me, setMe] = useState<MeRes | null>(null);
  const [data, setData] = useState<TrackRes | null>(null);
  const leads = me?.leads ?? [];
  const validLeadIds = leads.length ? leads.map((l) => l.id) : null;
  const { leadId, setLeadId } = useClientLeadId(me?.primaryLeadId ?? null, validLeadIds);

  const loadMe = useCallback(async () => {
    const r = await fetch("/api/client/me", { credentials: "include" });
    const j = (await r.json()) as MeRes;
    setMe(j);
  }, []);

  const loadTracker = useCallback(async () => {
    if (!leadId) {
      setData(null);
      return;
    }
    const r = await fetch(`/api/client/tracker?leadId=${encodeURIComponent(leadId)}`, {
      credentials: "include",
    });
    const j = (await r.json()) as TrackRes;
    setData(j);
  }, [leadId]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    void loadTracker();
  }, [loadTracker]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Transaction tracker</h1>
        <p className="text-sm text-slate-600 mt-1">From search to closing — a simple visual timeline.</p>
      </div>

      {leads.length > 1 && (
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={leadId ?? ""}
          onChange={(e) => setLeadId(e.target.value)}
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              Deal {l.id}
            </option>
          ))}
        </select>
      )}

      {!leadId && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          Link your email to a lead to see your pipeline.
        </div>
      )}

      {data?.ok && data.stages && data.activeIndex != null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            Lead status: <span className="capitalize text-slate-800">{data.leadStatus ?? "—"}</span>
          </div>
          <TransactionPipeline stages={data.stages} activeIndex={data.activeIndex} />
          <p className="text-xs text-slate-500 leading-relaxed">
            Stages are estimated from your lead status in RealtyBoss. Your agent can advance milestones as your transaction
            progresses.
          </p>
        </div>
      )}
    </div>
  );
}
