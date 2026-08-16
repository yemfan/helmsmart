"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

type Lead = {
  name: string;
  address: string;
  email: string;
  phone?: string;
  agent_id?: string;
  timestamp: string;
};

type LeadsResponse = {
  leads: Lead[];
};

export default function AgentHomeValueLeadsPage() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/home-value-leads");
        if (!res.ok) throw new Error("Failed to load leads.");
        const data: LeadsResponse = await res.json();
        setLeads(data.leads || []);
      } catch (e: any) {
        setError(e.message || "Unexpected error.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExportCsv = () => {
    if (!leads.length) return;
    const header = [
      "Name",
      "Address",
      "Email",
      "Phone",
      "Agent ID",
      "Date",
    ];
    const rows = leads.map((l) => [
      l.name || "",
      l.address || "",
      l.email || "",
      l.phone || "",
      l.agent_id || "",
      l.timestamp || "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "home-value-leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Home Value Leads
          </h1>
          <p className="text-sm text-gray-600">
            View and export leads captured from your home value widgets.
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!leads.length}
          className="inline-flex items-center bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white shadow rounded-xl p-4 border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-600">
            <span className="mr-2 inline-block h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading leads...
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !leads.length ? (
          <p className="text-sm text-gray-600">
            No leads found yet. Embed your home value widget to start capturing
            seller leads.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.name", { ns: "dashboard" })}</th>
                  <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.address", { ns: "dashboard" })}</th>
                  <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.email", { ns: "dashboard" })}</th>
                  <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.phone", { ns: "dashboard" })}</th>
                  <th className="px-3 py-2 font-semibold">Agent ID</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {lead.name}
                    </td>
                    <td className="px-3 py-2">{lead.address}</td>
                    <td className="px-3 py-2">{lead.email}</td>
                    <td className="px-3 py-2">{lead.phone}</td>
                    <td className="px-3 py-2">{lead.agent_id}</td>
                    <td className="px-3 py-2">
                      {new Date(lead.timestamp).toLocaleString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

