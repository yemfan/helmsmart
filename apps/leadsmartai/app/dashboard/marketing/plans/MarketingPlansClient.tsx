"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Template = { key: string; title: string; description: string };
type LeadOption = { id: string; name: string };
type Step = {
  id: string;
  step_order: number;
  channel: string;
  action: string;
  subject: string | null;
  body: string;
  delay_days: number;
  enabled: boolean;
  status: string;
  executed_at: string | null;
};
type Plan = {
  id: string;
  title: string;
  status: string;
  template_key: string;
  contact_id: string | null;
  lead_name: string | null;
  created_at: string;
  updated_at: string;
  steps?: Step[];
};

type SortKey = "title" | "lead_name" | "status" | "updated_at";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  completed: "bg-slate-200 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
};

const CHANNEL_LABELS: Record<string, string> = { sms: "SMS", email: "Email", task: "Task", notification: "Alert" };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MarketingPlansClient() {
  const { t } = useTranslation("dashboard");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [leadId, setLeadId] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [stats, setStats] = useState<{ performance: Array<{ name: string; value: number; color: string }>; completedByMonth: Array<{ labelKey: string; count: number }>; totalPlans: number } | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/marketing-plans");
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        setPlans(body.plans ?? []);
        setLeads(body.leads ?? []);
        setTemplates(body.templates ?? []);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/marketing-plans/stats");
      const body = await res.json().catch(() => ({}));
      if (body.ok) setStats(body);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) return leads.slice(0, 50);
    const s = leadSearch.toLowerCase();
    return leads.filter((l) => l.name.toLowerCase().includes(s)).slice(0, 50);
  }, [leads, leadSearch]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortAsc((v) => !v);
    else { setSortBy(key); setSortAsc(false); }
  }

  const filtered = plans
    .filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return p.title.toLowerCase().includes(s) || (p.lead_name ?? "").toLowerCase().includes(s) || (p.template_key ?? "").toLowerCase().includes(s) || (p.status ?? "").toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      const av = String((a as any)[sortBy] ?? "");
      const bv = String((b as any)[sortBy] ?? "");
      return av < bv ? -dir : av > bv ? dir : 0;
    });

  // Step completion progress.
  function stepProgress(plan: Plan): string {
    const steps = plan.steps ?? [];
    if (!steps.length) return "\u2014";
    const done = steps.filter((s) => s.status === "executed").length;
    return `${done}/${steps.length}`;
  }

  async function createPlan() {
    if (!leadId || !templateKey) return;
    setCreating(true); setFeedback(null);
    try {
      const res = await fetch("/api/dashboard/marketing-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, templateKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        setFeedback("Plan created!");
        setLeadId(""); setTemplateKey(""); setShowCreate(false);
        fetchPlans();
        if (body.plan) setSelectedPlan(body.plan);
      } else { setFeedback(body.error ?? "Failed."); }
    } catch { setFeedback("Network error."); } finally { setCreating(false); }
  }

  async function loadPlanDetail(planId: string) {
    try {
      const res = await fetch(`/api/dashboard/marketing-plans/${planId}`);
      const body = await res.json().catch(() => ({}));
      if (body.ok) setSelectedPlan(body.plan);
    } catch { /* silent */ }
  }

  async function planAction(planId: string, action: string) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/dashboard/marketing-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.ok) { fetchPlans(); loadPlanDetail(planId); }
      else { setFeedback(body.error ?? "Action failed."); }
    } catch { setFeedback("Network error."); } finally { setActionLoading(null); }
  }

  async function toggleStep(planId: string, stepId: string, enabled: boolean) {
    await fetch(`/api/dashboard/marketing-plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId, stepPatch: { enabled } }),
    });
    loadPlanDetail(planId);
  }

  if (loading) return <div className="py-20 text-center text-slate-500">{t("pages.marketingPlans.loading")}</div>;

  // ── Plan Detail View ──
  if (selectedPlan) {
    const p = selectedPlan;
    return (
      <div className="space-y-4">
        <button onClick={() => { setSelectedPlan(null); setSearch(""); setStatusFilter("all"); }} className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900">{t("pages.marketingPlans.allPlans")}</button>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{p.title}</h2>
              <p className="text-xs text-slate-500">{p.lead_name ?? `Lead #${p.contact_id}`} &middot; {p.template_key}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</span>
            </div>
            <div className="flex gap-2">
              {p.status === "draft" && <button disabled={!!actionLoading} onClick={() => planAction(p.id, "approve")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{t("pages.marketingPlans.approve")}</button>}
              {p.status === "approved" && <button disabled={!!actionLoading} onClick={() => planAction(p.id, "start")} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">{t("pages.marketingPlans.start")}</button>}
              {p.status === "active" && <button disabled={!!actionLoading} onClick={() => planAction(p.id, "pause")} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t("pages.marketingPlans.pause")}</button>}
              {["draft", "approved", "active", "paused"].includes(p.status) && <button disabled={!!actionLoading} onClick={() => planAction(p.id, "cancel")} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{t("more.playbooks.cancel")}</button>}
            </div>
          </div>
        </div>

        {/* Pipeline steps */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("pages.marketingPlans.pipelineSteps")}</h3>
          {(p.steps ?? []).map((step) => (
            <div key={step.id} className={`rounded-xl border p-4 ${!step.enabled ? "border-slate-100 dark:border-slate-700 bg-slate-50 opacity-60" : "border-slate-200 bg-white dark:bg-slate-900"}`}>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={step.enabled} onChange={(e) => toggleStep(p.id, step.id, e.target.checked)} disabled={p.status !== "draft"} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
                </label>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.dashFragments.day")} {step.delay_days}</span>
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{CHANNEL_LABELS[step.channel] ?? step.channel}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${step.status === "executed" ? "bg-green-50 text-green-700" : step.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-50 dark:bg-slate-900/60 text-slate-500"}`}>{step.status}</span>
                  </div>
                  {step.subject && <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{step.subject}</p>}
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{step.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Plans List View ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.marketingPlans.heading")}</h1>
          <p className="text-sm text-slate-500">{plans.length} {t("pages.dashFragments.totalPlans")}</p>
        </div>
      </div>

      {/* Performance charts */}
      {stats && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">{t("pages.marketingPlans.performance")}</h3>
            <div className="flex items-center gap-3">
              <div className="h-[120px] w-[120px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.performance} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28} strokeWidth={1}>
                      {stats.performance.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={((v: number) => v) as never} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 text-xs">
                {stats.performance.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-600 dark:text-slate-400">{d.name}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">{t("pages.marketingPlans.startedVsCompleted")}</h3>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.completedByMonth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#9ca3af" interval={1} />
                  <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="started" fill="#3b82f6" name="Started" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="completed" fill="#22c55e" name="Completed" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {feedback && <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">{feedback}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-[#0072ce] px-3 py-2 text-sm font-medium text-white hover:bg-[#005ca8]">
          {showCreate ? t("pages.marketingPlans.cancel") : t("pages.marketingPlans.newPlan")}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.marketingPlans.createHeading")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("pages.marketingPlans.leadContact")}</label>
              <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder={t("pages.marketingPlans.searchLeads")} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm mb-1" />
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm">
                <option value="">{t("pages.marketingPlans.selectLead")}</option>
                {filteredLeads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("pages.marketingPlans.template")}</label>
              <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm mt-6">
                <option value="">{t("pages.marketingPlans.selectTemplate")}</option>
                {templates.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
              </select>
              {templateKey && templates.find((t) => t.key === templateKey) && (
                <p className="mt-1 text-xs text-slate-500">{templates.find((t) => t.key === templateKey)?.description}</p>
              )}
            </div>
          </div>
          <button disabled={!leadId || !templateKey || creating} onClick={() => void createPlan()}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8] disabled:opacity-50">
            {creating ? t("pages.marketingPlans.creating") : t("pages.marketingPlans.generate")}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pages.marketingPlans.searchPlans")}
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
          <option value="all">{t("pages.marketingPlans.allStatuses")}</option>
          <option value="draft">{t("pages.marketingPlans.stDraft")}</option>
          <option value="approved">{t("pages.marketingPlans.stApproved")}</option>
          <option value="active">{t("pages.marketingPlans.stActive")}</option>
          <option value="paused">{t("pages.marketingPlans.stPaused")}</option>
          <option value="completed">{t("pages.marketingPlans.stCompleted")}</option>
          <option value="cancelled">{t("pages.marketingPlans.stCancelled")}</option>
        </select>
      </div>

      {/* Plans table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
              <tr>
                {([
                  { key: "title" as SortKey, labelKey: "pages.marketingPlans.colPlan" },
                  { key: "lead_name" as SortKey, labelKey: "pages.marketingPlans.colLead" },
                  { key: "status" as SortKey, labelKey: "pages.marketingPlans.colStatus" },
                  { key: null, labelKey: "pages.marketingPlans.colProgress" },
                  { key: "updated_at" as SortKey, labelKey: "pages.marketingPlans.colUpdated" },
                  // Spacer column for the row actions; no header text.
                  { key: null, labelKey: "" },
                ] as const).map((col, i) => (
                  <th key={i} className={`text-left px-4 py-2.5 font-medium ${col.key ? "cursor-pointer select-none hover:text-slate-900" : ""}`}
                    onClick={() => col.key && toggleSort(col.key)}>
                    {col.labelKey ? t(col.labelKey) : ""}
                    {col.key && sortBy === col.key && <span className="ml-1 text-[10px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{p.title}</span>
                    <span className="ml-1.5 text-[10px] text-slate-500">{p.template_key}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{p.lead_name ?? "\u2014"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{stepProgress(p)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{timeAgo(p.updated_at)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => loadPlanDetail(p.id)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">{t("pages.marketingPlans.view")}</button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {search || statusFilter !== "all" ? t("pages.marketingPlans.emptyFiltered") : t("pages.marketingPlans.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Templates list */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t("pages.marketingPlans.availableTemplates")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <div key={tpl.key} className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{tpl.title}</p>
              <p className="mt-1 text-xs text-slate-500">{tpl.description}</p>
              <button
                type="button"
                onClick={() => { setShowCreate(true); setTemplateKey(tpl.key); }}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800"
              >{t("pages.marketingPlans.useTemplate")}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
