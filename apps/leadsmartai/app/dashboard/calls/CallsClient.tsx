"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

type CallRow = {
  id: string;
  contact_id: string | null;
  lead_name: string | null;
  direction: string;
  from_phone: string;
  to_phone: string;
  status: string | null;
  duration_seconds: number | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  needs_human: boolean;
  hot_lead: boolean;
  started_at: string | null;
  created_at: string;
};

export default function CallsClient({ calls: initialCalls }: { calls: CallRow[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [calls] = useState(initialCalls);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = calls.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (c.lead_name ?? "").toLowerCase().includes(s) || c.from_phone.includes(s) || c.to_phone.includes(s) || (c.summary ?? "").toLowerCase().includes(s);
  });

  function formatDuration(secs: number | null) {
    if (!secs) return "\u2014";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t("pages.calls.heading")}</h1>
        <p className="text-sm text-gray-500">{calls.length} total calls</p>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pages.calls.search")}
        className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm" />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.calls.colContact")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.calls.colDirection")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.calls.colDuration")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.calls.colSummary")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.calls.colDate")}</th>
                <th className="text-left px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <>
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{c.lead_name ?? c.from_phone}</p>
                      <p className="text-xs text-gray-500">{c.from_phone} → {c.to_phone}</p>
                      {c.hot_lead && <span className="text-[10px] text-red-600">{t("pages.calls.hot")}</span>}
                      {c.needs_human && <span className="ml-1 text-[10px] text-amber-600">{t("pages.calls.needsFollowUp")}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.direction === "inbound" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {c.direction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDuration(c.duration_seconds)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[250px] truncate">{c.summary ?? "\u2014"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(c.started_at ?? c.created_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                      {" "}
                      {new Date(c.started_at ?? c.created_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        {expandedId === c.id ? t("pages.calls.close") : t("pages.calls.details")}
                      </button>
                      {c.lead_name && (
                        <a href={`tel:${c.from_phone.replace(/\D/g, "")}`} className="ml-2 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">{t("pages.callsPage.callBack")}</a>
                      )}
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={6} className="bg-gray-50 px-6 py-4">
                        <div className="space-y-3">
                          {c.summary && (
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500">{t("pages.calls.aiSummary")}</h4>
                              <p className="mt-1 text-sm text-gray-700">{c.summary}</p>
                            </div>
                          )}
                          {c.transcript && (
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500">{t("pages.calls.transcript")}</h4>
                              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{c.transcript}</p>
                            </div>
                          )}
                          {c.recording_url && (
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500">{t("pages.calls.recording")}</h4>
                              <audio controls src={c.recording_url} className="mt-1 w-full max-w-md" />
                            </div>
                          )}
                          {!c.summary && !c.transcript && !c.recording_url && (
                            <p className="text-sm text-gray-400">{t("pages.calls.noDetails")}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{t("pages.calls.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
