"use client";

import { EstimateCard } from "@/components/home-value/EstimateCard";
import { RefinementForm } from "@/components/home-value/RefinementForm";
import { ReportGate } from "@/components/home-value/ReportGate";
import { FullReport } from "@/components/home-value/FullReport";
import NextSteps from "@/components/NextSteps";
import {
  CompsMapPanel,
  EstimateExplainabilityPanel,
} from "@/components/home-value/CompsMapPanel";
import { ValueHistoryChart } from "@/components/home-value/ValueHistoryChart";
import { ListingStyleEstimateSection } from "@/components/home-value/ListingStyleEstimateSection";
import type {
  EstimateDetails,
  EstimateResponse,
  EstimateUiState,
  LeadForm,
  UnlockReportResponse,
} from "@/lib/home-value/types";

export function EstimateResultsSection({
  uiState,
  estimateResult,
  unlockResult,
  details,
  setDetails,
  leadForm,
  setLeadForm,
  onRefreshEstimate,
  onUnlockReport,
  unlockError,
}: {
  uiState: EstimateUiState;
  estimateResult: EstimateResponse | null;
  unlockResult: UnlockReportResponse | null;
  details: EstimateDetails;
  setDetails: React.Dispatch<React.SetStateAction<EstimateDetails>>;
  leadForm: LeadForm;
  setLeadForm: React.Dispatch<React.SetStateAction<LeadForm>>;
  onRefreshEstimate: () => void;
  onUnlockReport: () => void;
  unlockError?: string | null;
}) {
  if (!estimateResult) return null;

  const subject = {
    address: estimateResult.property.fullAddress,
    lat: estimateResult.property.lat,
    lng: estimateResult.property.lng,
    sqft: estimateResult.property.sqft,
    estimateValue: estimateResult.estimate.value,
    rangeLow: estimateResult.estimate.rangeLow,
    rangeHigh: estimateResult.estimate.rangeHigh,
    confidence: estimateResult.estimate.confidence,
    confidenceScore: estimateResult.estimate.confidenceScore,
    medianPpsf: estimateResult.supportingData.medianPpsf,
    weightedPpsf: estimateResult.supportingData.weightedPpsf,
    summary: estimateResult.estimate.summary,
    adjustments: estimateResult.adjustments,
  } as const;

  const p = estimateResult.property;
  const e = estimateResult.estimate;

  return (
    <div className="space-y-6">
      {/*
       * Combined estimate + property card. Previously these were
       * two separate components (#2 EstimateCard and #3
       * ListingStyleEstimateSection) which duplicated the estimate
       * value and looked redundant. Now it's one unified card.
       */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header: address + estimate value side by side */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 p-6 md:p-8">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">{p.fullAddress}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {[p.city, p.state, p.zip].filter(Boolean).join(", ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.beds ? <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">{p.beds} bd</span> : null}
              {p.baths ? <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">{p.baths} ba</span> : null}
              {p.sqft ? <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">{p.sqft.toLocaleString()} sqft</span> : null}
              {p.yearBuilt ? <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">Built {p.yearBuilt}</span> : null}
              {p.propertyType ? <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700">{p.propertyType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span> : null}
            </div>
          </div>
          <div className="shrink-0 rounded-2xl border border-gray-100 bg-gray-50 p-5 text-right md:min-w-[220px]">
            <p className="text-xs font-medium text-gray-500">Estimated Value</p>
            <p className="mt-1 text-3xl font-extrabold text-gray-900">${e.value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Range ${e.rangeLow.toLocaleString()} - ${e.rangeHigh.toLocaleString()}</p>
            <span className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${
              e.confidence === "high" ? "bg-green-100 text-green-700 border border-green-200" :
              e.confidence === "medium" ? "bg-yellow-100 text-yellow-700 border border-yellow-200" :
              "bg-red-100 text-red-700 border border-red-200"
            }`}>
              Confidence: {e.confidence.charAt(0).toUpperCase() + e.confidence.slice(1)} ({e.confidenceScore}/100)
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 md:px-8">
          <p className="text-sm text-gray-600">{e.summary}</p>
        </div>

        {/* Supporting data row */}
        <div className="grid grid-cols-2 gap-px bg-gray-100 md:grid-cols-4">
          {[
            { label: "Median Price / Sqft", value: subject.medianPpsf ? `$${Math.round(subject.medianPpsf)}/sqft` : "—" },
            { label: "Weighted Price / Sqft", value: subject.weightedPpsf ? `$${Math.round(subject.weightedPpsf)}/sqft` : "—" },
            { label: "Year Built", value: p.yearBuilt ? String(p.yearBuilt) : "—" },
            { label: "Lot Size", value: p.lotSize ? `${p.lotSize.toLocaleString()} sqft` : "—" },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4">
              <p className="text-[11px] font-medium text-gray-500">{item.label}</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comps map + explainability — always visible */}
      <CompsMapPanel subject={subject} comps={estimateResult.comps} />
      <EstimateExplainabilityPanel subject={subject} />
      <ValueHistoryChart address={p.fullAddress} currentValue={e.value} />

      <RefinementForm
        details={details}
        onChange={(patch) => setDetails((prev) => ({ ...prev, ...patch }))}
        onRefresh={onRefreshEstimate}
        isBusy={uiState === "refining"}
      />

      <ReportGate
        open={uiState !== "report_unlocked"}
        form={leadForm}
        onFormChange={(patch) => setLeadForm((prev) => ({ ...prev, ...patch }))}
        onUnlock={onUnlockReport}
        isBusy={uiState === "unlocking"}
        error={unlockError}
      />

      <FullReport estimate={estimateResult} unlockResult={unlockResult} />

      {/*
        Real, linked next steps — not the string list this used to render.
        components/NextSteps picks them from the visitor's own behaviour, gives
        each one a destination, and reports which were shown. It had been built
        and then never mounted anywhere.
      */}
      {uiState === "report_unlocked" ? <NextSteps /> : null}
    </div>
  );
}
