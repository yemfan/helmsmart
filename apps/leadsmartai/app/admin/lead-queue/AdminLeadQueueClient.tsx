"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

type QueueLead = {
  id: number | string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  source: string | null;
  lead_status: string | null;
  rating: string | null;
  created_at: string | null;
};

type AgentOption = {
  id: string;
  name: string;
  email: string | null;
};

export function AdminLeadQueueClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lead-queue?pageSize=100");
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        setLeads(body.leads ?? []);
        setTotal(body.total ?? 0);
        setAgents(body.agents ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  async function assignLead(leadId: string) {
    const agentId = selectedAgent[leadId];
    if (!agentId) return;
    setAssigning(leadId);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/lead-queue/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, agentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        const agent = agents.find((a) => a.id === agentId);
        setLeads((prev) => prev.filter((l) => String(l.id) !== leadId));
        setTotal((prev) => Math.max(0, prev - 1));
        setFeedback(`Lead assigned to ${agent?.name ?? "agent"}.`);
      } else if (res.status === 409) {
        setFeedback("This lead was already assigned.");
        fetchQueue();
      } else {
        setFeedback(body.error ?? "Failed to assign lead.");
      }
    } catch {
      setFeedback("Network error. Please try again.");
    } finally {
      setAssigning(null);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">{t("pages.adminPages.loadingQueue")}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("pages.adminPages.leadQueue")}</h1>
          <p className="text-sm text-gray-500">
            {total} {t("pages.dashFragments.unclaimedLead")}{total !== 1 ? "s" : ""} &middot; assign to any agent
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchQueue(); }}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >{t("pages.adminCommon.refresh")}</button>
      </div>

      {feedback && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {feedback}
        </div>
      )}

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-gray-500">{t("pages.adminPages.noLeadsQueue")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminCommon.name")}</th>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminCommon.email")}</th>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminCommon.phone")}</th>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminCommon.address")}</th>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminCommon.source")}</th>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminCommon.created")}</th>
                <th className="px-4 py-3 font-medium text-gray-600">{t("pages.adminPages.assign")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((lead) => {
                const id = String(lead.id);
                return (
                  <tr key={id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">
                      {lead.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {lead.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{lead.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                      {lead.property_address || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {lead.source ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedAgent[id] ?? ""}
                          onChange={(e) =>
                            setSelectedAgent((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          className="min-w-[140px] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        >
                          <option value="">{t("pages.adminPages.selectAgent")}</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!selectedAgent[id] || assigning === id}
                          onClick={() => assignLead(id)}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {assigning === id ? "..." : t("common:actions.assign")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
