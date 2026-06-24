"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ShareReport from "@/components/share/ShareReport";

type ReportRow = {
  id: string;
  property_address: string | null;
  lead_name: string | null;
  lead_email: string | null;
  created_at: string;
};

export default function ReportsClient({ reports }: { reports: ReportRow[] }) {
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const filtered = reports
    .filter((r) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (r.property_address ?? "").toLowerCase().includes(s) || (r.lead_name ?? "").toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      return new Date(a.created_at).getTime() < new Date(b.created_at).getTime() ? dir : -dir;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">{reports.length} generated reports</p>
        </div>
        <Link href="/smart-cma-builder?save=1" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Create Report
        </Link>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by address or lead name..."
        className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm" />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Property</th>
                <th className="text-left px-4 py-2.5 font-medium">Lead</th>
                <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-900" onClick={() => setSortAsc((v) => !v)}>
                  Date {sortAsc ? "\u25B2" : "\u25BC"}
                </th>
                <th className="text-left px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => {
                const reportLink = `/report/${encodeURIComponent(r.id)}`;
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[250px] truncate">{r.property_address ?? "\u2014"}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {r.lead_name ?? "\u2014"}
                      {r.lead_email && <span className="block text-xs text-gray-400">{r.lead_email}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link href={reportLink} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Open</Link>
                        <ShareReport
                          shareUrl={origin ? `${origin}${reportLink}` : null}
                          subject={`Property Report — ${r.property_address ?? "your property"}`}
                          resourceLabel={`the property report for ${r.property_address ?? "your property"}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No reports found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
