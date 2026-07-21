"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TransactionPipeline from "@/components/client/TransactionPipeline";
import { useClientLeadId } from "@/components/client/useClientLeadId";
import { isRealEstateProfessionalRole } from "@/lib/paidSubscriptionEligibility";
import { resolveRoleHomePath } from "@/lib/rolePortalPaths";

/** Same idea as AccountMenu: pros are not “consumer-only” even if role is still `user`. */
function isWorkspaceProfessional(role: string | undefined, hasAgentRecord: boolean): boolean {
  const r = String(role ?? "user").toLowerCase().trim();
  if (r === "user" && !hasAgentRecord) return false;
  return isRealEstateProfessionalRole(r) || hasAgentRecord;
}

type MeApi = { role?: string; has_agent_record?: boolean };

type MeRes = {
  ok: boolean;
  leads?: { id: string; name: string | null; property_address: string | null; lead_status: string | null }[];
  primaryLeadId?: string | null;
};

type DashRes = {
  ok: boolean;
  deal?: {
    headline: string;
    status: string | null;
    agentNote: string | null;
    aiScore: number | null;
    aiConfidence: number | null;
    timelineHint: string | null;
  };
  pipeline?: { stages: { id: string; label: string; description: string }[]; activeIndex: number };
  nextSteps?: string[];
  recommendations?: { id: string; title: string; detail: string; priority: string }[];
};

export default function ClientDashboardPage() {
  const [me, setMe] = useState<MeRes | null>(null);
  const [meApi, setMeApi] = useState<MeApi | null>(null);
  const [dash, setDash] = useState<DashRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const leads = me?.leads ?? [];
  const validLeadIds = leads.length ? leads.map((l) => l.id) : null;
  const { leadId, setLeadId } = useClientLeadId(me?.primaryLeadId ?? null, validLeadIds);

  const loadMe = useCallback(async () => {
    const r = await fetch("/api/client/me", { credentials: "include" });
    const j = (await r.json()) as MeRes;
    setMe(j);
    if (!j.ok) setErr("Could not load your profile.");
    else setErr(null);
  }, []);

  const loadDash = useCallback(async () => {
    if (!leadId) {
      setDash(null);
      return;
    }
    const r = await fetch(`/api/client/dashboard?leadId=${encodeURIComponent(leadId)}`, {
      credentials: "include",
    });
    const j = (await r.json()) as DashRes;
    setDash(j);
    if (!j.ok) setErr("Could not load dashboard.");
  }, [leadId]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/me", { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as MeApi & { error?: string };
        if (cancelled || !r.ok) return;
        setMeApi({ role: j.role, has_agent_record: j.has_agent_record });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showAgentWorkspaceHint =
    meApi &&
    isWorkspaceProfessional(meApi.role, Boolean(meApi.has_agent_record));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Your dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">Deal status, next steps, and smart suggestions.</p>
      </div>

      {showAgentWorkspaceHint ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">Client portal (buyer / seller)</p>
          <p className="mt-1 leading-relaxed">
            This page only shows a deal when your login email matches a lead in CloseBoss. Your{" "}
            <span className="font-medium">agent workspace</span> (leads, pipeline, tools) is separate —{" "}
            <Link
              href={resolveRoleHomePath(meApi?.role ?? null, Boolean(meApi?.has_agent_record))}
              className="font-semibold text-sky-900 underline underline-offset-2 hover:text-sky-950"
            >
              open agent workspace
            </Link>
            .
          </p>
        </div>
      ) : null}

      {leads.length > 1 && (
        <label className="block text-xs font-semibold text-slate-500 uppercase">
          Active deal
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={leadId ?? ""}
            onChange={(e) => setLeadId(e.target.value)}
          >
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.property_address || l.name || `Lead ${l.id}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm px-3 py-2">
          {err}
        </div>
      )}

      {!leadId && me?.ok && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold mb-1">No deal linked yet</p>
          <p className="leading-relaxed">
            We match your login email to a contact on a lead. Ask your agent to add this exact email to your
            lead in CloseBoss, then refresh. If you expected the agent CRM instead, use{" "}
            <Link href="/dashboard/overview" className="font-semibold underline underline-offset-2">
              Dashboard overview
            </Link>
            .
          </p>
        </div>
      )}

      {dash?.ok && dash.deal && dash.pipeline && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase">Current focus</div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{dash.deal.headline}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium capitalize">
                {dash.deal.status ?? "new"}
              </span>
              {dash.deal.aiScore != null && (
                <span className="rounded-full bg-blue-50 text-blue-800 px-2 py-0.5 font-medium">
                  AI score {dash.deal.aiScore}
                </span>
              )}
            </div>
            {dash.deal.agentNote && (
              <p className="text-sm text-slate-600 border-l-2 border-blue-200 pl-3">{dash.deal.agentNote}</p>
            )}
            {dash.deal.timelineHint && (
              <p className="text-xs text-slate-500">Timeline signal: {dash.deal.timelineHint}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Transaction pipeline</h3>
            <TransactionPipeline stages={dash.pipeline.stages} activeIndex={dash.pipeline.activeIndex} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-2">Next steps</h3>
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              {(dash.nextSteps ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Recommendations</h3>
            <ul className="space-y-3">
              {(dash.recommendations ?? []).map((r) => (
                <li
                  key={r.id}
                  className={`rounded-xl border p-3 text-sm ${
                    r.priority === "high"
                      ? "border-rose-200 bg-rose-50/60"
                      : r.priority === "medium"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <div className="font-semibold text-slate-900">{r.title}</div>
                  <p className="text-slate-600 mt-1 leading-relaxed">{r.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
