"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useHomeValueEstimate } from "@/lib/home-value/useHomeValueEstimate";
import { AddressAutocompleteInput } from "@/components/home-value/AddressAutocompleteInput";
import { AddressConfirmCard } from "@/components/home-value/AddressConfirmCard";
import { RecentHistory } from "@/components/home-value/RecentHistory";
import { EstimateResultsSection } from "@/components/home-value/EstimateResultsSection";

/**
 * Seeds the address input from `?address=` on first mount so the homepage
 * hero search routes here pre-filled (validation report UX-01).
 *
 * Isolated in its own component (rendering nothing) because
 * `useSearchParams()` forces client-side rendering up to the nearest
 * Suspense boundary during static prerender. When the whole page called it,
 * the entire tool was stripped from the initial HTML and popped in after
 * hydration, shoving the footer down — CLS ~0.32 on the Lighthouse CI run.
 * Keeping the bailout scoped to this null-rendering child lets the hero,
 * input, and the rest of the page prerender normally.
 */
function AddressQuerySeed({ onSeed }: { onSeed: (address: string) => void }) {
  const searchParams = useSearchParams();
  // Ref guard prevents a navigation-triggered re-seed from clobbering
  // user edits.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    const seed = searchParams.get("address");
    if (seed && seed.trim().length > 0) {
      seededRef.current = true;
      onSeed(seed.trim());
    }
  }, [searchParams, onSeed]);
  return null;
}

export default function HomeValuePage() {
  const {
    uiState,
    error,
    unlockError,
    addressInput,
    setAddressInput,
    pendingAddress,
    details,
    setDetails,
    estimateResult,
    unlockResult,
    leadForm,
    setLeadForm,
    prepareAddressSelection,
    confirmSelectedAddress,
    clearPendingAddress,
    startEstimateFromTypedInput,
    runEstimate,
    unlockReport,
    nextActions,
    history,
    restoreFromHistory,
    busyRefine,
  } = useHomeValueEstimate();

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Renders nothing — fallback null causes no layout shift. See
            AddressQuerySeed for why this has its own Suspense boundary. */}
        <Suspense fallback={null}>
          <AddressQuerySeed onSeed={setAddressInput} />
        </Suspense>
        <AddressAutocompleteInput
          value={addressInput}
          onChange={setAddressInput}
          onSelect={(addr) => {
            void confirmSelectedAddress(addr);
          }}
          onSubmit={() => void startEstimateFromTypedInput()}
          isBusy={busyRefine}
          awaitingAddressConfirm={false}
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Show recent estimates ONLY when there's no active result
          (i.e., the user hasn't run an estimate yet). Once an
          estimate is showing, Recent Estimates moves below it as
          a compact list so the results aren't pushed down. */}
        {!estimateResult && history.length > 0 ? (
          <RecentHistory
            items={history}
            onOpen={(sessionId) => void restoreFromHistory(sessionId)}
          />
        ) : null}

        <EstimateResultsSection
          uiState={uiState}
          estimateResult={estimateResult}
          unlockResult={unlockResult}
          details={details}
          setDetails={setDetails}
          leadForm={leadForm}
          setLeadForm={setLeadForm}
          nextActions={nextActions}
          onRefreshEstimate={() => void runEstimate(undefined, details)}
          onUnlockReport={() => void unlockReport()}
          unlockError={unlockError}
        />

        {/* Recent estimates as a compact list below the results */}
        {estimateResult && history.length > 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Estimates</h3>
            <div className="divide-y divide-gray-100">
              {history.map((item) => (
                <button
                  key={item.sessionId}
                  type="button"
                  onClick={() => void restoreFromHistory(item.sessionId)}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left transition hover:bg-gray-50 rounded-lg px-2 -mx-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.address?.fullAddress ?? "Unknown"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.confidence} · {new Date(item.savedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">${item.estimateValue?.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-400">${item.rangeLow?.toLocaleString()} – ${item.rangeHigh?.toLocaleString()}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
