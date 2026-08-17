"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("dashboard");
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
        <h1 className="text-xl font-bold text-slate-900">{t("pages.clientPortal.dashboard")}</h1>
        <p className="text-sm text-slate-600 mt-1">{t("pages.clientPortal.dashboardSub")}</p>
      </div>

      {showAgentWorkspaceHint ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">{t("pages.clientPortal.portalLabel")}</p>
          <p className="mt-1 leading-relaxed">
            {t("pages.clientPortal.matchExplainer", { ns: "dashboard" })}{" "}
            <span className="font-medium">{t("pages.clientPortal.agentWorkspace")}</span> {t("pages.clientPortal.isSeparate", { ns: "dashboard" })}{" "}
            <Link
              href={resolveRoleHomePath(meApi?.role ?? null, Boolean(meApi?.has_agent_record))}
              className="font-semibold text-sky-900 underline underline-offset-2 hover:text-sky-950"
            >{t("pages.clientPortal.openAgentWorkspace")}</Link>
            .
          </p>
        </div>
      ) : null}

      {leads.length > 1 && (
        <label className="block text-xs font-semibold text-slate-500 uppercase">{t("pages.clientPortal.activeDeal")}<select
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
          <p className="font-semibold mb-1">{t("pages.clientPortal.noDeal")}</p>
          <p className="leading-relaxed">
            {t("pages.clientPortal.noMatchExplainer", { ns: "dashboard" })}{" "}
            <Link href="/dashboard/overview" className="font-semibold underline underline-offset-2">{t("pages.clientPortal.overview")}</Link>
            .
          </p>
        </div>
      )}

      {dash?.ok && dash.deal && dash.pipeline && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase">{t("pages.clientPortal.currentFocus")}</div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{dash.deal.headline}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium capitalize">
                {dash.deal.status ?? "new"}
              </span>
              {dash.deal.aiScore != null && (
                <span className="rounded-full bg-blue-50 text-blue-800 px-2 py-0.5 font-medium">
                  {t("pages.clientPortal.aiScore", { ns: "dashboard", score: dash.deal.aiScore })}
                </span>
              )}
            </div>
            {dash.deal.agentNote && (
              <p className="text-sm text-slate-600 border-l-2 border-blue-200 pl-3">{dash.deal.agentNote}</p>
            )}
            {dash.deal.timelineHint && (
              <p className="text-xs text-slate-500">{t("pages.clientPortal.timelineSignal", { ns: "dashboard", hint: dash.deal.timelineHint })}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">{t("pages.clientPortal.pipeline")}</h3>
            <TransactionPipeline stages={dash.pipeline.stages} activeIndex={dash.pipeline.activeIndex} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-2">{t("pages.clientPortal.nextSteps")}</h3>
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              {(dash.nextSteps ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-800">{t("pages.clientPortal.recommendations")}</h3>
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
