"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PaywallModal from "@/components/PaywallModal";
type SubjectProperty = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  condition: string;
};

type Comparable = {
  address: string;
  price: number;
  sqft: number;
  beds: number;
  baths: number;
  distanceMiles: number;
  soldDate: string;
  propertyType: string;
  pricePerSqft: number;
};

type CmaResponse = {
  subject: SubjectProperty & { propertyType: string };
  comps: Comparable[];
  avgPricePerSqft: number;
  estimatedValue: number;
  low: number;
  high: number;
  strategies: {
    aggressive: number;
    market: number;
    premium: number;
    daysOnMarket: {
      aggressive: number;
      market: number;
      premium: number;
    };
  };
  summary: string;
};

export default function SmartCmaBuilderPage() {
  return (
    <Suspense fallback={null}>
      <SmartCmaBuilderPageInner />
    </Suspense>
  );
}

function SmartCmaBuilderPageInner() {
  const { t } = useTranslation("dashboard");
  const searchParams = useSearchParams();
  const initialAddress = searchParams?.get("address") ?? "";
  const queryLeadId = searchParams?.get("contact_id") ?? null;
  const autoSave =
    searchParams?.get("save") === "1" || searchParams?.get("save") === "true";

  const [address, setAddress] = useState<string>(initialAddress);
  const [beds, setBeds] = useState<number | undefined>(3);
  const [baths, setBaths] = useState<number | undefined>(2);
  const [sqft, setSqft] = useState<number | undefined>(1850);
  const [yearBuilt, setYearBuilt] = useState<number | undefined>(1995);
  const [condition, setCondition] = useState("Average");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CmaResponse | null>(null);

  const [savingReport, setSavingReport] = useState(false);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    reached: boolean;
    warning: boolean;
  } | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const [attachedLeadId, setAttachedLeadId] = useState<string | null>(
    queryLeadId ?? null
  );

  const [leadOptions, setLeadOptions] = useState<
    Array<{
      id: string;
      name: string | null;
      email: string | null;
      property_address: string | null;
      source: string | null;
      lead_status: string | null;
      created_at: string;
    }>
  >([]);
  const [leadOptionsLoading, setLeadOptionsLoading] = useState(false);
  const [leadOptionsError, setLeadOptionsError] = useState<string | null>(null);

  useEffect(() => {
    // Use the `address=` query param as the initial address without overwriting
    // user edits after the user starts typing.
    if (initialAddress && !address.trim()) {
      setAddress(initialAddress);
    }
  }, [initialAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAttachedLeadId(queryLeadId ?? null);
  }, [queryLeadId]);

  useEffect(() => {
    // Populate lead dropdown from the authenticated agent's CRM.
    // The portal already uses /api/leads elsewhere, so we reuse it here.
    let cancelled = false;
    async function load() {
      setLeadOptionsLoading(true);
      setLeadOptionsError(null);
      try {
        const res = await fetch("/api/leads");
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error ?? "Failed to load leads");
        }
        if (!cancelled) setLeadOptions((json.leads ?? []) as any);
      } catch (e: any) {
        if (!cancelled) setLeadOptionsError(e?.message ?? "Failed to load leads");
      } finally {
        if (!cancelled) setLeadOptionsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Load current usage once on page load.
    let cancelled = false;
    async function loadUsage() {
      try {
        const res = await fetch("/api/cma/check-limit", { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || json?.ok === false) return;
        if (!cancelled) setUsage(json?.usage ?? null);
      } catch {}
    }
    loadUsage();
    return () => {
      cancelled = true;
    };
  }, []);

  const attachedLead = useMemo(() => {
    if (!attachedLeadId) return null;
    return leadOptions.find((l) => l.id === attachedLeadId) ?? null;
  }, [attachedLeadId, leadOptions]);

  useEffect(() => {
    // If agent attaches a lead but hasn't entered an address yet, use the lead's property_address.
    // This is best-effort and doesn't override manual user edits.
    if (!attachedLead) return;
    if (address.trim()) return;
    if (!attachedLead.property_address) return;
    setAddress(attachedLead.property_address);
  }, [attachedLead, address]);

  const handleGenerate = async (
    forceRefresh = false,
    opts?: { addressOverride?: string; saveAfterGenerate?: boolean }
  ) => {
    setError(null);
    setSaveError(null);
    setSavedReportId(null);
    setData(null);

    const addressToUse = (opts?.addressOverride ?? address).trim();
    if (!addressToUse) {
      setError("Please enter a property address.");
      return;
    }

    setLoading(true);
    try {
      const refreshQuery = forceRefresh ? "?refresh=true" : "";
      const res = await fetch(`/api/smart-cma${refreshQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addressToUse,
          beds,
          baths,
          sqft,
          yearBuilt,
          condition,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setUsage(body?.usage ?? usage);
          setPaywallOpen(true);
        }
        throw new Error(body.error || "Failed to generate CMA.");
      }

      const json: CmaResponse = await res.json();
      setData(json);
      setUsage((json as any)?.usage ?? usage);

      const shouldSave = autoSave || opts?.saveAfterGenerate;
      if (shouldSave) {
        // Auto-save after dashboard-driven report creation or explicit request.
        await handleSaveReport(forceRefresh);
      }
    } catch (e: any) {
      setError(e.message || "Unexpected error while generating CMA.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString()}`;

  const handleCreateAndSaveForLead = async () => {
    if (!attachedLeadId) return;
    if (!attachedLead?.property_address) {
      setSaveError(null);
      setError("Attached lead does not have a property address to generate a report for.");
      return;
    }

    // Generate using the lead's property address and persist the report,
    // attaching it to `attachedLeadId`.
    await handleGenerate(false, {
      addressOverride: attachedLead.property_address,
      saveAfterGenerate: true,
    });
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();

      let y = 10;
      doc.setFontSize(14);
      doc.text("Smart CMA Report", 10, y);
      y += 7;

      doc.setFontSize(10);
      doc.text("Property Summary", 10, y);
      y += 5;
      doc.text(`Address: ${data.subject.address}`, 12, y);
      y += 5;
      doc.text(
        `${data.subject.beds} beds • ${data.subject.baths} baths • ${data.subject.sqft.toLocaleString()} sqft • ${data.subject.propertyType}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Year Built: ${data.subject.yearBuilt} • Condition: ${data.subject.condition}`,
        12,
        y
      );
      y += 8;

      doc.text("Valuation", 10, y);
      y += 5;
      doc.text(
        `Estimated Value: ${formatCurrency(data.estimatedValue)}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Range: ${formatCurrency(data.low)} – ${formatCurrency(data.high)}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Avg Price/Sqft: $${data.avgPricePerSqft.toFixed(0)}`,
        12,
        y
      );
      y += 8;

      doc.text("Listing Strategies", 10, y);
      y += 5;
      doc.text(
        `Aggressive: ${formatCurrency(
          data.strategies.aggressive
        )} (≈${data.strategies.daysOnMarket.aggressive} days)`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Market: ${formatCurrency(
          data.strategies.market
        )} (≈${data.strategies.daysOnMarket.market} days)`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Premium: ${formatCurrency(
          data.strategies.premium
        )} (≈${data.strategies.daysOnMarket.premium} days)`,
        12,
        y
      );
      y += 8;

      doc.text("AI CMA Summary", 10, y);
      y += 5;
      const summaryLines = doc.splitTextToSize(data.summary, 190);
      summaryLines.forEach((line: string) => {
        if (y > 280) {
          doc.addPage();
          y = 10;
        }
        doc.text(line, 12, y);
        y += 5;
      });

      doc.save("smart-cma-report.pdf");
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert(
        "There was an issue generating the PDF. Make sure 'jspdf' is installed, then try again."
      );
    }
  };

  const handleSaveReport = async (forceRefreshForReport = false) => {
    if (!address.trim()) return;

    setSavingReport(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/create-property-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          contact_id: attachedLeadId ?? null,
          forceRefresh: forceRefreshForReport,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message || json?.error || "Failed to save report.");
      }

      setSavedReportId(json.reportId || null);
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to save report.");
    } finally {
      setSavingReport(false);
    }
  };

  return (
    <>
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("pages.smartCmaBuilder.h1")}</h1>
        <p className="text-sm text-gray-600 mb-4">{t("pages.smartCmaBuilder.sub")}</p>
        {usage ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-700 font-medium">{t("pages.smartCmaBuilder.youHaveUsed")} {usage.used}/{usage.limit} {t("pages.smartCmaBuilder.reportsToday")}</div>
            {usage.warning && !usage.reached ? (
              <div className="text-[11px] text-amber-700 mt-1">
                ⚠️ You’re almost out of free CMA reports
              </div>
            ) : null}
            {usage.reached ? (
              <div className="text-[11px] text-red-700 mt-1">{t("pages.smartCmaBuilder.limitReached")}</div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-700">{t("pages.smartCmaBuilder.attachToLead")}</div>
                <div className="text-[11px] text-slate-500 mt-1">{t("pages.smartCmaBuilder.attachNote")}</div>
              </div>
              <div className="flex-1 sm:max-w-[420px]">
                {leadOptionsLoading ? (
                  <div className="text-xs text-slate-600">{t("pages.smartCmaBuilder.loadingLeads")}</div>
                ) : null}
                {leadOptionsError ? (
                  <div className="text-xs text-red-600">{leadOptionsError}</div>
                ) : null}
                <select
                  value={attachedLeadId ?? ""}
                  onChange={(e) => setAttachedLeadId(e.target.value || null)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  disabled={leadOptionsLoading || !!leadOptionsError}
                >
                  <option value="">{t("pages.smartCmaBuilder.doNotAttach")}</option>
                  {leadOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name ?? t("pages.notifications.lead")}{" "}
                      {l.property_address ? `- ${l.property_address}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {attachedLead ? (
              <div className="text-xs text-slate-600">{t("pages.smartCmaBuilder.attachedTo")}{" "}
                <span className="font-semibold">{attachedLead.name ?? t("pages.notifications.lead")}</span> •{" "}
                {attachedLead.property_address ?? t("pages.smartCmaBuilder.noAddress")}
              </div>
            ) : (
              <div className="text-xs text-slate-600">{t("pages.smartCmaBuilder.noLeadAttached")}</div>
            )}

            {attachedLeadId && attachedLead?.property_address ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-[11px] text-slate-500">{t("pages.smartCmaBuilder.useLeadAddress")}</div>
                <button
                  type="button"
                  onClick={handleCreateAndSaveForLead}
                  disabled={loading || savingReport}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >{t("pages.smartCmaBuilder.createAndSave")}</button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-stretch">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("pages.smartCmaBuilder.propertyAddress")}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleGenerate(false)}
              disabled={loading}
              className="inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed min-w-[150px]"
            >
              {loading && (
                <span className="mr-2 inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? t("common:status.generating") : t("pages.smartCmaBuilder.generateCma")}
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={loading}
              className="inline-flex items-center justify-center bg-white text-blue-700 text-sm font-semibold px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed min-w-[180px]"
            >{t("pages.smartCmaBuilder.refreshData")}</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <LabeledInput
              label={t("pages.articleChrome.beds", { ns: "dashboard" })}
              value={beds ?? ""}
              onChange={(v) => setBeds(v ? Number(v) || 0 : undefined)}
            />
            <LabeledInput
              label={t("pages.articleChrome.baths", { ns: "dashboard" })}
              value={baths ?? ""}
              onChange={(v) => setBaths(v ? Number(v) || 0 : undefined)}
            />
            <LabeledInput
              label={t("pages.articleChrome.sqft", { ns: "dashboard" })}
              value={sqft ?? ""}
              onChange={(v) => setSqft(v ? Number(v) || 0 : undefined)}
            />
            <LabeledInput
              label={t("pages.articleChrome.yearBuilt", { ns: "dashboard" })}
              value={yearBuilt ?? ""}
              onChange={(v) =>
                setYearBuilt(v ? Number(v) || new Date().getFullYear() : undefined)
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="flex flex-col">
              <span className="font-semibold text-gray-600 mb-1">{t("pages.smartCmaBuilder.condition")}</span>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>{t("pages.smartCmaBuilder.needsWork")}</option>
                <option>{t("pages.smartCmaBuilder.average")}</option>
                <option>{t("pages.smartCmaBuilder.updated")}</option>
                <option>{t("pages.smartCmaBuilder.fullyRenovated")}</option>
              </select>
            </label>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>
        )}
      </div>

      {data && (
        <>
          <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.smartCmaBuilder.propertySummary")}</h2>
            <p className="text-sm font-medium text-gray-800">
              {data.subject.address}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {data.subject.beds} beds • {data.subject.baths} baths •{" "}
              {data.subject.sqft.toLocaleString()} sqft •{" "}
              {data.subject.propertyType}
            </p>
            <p className="text-xs text-gray-600">{t("pages.smartCmaBuilder.built")} {data.subject.yearBuilt} • Condition:{" "}
              {data.subject.condition}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.smartCmaBuilder.estimatedValue")}</h3>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(data.estimatedValue)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Based on avg price/sqft of nearby comps (
                ${data.avgPricePerSqft.toFixed(0)}).
              </p>
            </div>
            <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.smartCmaBuilder.priceRange")}</h3>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(data.low)} – {formatCurrency(data.high)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ≈ ±8% around the estimated value.
              </p>
            </div>
            <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.smartCmaBuilder.strategySnapshot")}</h3>
              <p className="text-xs text-gray-700">{t("pages.smartCmaBuilder.aggressive")}{" "}
                <span className="font-semibold">
                  {formatCurrency(data.strategies.aggressive)}
                </span>{" "}
                (≈{data.strategies.daysOnMarket.aggressive} days)
              </p>
              <p className="text-xs text-gray-700">{t("pages.smartCmaBuilder.market")}{" "}
                <span className="font-semibold">
                  {formatCurrency(data.strategies.market)}
                </span>{" "}
                (≈{data.strategies.daysOnMarket.market} days)
              </p>
              <p className="text-xs text-gray-700">{t("pages.smartCmaBuilder.premium")}{" "}
                <span className="font-semibold">
                  {formatCurrency(data.strategies.premium)}
                </span>{" "}
                (≈{data.strategies.daysOnMarket.premium} days)
              </p>
            </div>
          </div>

          <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">{t("pages.articleChrome.comparableSales", { ns: "dashboard" })}</h2>
              <span className="text-xs text-gray-500">
                {data.comps.length} comps used (last 6 months, ~0.5 mi)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.address", { ns: "dashboard" })}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.smartCmaBuilder.soldPrice")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.sqft", { ns: "dashboard" })}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.smartCmaBuilder.pricePerSqft")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.beds", { ns: "dashboard" })}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.baths", { ns: "dashboard" })}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.smartCmaBuilder.distance")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.smartCmaBuilder.soldDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comps.map((c, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.address}
                      </td>
                      <td className="px-3 py-2">
                        ${c.price.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {c.sqft.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        ${c.pricePerSqft.toFixed(0)}
                      </td>
                      <td className="px-3 py-2">{c.beds}</td>
                      <td className="px-3 py-2">{c.baths}</td>
                      <td className="px-3 py-2">
                        {c.distanceMiles.toFixed(2)} mi
                      </td>
                      <td className="px-3 py-2">{c.soldDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-sm text-blue-900">
            <h2 className="text-sm font-semibold mb-2">{t("pages.smartCmaBuilder.aiSummary")}</h2>
            <p>{data.summary}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700"
            >{t("pages.smartCmaBuilder.downloadPdf")}</button>

            <button
              type="button"
              onClick={() => handleSaveReport(false)}
              disabled={savingReport}
              className="inline-flex items-center bg-white text-blue-700 text-sm font-semibold px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingReport ? t("common:status.saving") : t("pages.smartCmaBuilder.saveToReports")}
            </button>
          </div>

          {savedReportId ? (
            <div className="pt-2">
              <Link
                href={`/report/${encodeURIComponent(savedReportId)}`}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >{t("pages.smartCmaBuilder.openSaved")}</Link>
            </div>
          ) : null}

          {saveError ? (
            <p className="text-xs text-red-600 font-medium pt-2">{saveError}</p>
          ) : null}
        </>
      )}
    </div>
    <PaywallModal
      open={paywallOpen}
      onClose={() => setPaywallOpen(false)}
      message={t("pages.smartCmaBuilder.paywallMessage")}
      ctaLabel={t("pages.smartCmaBuilder.paywallCta")}
    />
    {paywallOpen ? (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <button
          type="button"
          onClick={() => setPaywallOpen(false)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >{t("pages.smartCmaBuilder.tryTomorrow")}</button>
      </div>
    ) : null}
    </>
  );
}

type LabeledInputProps = {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
};

function LabeledInput({ label, value, onChange }: LabeledInputProps) {
  return (
    <label className="flex flex-col">
      <span className="font-semibold text-gray-600 mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

