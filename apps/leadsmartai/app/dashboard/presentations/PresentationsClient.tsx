"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import PresentationView from "@/components/presentations/PresentationView";
import ShareReport from "@/components/share/ShareReport";

type PresentationData = {
  property: {
    address: string;
    city: string | null;
    state: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    propertyType: string | null;
    yearBuilt: number | null;
  };
  estimate: {
    estimatedValue: number | null;
    low: number | null;
    high: number | null;
    avgPricePerSqft: number | null;
    summary: string;
  };
  comps: Array<{
    address: string;
    price: number;
    sqft: number;
    pricePerSqft: number;
    distanceMiles: number;
    soldDate: string;
    beds: number | null;
    baths: number | null;
    propertyType: string | null;
  }>;
  pricing_strategy: string;
  market_insights: string;
  marketing_plan: string;
};

type GeneratePresentationResponse = {
  presentation_id: string;
  data: PresentationData;
};

type PresentationHistoryRow = {
  id: string;
  property_address: string | null;
  created_at: string | null;
};

export default function PresentationsClient({
  initialPresentations,
}: {
  initialPresentations: PresentationHistoryRow[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [address, setAddress] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<{
    presentationId: string;
    data: PresentationData;
  } | null>(null);

  const [history, setHistory] = useState<PresentationHistoryRow[]>(
    initialPresentations ?? []
  );

  // Absolute origin for building per-row share links (client-only to avoid
  // an SSR/hydration mismatch).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (!presentation?.presentationId) return "";
    const origin = window.location.origin;
    return `${origin}/presentation/${encodeURIComponent(presentation.presentationId)}`;
  }, [presentation?.presentationId]);

  const canGenerate = address.trim().length > 5;

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    setPresentation(null);

    try {
      const res = await fetch("/api/generate-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.success === false) {
        throw new Error(json?.message ?? json?.error ?? "Failed to generate presentation.");
      }

      const data = json as GeneratePresentationResponse;
      setPresentation({ presentationId: data.presentation_id, data: data.data });
      setHistory((prev) => [
        {
          id: String(data.presentation_id),
          property_address: data.data?.property?.address ?? address.trim(),
          created_at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20));
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error generating presentation.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="ui-page-title text-brand-text">{t("pages.presentations.heading")}</h1>
          <p className="ui-page-subtitle text-brand-text/80">{t("pages.presentations.intro")}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
        <label className="block space-y-2">
          <span className="ui-card-subtitle block text-slate-700">{t("pages.presentations.propertyAddress")}</span>
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder={t("pages.presentations.addressPlaceholder")}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </label>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <button
          onClick={handleGenerate}
          disabled={generating || !canGenerate}
          className="w-full inline-flex items-center justify-center rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white hover:bg-[#005ca8] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generating ? t("pages.presentations.generating") : t("pages.presentations.generate")}
        </button>
      </div>

      {presentation ? (
        <div className="space-y-4">
          <PresentationView
            data={presentation.data as unknown as Record<string, unknown>}
            propertyAddress={presentation.data?.property?.address}
            shareUrl={shareUrl || null}
          />
        </div>
      ) : null}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <div className="ui-card-title text-brand-text">{t("pages.presentations.recent")}</div>
            <div className="text-xs text-slate-600 mt-1">{t("pages.presentations.openPast")}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="ui-table-header text-left px-3 py-3">{t("pages.presentations.colProperty")}</th>
                <th className="ui-table-header text-left px-3 py-3">{t("pages.presentations.colCreated")}</th>
                <th className="ui-table-header text-left px-3 py-3">{t("pages.presentations.open")}</th>
              </tr>
            </thead>
            <tbody>
              {history.length ? (
                history.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="ui-table-cell px-3 py-3">
                      <div className="ui-card-title text-slate-900">
                        {p.property_address ?? "—"}
                      </div>
                    </td>
                    <td className="ui-table-cell px-3 py-3 text-slate-600 whitespace-nowrap">
                      {p.created_at ? new Date(p.created_at).toLocaleString(locale) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/presentation/${encodeURIComponent(p.id)}`}
                          className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-[#005ca8]"
                        >
                          {t("pages.presentations.openArrow")}
                        </Link>
                        <ShareReport
                          shareUrl={origin ? `${origin}/presentation/${encodeURIComponent(p.id)}` : null}
                          subject={`Listing Presentation — ${p.property_address ?? "your home"}`}
                          resourceLabel={`the listing presentation for ${p.property_address ?? "your home"}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-sm text-slate-600">{t("pages.presentations.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

