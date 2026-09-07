"use client";

import { useCallback, useEffect, useState } from "react";
import { mergeAuthHeaders } from "@/lib/mergeAuthHeaders";
import { trackEvent } from "@/lib/marketing/trackEvent";
import type { HomeValueEstimateResponse } from "@/lib/homeValue/types";
import AddressStep from "./AddressStep";
import DetailsStep, { type FunnelPropertyDetails } from "./DetailsStep";
import HomeValueFunnelSeo from "./HomeValueFunnelSeo";
import LeadCaptureStep from "./LeadCaptureStep";
import PreviewStep from "./PreviewStep";
import ProcessingStep from "./ProcessingStep";
import ProgressBar from "./ProgressBar";
import ResultStep from "./ResultStep";

type Step = "address" | "details" | "processing" | "preview" | "lead" | "result";

const defaultDetails = (): FunnelPropertyDetails => ({
  beds: 3,
  baths: 2,
  sqft: 1800,
  yearBuilt: null,
  lotSqft: null,
  propertyType: "single family",
  condition: "average",
  renovation: "none",
});

function stepToBar(step: Step): number {
  const m: Record<Step, number> = {
    address: 1,
    details: 2,
    processing: 3,
    preview: 4,
    lead: 5,
    result: 6,
  };
  return m[step];
}

export default function HomeValueFunnel() {
  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [details, setDetails] = useState<FunnelPropertyDetails>(defaultDetails);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [result, setResult] = useState<HomeValueEstimateResponse | null>(null);

  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  useEffect(() => {
    const id = crypto.randomUUID();
    setSessionId(id);
    try {
      const saved = sessionStorage.getItem("hv_funnel_sid");
      if (saved && saved.length > 8) setSessionId(saved);
      else sessionStorage.setItem("hv_funnel_sid", id);
    } catch {
      /* ignore */
    }
  }, []);

  const patchDetails = useCallback((patch: Partial<FunnelPropertyDetails>) => {
    setDetails((d) => ({ ...d, ...patch }));
  }, []);

  const patchLead = useCallback((patch: Partial<{ name: string; email: string; phone: string }>) => {
    if (patch.name !== undefined) setLeadName(patch.name);
    if (patch.email !== undefined) setLeadEmail(patch.email);
    if (patch.phone !== undefined) setLeadPhone(patch.phone);
  }, []);

  const onAddressNext = () => {
    setAddressError(null);
    const a = address.trim();
    if (a.length < 8) {
      setAddressError("Please enter a full street address with city and state or ZIP.");
      return;
    }
    trackEvent("home_value_funnel", { step: "address_ok" });
    setStep("details");
  };

  const runEstimate = async () => {
    setEstimateError(null);
    if (!sessionId) {
      setEstimateError("Session not ready — please refresh the page.");
      return;
    }
    if (details.sqft < 300) {
      setEstimateError("Please enter a living area (sq ft) of at least 300.");
      return;
    }

    setStep("processing");
    trackEvent("home_value_funnel", { step: "processing" });

    try {
      const headers = await mergeAuthHeaders();
      const body = {
        address: address.trim(),
        session_id: sessionId,
        beds: details.beds,
        baths: details.baths,
        sqft: details.sqft,
        lotSqft: details.lotSqft,
        yearBuilt: details.yearBuilt,
        propertyType: details.propertyType,
        condition: details.condition,
        renovation: details.renovation,
        intent_signals: { homeValueUsed: true },
      };

      const [res] = await Promise.all([
        fetch("/api/home-value/estimate", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(body),
        }),
        new Promise((r) => setTimeout(r, 1400)),
      ]);

      // Text first, then parse: a 504 from the platform is not JSON, and the
      // parser's own error is not something a homeowner should read.
      const text = await res.text();
      let raw: Record<string, unknown> | null = null;
      try {
        raw = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        raw = null;
      }
      if (raw === null) {
        throw new Error(
          res.status === 504 || res.status === 408
            ? "The estimate took longer than expected. Please try again in a moment."
            : "We couldn't reach the estimate service. Please try again.",
        );
      }

      if (!res.ok) {
        throw new Error(typeof raw.error === "string" ? raw.error : "Could not compute estimate.");
      }
      if (raw.ok === false) {
        throw new Error(typeof raw.error === "string" ? raw.error : "Could not compute estimate.");
      }
      if (!raw.estimate || typeof raw.sessionId !== "string") {
        throw new Error("Unexpected response from server.");
      }

      setResult(raw as HomeValueEstimateResponse);
      try {
        sessionStorage.setItem("hv_funnel_sid", raw.sessionId);
      } catch {
        /* ignore */
      }
      trackEvent("home_value_funnel", { step: "preview", session_id: raw.sessionId });
      setStep("preview");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setEstimateError(msg);
      setStep("details");
    }
  };

  const submitLead = async () => {
    if (!result) return;
    setLeadError(null);
    setLeadLoading(true);
    try {
      const headers = await mergeAuthHeaders();
      const res = await fetch("/api/home-value/lead", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          name: leadName.trim() || null,
          email: leadEmail.trim(),
          phone: leadPhone.trim() || null,
          address: address.trim(),
          property_type: details.propertyType,
          beds: details.beds,
          baths: details.baths,
          living_area_sqft: details.sqft,
          lot_size_sqft: details.lotSqft,
          year_built: details.yearBuilt,
          condition: details.condition,
          estimate_value: result.estimate.point,
          estimate_low: result.estimate.low,
          estimate_high: result.estimate.high,
          confidence_score: result.confidence.score,
          source: "home_value_funnel",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(typeof json.error === "string" ? json.error : "Could not save your details.");
      }
      trackEvent("home_value_funnel", { step: "lead_captured" });
      setStep("result");
    } catch (e: unknown) {
      setLeadError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setLeadLoading(false);
    }
  };

  const startOver = () => {
    const id = crypto.randomUUID();
    setSessionId(id);
    try {
      sessionStorage.setItem("hv_funnel_sid", id);
    } catch {
      /* ignore */
    }
    setAddress("");
    setDetails(defaultDetails());
    setResult(null);
    setEstimateError(null);
    setLeadName("");
    setLeadEmail("");
    setLeadPhone("");
    setLeadError(null);
    setStep("address");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-xl px-4 py-8 sm:max-w-2xl sm:py-12">
        <header className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0072ce]">PropertyTools AI</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Free home value estimate</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600 sm:text-base">
            Not an appraisal — an instant estimated range and confidence score using local market signals.
          </p>
        </header>

        <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <ProgressBar current={stepToBar(step)} />
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          {step === "address" && (
            <AddressStep
              address={address}
              error={addressError}
              onAddressChange={setAddress}
              onSubmit={onAddressNext}
            />
          )}

          {step === "details" && (
            <>
              {estimateError ? (
                <div
                  className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {estimateError}
                </div>
              ) : null}
              <DetailsStep
                details={details}
                onChange={patchDetails}
                onBack={() => {
                  setEstimateError(null);
                  setStep("address");
                }}
                onSubmit={runEstimate}
              />
            </>
          )}

          {step === "processing" && <ProcessingStep />}

          {step === "preview" && result && (
            <PreviewStep
              result={result}
              onBack={() => setStep("details")}
              onContinue={() => {
                trackEvent("home_value_funnel", { step: "lead_open" });
                setStep("lead");
              }}
            />
          )}

          {step === "lead" && result && (
            <LeadCaptureStep
              name={leadName}
              email={leadEmail}
              phone={leadPhone}
              onChange={patchLead}
              onBack={() => setStep("preview")}
              onSubmit={submitLead}
              loading={leadLoading}
              error={leadError}
            />
          )}

          {step === "result" && result && <ResultStep result={result} onStartOver={startOver} />}
        </div>
      </div>

      <HomeValueFunnelSeo />
    </div>
  );
}
