"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

type Opportunity = {
  id: string;
  property_address: string;
  lead_type: string;
  intent_score: number;
  usage_count: number;
  estimated_value: number | null;
  status: string;
  assigned_agent_id: string | null;
  price: number;
  created_at: string;
};

export default function OpportunitiesPage() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [metrics, setMetrics] = useState<{
    availableCount: number;
    soldCount: number;
    conversionRate: number;
    revenuePerLead: number;
    soldRevenue: number;
    toolUsageSummary: Record<string, number>;
  } | null>(null);

  const [location, setLocation] = useState("");
  const [leadType, setLeadType] = useState("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    if (leadType.trim()) params.set("leadType", leadType.trim());
    if (minPrice.trim()) params.set("minPrice", minPrice.trim());
    if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params;
  }, [location, leadType, minPrice, maxPrice, page, pageSize]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setError(null);
      try {
        const res = await fetch("/api/marketplace/summary", { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || json?.ok === false) throw new Error(json?.error ?? "Failed to load summary.");
        if (!cancelled) setMetrics(json.metrics ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load summary.");
      }
    }

    async function loadOpps() {
      setLoading(true);
      setBuyError(null);
      try {
        const res = await fetch(`/api/marketplace/opportunities?${queryParams.toString()}`, {
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || json?.ok === false) throw new Error(json?.error ?? "Failed to load opportunities.");
        if (!cancelled) {
          setOpportunities((json.opportunities ?? []) as Opportunity[]);
          setTotal(Number(json.total ?? 0));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load opportunities.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSummary();
    loadOpps();

    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  async function handleBuy(id: string) {
    setBuyError(null);
    setBuyingId(id);
    try {
      const res = await fetch(`/api/marketplace/opportunities/${id}/buy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        const msg = json?.error ?? "Purchase failed";
        const status = Number(json?.status_code ?? 0);
        if (status === 402) {
          setBuyError(msg);
          return;
        }
        throw new Error(msg);
      }

      // Refresh the list after purchase.
      const res2 = await fetch(`/api/marketplace/opportunities?${queryParams.toString()}`, {
        credentials: "include",
      });
      const json2 = (await res2.json().catch(() => ({}))) as any;
      if (json2?.ok !== true) throw new Error(json2?.error ?? "Failed to refresh opportunities.");
      setOpportunities((json2.opportunities ?? []) as Opportunity[]);
      setTotal(Number(json2.total ?? 0));
    } catch (e: any) {
      setBuyError(e?.message ?? "Could not complete purchase.");
    } finally {
      setBuyingId(null);
    }
  }

  const leadTypeOptions = useMemo(() => {
    return ["seller", "buyer", "refinance"];
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="ui-page-title text-brand-text">{t("pages.opportunities.heading")}</h1>
          <p className="ui-page-subtitle text-brand-text/80 mt-1">{t("pages.opportunities.buyExclusive", { ns: "dashboard" })}</p>
        </div>
        <div className="text-xs text-slate-500">{t("pages.opportunities.dynamicPricing", { ns: "dashboard" })}</div>
      </div>

      {metrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="ui-card-subtitle text-slate-500">{t("pages.opportunities.available")}</div>
            <div className="text-2xl font-bold text-slate-900">{metrics.availableCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="ui-card-subtitle text-slate-500">{t("pages.opportunities.sold")}</div>
            <div className="text-2xl font-bold text-slate-900">{metrics.soldCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="ui-card-subtitle text-slate-500">{t("pages.opportunities.conversion")}</div>
            <div className="text-2xl font-bold text-slate-900">
              {(metrics.conversionRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="ui-card-subtitle text-slate-500">{t("pages.opportunities.revenuePerLead")}</div>
            <div className="text-2xl font-bold text-slate-900">${Math.round(metrics.revenuePerLead).toLocaleString()}</div>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-700">{t("pages.opportunities.location")}</label>
            <input
              value={location}
              onChange={(e) => {
                setPage(1);
                setLocation(e.target.value);
              }}
              placeholder={t("pages.opportunities.locationPlaceholder")}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="w-full sm:w-44">
            <label className="block text-xs font-medium text-slate-700">{t("pages.opportunities.leadType")}</label>
            <select
              value={leadType}
              onChange={(e) => {
                setPage(1);
                setLeadType(e.target.value);
              }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">{t("pages.opportunities.all")}</option>
              {leadTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-44">
            <label className="block text-xs font-medium text-slate-700">{t("pages.opportunities.minPrice")}</label>
            <input
              value={minPrice}
              onChange={(e) => {
                setPage(1);
                setMinPrice(e.target.value);
              }}
              placeholder="10"
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="w-full sm:w-44">
            <label className="block text-xs font-medium text-slate-700">{t("pages.opportunities.maxPrice")}</label>
            <input
              value={maxPrice}
              onChange={(e) => {
                setPage(1);
                setMaxPrice(e.target.value);
              }}
              placeholder="100"
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-600">{t("pages.opportunities.loading")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="ui-table-header text-left text-slate-600 px-4 py-3">{t("pages.opportunities.colAddress")}</th>
                  <th className="ui-table-header text-left text-slate-600 px-4 py-3">{t("pages.opportunities.leadType")}</th>
                  <th className="ui-table-header text-left text-slate-600 px-4 py-3">{t("pages.opportunities.colIntent")}</th>
                  <th className="ui-table-header text-left text-slate-600 px-4 py-3">{t("pages.opportunities.colPrice")}</th>
                  <th className="ui-table-header text-left text-slate-600 px-4 py-3">{t("pages.opportunities.colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-sm text-slate-600">{t("pages.opportunities.noMatches", { ns: "dashboard" })}</td>
                  </tr>
                ) : (
                  opportunities.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="ui-table-cell px-4 py-3 text-slate-900">
                        {o.property_address}
                      </td>
                      <td className="ui-table-cell px-4 py-3 text-slate-700">
                        {o.lead_type}
                      </td>
                      <td className="ui-table-cell px-4 py-3 text-slate-700">
                        <span className="font-semibold">{o.intent_score}</span>
                      </td>
                      <td className="ui-table-cell px-4 py-3 text-slate-900 font-semibold">
                        ${o.price}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={buyingId === o.id}
                          onClick={() => handleBuy(o.id)}
                          className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-[#005ca8] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {buyingId === o.id ? t("pages.opportunities.buying") : t("pages.opportunities.buy")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {buyError ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {buyError}{" "}
          <Link className="text-brand-primary font-semibold underline" href="/agent/pricing">{t("pages.opportunities.goToPricing", { ns: "dashboard" })}</Link>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-500">{t("pages.opportunities.showingOf", { shown: opportunities.length, total })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >{t("pages.opportunities.prev", { ns: "dashboard" })}</button>
          <button
            type="button"
            disabled={opportunities.length < pageSize}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >{t("pages.opportunities.next", { ns: "dashboard" })}</button>
        </div>
      </div>
    </div>
  );
}

