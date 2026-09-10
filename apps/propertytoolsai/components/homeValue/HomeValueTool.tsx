"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import ToolPageScaffold from "@/components/layout/ToolPageScaffold";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import LeadCaptureModal from "@/components/LeadCaptureModal";
import HomeValueSection from "@/components/home-value/HomeValueSection";
import HomeValueTrustDisclaimer from "@/components/home-value/HomeValueTrustDisclaimer";
import { useAddressPrefill } from "@/hooks/useAddressPrefill";
import { trackEvent, trackHomeValueUsed, trackPropertyViewed } from "@/lib/tracking";
import {
  computeEngagementScore,
  crmIntentFromLikelyIntent,
  HIGH_VALUE_PROPERTY_THRESHOLD_USD,
  leadScoreBand,
} from "@/lib/homeValue/engagementScore";
import { fetchJson } from "@/lib/homeValue/fetchJson";
import { trackToolEvent } from "@/lib/homeValue/toolEventsClient";
import {
  buildClientIntentSignals,
  markCrossToolNavigationFromHomeValue,
} from "@/lib/homeValue/intentSignalsClient";
import {
  buildRefineSnapshot,
  canOpenFullReportGate,
  hasRefinedSinceBaseline,
  isUsefulEstimate,
  shouldShowSoftLeadPrompt,
} from "@/lib/homeValue/leadCapture";
import { compSupportLabel, formatEstimateCurrency } from "@/lib/homeValue/estimateDisplay";
import { deriveEstimateUiState } from "@/lib/homeValue/estimateUiState";
import {
  HOME_VALUE_ANALYTICS_EVENTS,
  trackHomeValueAnalytics,
  trackHomeValueToolEvent,
} from "@/lib/homeValue/homeValueTracking";
import type { LeadRecord } from "@/lib/leads/leadRecord";
import type {
  HomeValueEstimateResponse,
  PropertyCondition,
  RenovationLevel,
  UserIntent,
} from "@/lib/homeValue/types";

const HV_UNLOCK_KEY = "propertytoolsai:hv_report_unlocked";
const HV_SESSION_KEY = "propertytoolsai:hv_session_id";
const HV_SOFT_LEAD_DISMISS_KEY = "propertytoolsai:hv_soft_lead_banner_dismissed";
/** Flat path — same handler as `/api/home-value/estimate`; avoids HTML 404s in some dev/build setups. */
const API_ESTIMATE = "/api/home-value-estimate";

/** Row from GET /api/home-value/session (subset we hydrate). */
type HomeValueSessionRow = {
  full_address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size: number | null;
  property_type: string | null;
  condition: string | null;
  renovated_recently: boolean | null;
  likely_intent: string | null;
};

const CONDITIONS: PropertyCondition[] = ["poor", "fair", "average", "good", "excellent"];

function asCondition(v: string | null | undefined): PropertyCondition {
  if (v && CONDITIONS.includes(v as PropertyCondition)) return v as PropertyCondition;
  return "average";
}

function renovatedToLevel(r: boolean | null | undefined): RenovationLevel {
  if (r === true) return "cosmetic";
  return "none";
}

function asUserIntent(v: string | null | undefined): UserIntent | null {
  if (v === "seller" || v === "buyer" || v === "investor") return v;
  return null;
}

function effectiveUserIntent(
  selected: UserIntent | null,
  applied: UserIntent | undefined
): UserIntent {
  return selected ?? applied ?? "seller";
}

function readOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(HV_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(HV_SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function asCurrency(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "--";
  return formatEstimateCurrency(value);
}

function readUnlocked() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(HV_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function persistUnlocked() {
  try {
    sessionStorage.setItem(HV_UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}


export function HomeValueToolInner() {
  const searchParams = useSearchParams();
  const queryAddress = searchParams?.get("address");
  const { address, setAddress, saveSelectedAddress } = useAddressPrefill(queryAddress, {
    skipLocalStorage: true,
  });

  const [sessionId, setSessionId] = useState("");
  useEffect(() => {
    setSessionId(readOrCreateSessionId());
  }, []);

  const [placeMeta, setPlaceMeta] = useState<{
    city: string | null;
    state: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
  }>({ city: null, state: null, zip: null, lat: null, lng: null });

  const [beds, setBeds] = useState("3");
  const [baths, setBaths] = useState("2");
  const [sqft, setSqft] = useState("1800");
  const [lotSqft, setLotSqft] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [propertyType, setPropertyType] = useState("single family");
  const [condition, setCondition] = useState<PropertyCondition>("average");
  const [renovation, setRenovation] = useState<RenovationLevel>("none");
  /** null = auto (signal-based inference on the server). */
  const [userIntent, setUserIntent] = useState<UserIntent | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HomeValueEstimateResponse | null>(null);

  const [reportUnlocked, setReportUnlocked] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [phoneCaptured, setPhoneCaptured] = useState(false);
  const [clickedCma, setClickedCma] = useState(false);
  const [clickedExpert, setClickedExpert] = useState(false);
  const [phase, setPhase] = useState<"idle" | "ready">("idle");
  /** Live refine request in flight (debounced silent estimate). */
  const [refinePending, setRefinePending] = useState(false);

  /** After each API response, skip one debounced refine (avoids duplicate fetch). */
  const suppressRefineFromApi = useRef(false);
  const hvStartedOnce = useRef(false);
  const propertyDetailsAddr = useRef<string | null>(null);
  const softGateTracked = useRef(false);
  const prevRefinedTracked = useRef(false);
  /** First refine snapshot after a successful estimate — used to detect “user refined details”. */
  const [refineBaseline, setRefineBaseline] = useState<string | null>(null);

  const [softLeadBannerDismissed, setSoftLeadBannerDismissed] = useState(false);

  /** Prior visit with saved funnel row (GET /api/home-value/session hit a row). */
  const [returningVisitor, setReturningVisitor] = useState(false);
  /** Successful non-silent estimates this session (reset when property address changes). */
  const [estimateRunCount, setEstimateRunCount] = useState(0);

  useEffect(() => {
    setReportUnlocked(readUnlocked());
    try {
      setSoftLeadBannerDismissed(sessionStorage.getItem(HV_SOFT_LEAD_DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
    void trackEvent("tool_used", { tool: "home_value", phase: "page_load" });
  }, []);

  useEffect(() => {
    if (hvStartedOnce.current) return;
    hvStartedOnce.current = true;
    void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.HOME_VALUE_STARTED, {
      sessionId: sessionId || undefined,
      source: "tool_page",
    });
  }, [sessionId]);

  /** Restore form + estimate from Supabase when returning to the tab. */
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { res, data: json } = await fetchJson<{
          ok?: boolean;
          session?: HomeValueSessionRow | null;
        }>(`/api/home-value/session?session_id=${encodeURIComponent(sessionId)}`);
        if (cancelled || !res.ok || !json.ok || !json.session) return;
        setReturningVisitor(true);
        const s = json.session;
        setAddress(String(s.full_address ?? ""));
        setPlaceMeta({
          city: s.city ?? null,
          state: s.state ?? null,
          zip: s.zip ?? null,
          lat: s.lat != null ? Number(s.lat) : null,
          lng: s.lng != null ? Number(s.lng) : null,
        });
        if (s.beds != null) setBeds(String(s.beds));
        if (s.baths != null) setBaths(String(s.baths));
        if (s.sqft != null) setSqft(String(s.sqft));
        if (s.lot_size != null) setLotSqft(String(s.lot_size));
        if (s.year_built != null) setYearBuilt(String(s.year_built));
        if (s.property_type) setPropertyType(s.property_type);
        setCondition(asCondition(s.condition));
        setRenovation(renovatedToLevel(s.renovated_recently));
        const li = asUserIntent(s.likely_intent);
        if (li) setUserIntent(li);
        else setUserIntent(null);
        setPhase("ready");

        const addrHydrate = String(s.full_address ?? "").trim();
        const body = {
          address: addrHydrate,
          city: s.city ?? null,
          state: s.state ?? null,
          zip: s.zip ?? null,
          lat: s.lat != null ? Number(s.lat) : null,
          lng: s.lng != null ? Number(s.lng) : null,
          beds: s.beds != null ? Number(s.beds) : undefined,
          baths: s.baths != null ? Number(s.baths) : undefined,
          sqft: s.sqft != null ? Number(s.sqft) : undefined,
          lotSqft: s.lot_size != null ? Number(s.lot_size) : undefined,
          yearBuilt: s.year_built != null ? Number(s.year_built) : undefined,
          propertyType: s.property_type ?? undefined,
          condition: asCondition(s.condition),
          renovation: renovatedToLevel(s.renovated_recently),
          intent: asUserIntent(s.likely_intent) ?? undefined,
          intent_signals: buildClientIntentSignals({
            address: addrHydrate,
            reportUnlocked: readUnlocked(),
            clickedCma: false,
            clickedExpert: false,
          }),
          session_id: sessionId,
        };
        const { res: estRes, data: estJson } = await fetchJson<
          HomeValueEstimateResponse | { ok: false; error?: string }
        >(API_ESTIMATE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (cancelled || !estRes.ok || !("ok" in estJson) || estJson.ok !== true) return;
        suppressRefineFromApi.current = true;
        setResult(estJson);
        setEstimateRunCount(1);
        if (estJson.sessionId) {
          try {
            sessionStorage.setItem(HV_SESSION_KEY, estJson.sessionId);
            setSessionId(estJson.sessionId);
          } catch {
            /* ignore */
          }
        }
        void trackToolEvent(sessionId, "home_value", "session_hydrated", {
          has_estimate: Boolean(estJson.estimate?.point),
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const prevNormalizedAddressRef = useRef<string | null>(null);
  useEffect(() => {
    const addr = (result?.normalizedProperty?.address ?? "").trim();
    if (prevNormalizedAddressRef.current !== null && addr !== "" && prevNormalizedAddressRef.current !== addr) {
      setEstimateRunCount(0);
    }
    if (addr) prevNormalizedAddressRef.current = addr;
  }, [result?.normalizedProperty?.address]);

  const buildPayload = useCallback(() => {
    const b = Number(beds) || undefined;
    const ba = Number(baths) || undefined;
    const s = Number(sqft) || undefined;
    const lot = lotSqft.trim() ? Number(lotSqft) : undefined;
    const yb = yearBuilt.trim() ? Number(yearBuilt) : undefined;
    const intent_signals = buildClientIntentSignals({
      address: address.trim(),
      reportUnlocked,
      clickedCma,
      clickedExpert,
    });
    return {
      address: address.trim(),
      city: placeMeta.city,
      state: placeMeta.state,
      zip: placeMeta.zip,
      lat: placeMeta.lat,
      lng: placeMeta.lng,
      beds: b,
      baths: ba,
      sqft: s,
      lotSqft: lot && isFinite(lot) ? lot : undefined,
      yearBuilt: yb && isFinite(yb) ? yb : undefined,
      propertyType: propertyType || undefined,
      condition,
      renovation,
      intent: userIntent ?? undefined,
      intent_signals,
      session_id: sessionId || undefined,
    };
  }, [
    address,
    placeMeta,
    beds,
    baths,
    sqft,
    lotSqft,
    yearBuilt,
    propertyType,
    condition,
    renovation,
    userIntent,
    sessionId,
    reportUnlocked,
    clickedCma,
    clickedExpert,
  ]);

  const runEstimate = useCallback(
    async (opts?: { silent?: boolean }) => {
      const p = buildPayload();
      if (!p.address.trim()) {
        setError("Enter a property address.");
        return;
      }
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const { res, data: json } = await fetchJson<
          HomeValueEstimateResponse | { ok: false; error?: string }
        >(API_ESTIMATE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        if (!res.ok || !("ok" in json) || json.ok !== true) {
          throw new Error((json as { error?: string }).error ?? "Estimate failed");
        }
        if ("sessionId" in json && typeof (json as { sessionId?: string }).sessionId === "string") {
          try {
            const sid = (json as { sessionId: string }).sessionId;
            sessionStorage.setItem(HV_SESSION_KEY, sid);
            setSessionId(sid);
          } catch {
            /* ignore */
          }
        }
        suppressRefineFromApi.current = true;
        setResult(json);
        setPhase("ready");
        if (json.normalizedProperty) {
          const np = json.normalizedProperty;
          if (np.beds != null) setBeds(String(np.beds));
          if (np.baths != null) setBaths(String(np.baths));
          if (np.sqft != null) setSqft(String(np.sqft));
          if (np.lotSqft != null) setLotSqft(String(np.lotSqft));
          if (np.yearBuilt != null) setYearBuilt(String(np.yearBuilt));
          if (np.propertyType) setPropertyType(np.propertyType);
        }
        if (!opts?.silent) {
          setEstimateRunCount((c) => c + 1);
          void trackEvent("tool_used", { tool: "home_value", phase: "estimate_complete" });
          void trackToolEvent(p.session_id ?? sessionId, "home_value", "estimate_complete", {
            point: json.estimate?.point,
            confidence: json.confidence?.level,
          });
          const genMeta = {
            city: json.normalizedProperty?.city ?? placeMeta.city,
            state: json.normalizedProperty?.state ?? placeMeta.state,
            zip: json.normalizedProperty?.zip ?? placeMeta.zip,
            confidence: json.confidence?.level ?? null,
            likelyIntent: json.intentInference?.applied,
            sessionId: (p.session_id ?? sessionId) || undefined,
            pricedCompCount: json.comps?.pricedCount,
          };
          void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.ESTIMATE_GENERATED, genMeta);
          void trackHomeValueToolEvent(
            p.session_id ?? sessionId,
            HOME_VALUE_ANALYTICS_EVENTS.ESTIMATE_GENERATED,
            genMeta
          );
          const addr = p.address.trim();
          if (addr) void trackPropertyViewed({ address: addr, source: "home_value" });
          void trackHomeValueUsed({
            address: addr,
            beds: Number(p.beds) || undefined,
            sqft: Number(p.sqft) || undefined,
          });
          requestAnimationFrame(() => {
            document.getElementById("home-value-results")?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to estimate");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [buildPayload, sessionId, placeMeta]
  );

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phase !== "ready") return;
    if (suppressRefineFromApi.current) {
      suppressRefineFromApi.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void (async () => {
        setRefinePending(true);
        try {
          await runEstimate({ silent: true });
        } finally {
          setRefinePending(false);
        }
      })();
    }, 450);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [
    phase,
    beds,
    baths,
    sqft,
    lotSqft,
    yearBuilt,
    propertyType,
    condition,
    renovation,
    userIntent,
    runEstimate,
  ]);

  const estimate = result?.estimate ?? null;
  const confidence = result?.confidence ?? null;
  const showFullReport = reportUnlocked || !estimate;

  const refineSnapshot = useMemo(
    () =>
      buildRefineSnapshot({
        beds,
        baths,
        sqft,
        lotSqft,
        yearBuilt,
        propertyType,
        condition,
        renovation,
      }),
    [beds, baths, sqft, lotSqft, yearBuilt, propertyType, condition, renovation]
  );

  useEffect(() => {
    setRefineBaseline(null);
  }, [result?.normalizedProperty?.address]);

  useEffect(() => {
    if (!result?.estimate) setRefineBaseline(null);
  }, [result?.estimate]);

  useEffect(() => {
    if (!result?.estimate) return;
    setRefineBaseline((prev) => (prev == null ? refineSnapshot : prev));
  }, [result?.estimate, refineSnapshot]);

  const userRefinedDetails = hasRefinedSinceBaseline(refineBaseline, refineSnapshot);

  const showSoftLeadBanner = shouldShowSoftLeadPrompt({
    reportUnlocked,
    hasPreview: Boolean(result?.estimate?.point),
    useful: isUsefulEstimate(result),
    refined: userRefinedDetails,
    bannerDismissed: softLeadBannerDismissed,
  });

  const estimateUiState = useMemo(
    () =>
      deriveEstimateUiState({
        addressTrimmed: address.trim(),
        hasStructuredPlace: Boolean(
          (placeMeta.lat != null && placeMeta.lng != null) || (placeMeta.city && placeMeta.state)
        ),
        loading,
        refinePending,
        hasEstimate: Boolean(result?.estimate?.point),
        userRefined: userRefinedDetails,
        reportUnlocked,
        leadModalOpen,
        hasRecommendations: Boolean(result?.recommendations?.length),
      }),
    [
      address,
      placeMeta.lat,
      placeMeta.lng,
      placeMeta.city,
      placeMeta.state,
      loading,
      refinePending,
      result?.estimate?.point,
      result?.recommendations?.length,
      userRefinedDetails,
      reportUnlocked,
      leadModalOpen,
    ]
  );

  const appliedIntent = result?.intentInference?.applied;
  const leadIntent = useMemo(
    () => effectiveUserIntent(userIntent, appliedIntent),
    [userIntent, appliedIntent]
  );

  const trackingMeta = useCallback(
    () => ({
      city: placeMeta.city,
      state: placeMeta.state,
      zip: placeMeta.zip,
      confidence: result?.confidence?.level ?? null,
      likelyIntent: leadIntent,
      sessionId: sessionId || undefined,
      pricedCompCount: result?.comps?.pricedCount,
      estimateUiState,
    }),
    [
      placeMeta.city,
      placeMeta.state,
      placeMeta.zip,
      result?.confidence?.level,
      leadIntent,
      sessionId,
      result?.comps?.pricedCount,
      estimateUiState,
    ]
  );

  useEffect(() => {
    const addr = result?.normalizedProperty?.address?.trim();
    if (!addr || propertyDetailsAddr.current === addr) return;
    propertyDetailsAddr.current = addr;
    const m = {
      city: result?.normalizedProperty?.city ?? placeMeta.city,
      state: result?.normalizedProperty?.state ?? placeMeta.state,
      zip: result?.normalizedProperty?.zip ?? placeMeta.zip,
      sessionId: sessionId || undefined,
      confidence: result?.confidence?.level ?? null,
      likelyIntent: leadIntent,
      estimateUiState,
    };
    void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.PROPERTY_DETAILS_LOADED, m);
    void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.PROPERTY_DETAILS_LOADED, m);
  }, [
    result?.normalizedProperty?.address,
    result?.normalizedProperty?.city,
    result?.normalizedProperty?.state,
    result?.normalizedProperty?.zip,
    placeMeta.city,
    placeMeta.state,
    placeMeta.zip,
    sessionId,
    leadIntent,
    result?.confidence?.level,
    estimateUiState,
  ]);

  useEffect(() => {
    if (userRefinedDetails && !prevRefinedTracked.current) {
      prevRefinedTracked.current = true;
      const m = trackingMeta();
      void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.ESTIMATE_REFINED, m);
      void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.ESTIMATE_REFINED, m);
    }
    if (!userRefinedDetails) prevRefinedTracked.current = false;
  }, [userRefinedDetails, sessionId, trackingMeta]);

  useEffect(() => {
    if (!showSoftLeadBanner || softGateTracked.current) return;
    softGateTracked.current = true;
    const m = trackingMeta();
    void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.REPORT_GATE_SHOWN, m);
    void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.REPORT_GATE_SHOWN, m);
  }, [showSoftLeadBanner, sessionId, trackingMeta]);

  const openUnlock = () => {
    if (!canOpenFullReportGate(result)) return;
    void trackToolEvent(sessionId, "home_value", "report_gate_opened", {
      estimate_point: estimate?.point,
    });
    const m = trackingMeta();
    void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.REPORT_GATE_SHOWN, m);
    void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.REPORT_GATE_SHOWN, m);
    setLeadModalOpen(true);
  };

  const dismissSoftLeadBanner = useCallback(() => {
    setSoftLeadBannerDismissed(true);
    try {
      sessionStorage.setItem(HV_SOFT_LEAD_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const missingHint = useMemo(() => {
    const m = result?.normalizedProperty?.missingFields ?? [];
    if (!m.length) return null;
    return `Some details are missing — refine ${m.join(", ")} below for a tighter range.`;
  }, [result]);

  const repeatSession = returningVisitor || estimateRunCount > 1;

  const engagementScore = useMemo(() => {
    const missing = result?.normalizedProperty?.missingFields ?? [];
    const refinedDetails = missing.length === 0;
    const point = estimate?.point ?? 0;
    return computeEngagementScore({
      usedTool: Boolean(result?.estimate),
      refinedDetails,
      unlockedReport: reportUnlocked,
      phoneProvided: phoneCaptured,
      repeatSession,
      clickedCma,
      clickedExpert,
      highValueProperty: point >= HIGH_VALUE_PROPERTY_THRESHOLD_USD,
    });
  }, [
    result?.estimate,
    result?.normalizedProperty?.missingFields,
    reportUnlocked,
    phoneCaptured,
    repeatSession,
    clickedCma,
    clickedExpert,
    estimate?.point,
  ]);

  const engagementScoreBand = useMemo(() => leadScoreBand(engagementScore), [engagementScore]);

  return (
    <div data-estimate-ui-state={estimateUiState} className="contents">
      <ToolPageScaffold
        title="Home value estimate"
        subtitle="Not an appraisal — an automated estimate with a value range for informational use. Pick an address, refine details for a tighter band, then unlock the full breakdown when you’re ready."
        inputTitle="Property details"
        inputDescription="Address, intent, and home facts — refine for a tighter estimate."
        resultTitle="Estimate"
        resultDescription="Value range, confidence, and report (when unlocked)."
        inputContent={
            <div className="space-y-6">
              <HomeValueSection
                id="hv-section-1"
                title="1 · Hero & address"
                description="Search and select a property — we’ll load public and enriched details when available."
              >
                <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onBlur={() => {
                    const t = address.trim();
                    if (!t) return;
                    saveSelectedAddress({
                      formattedAddress: t,
                      lat: null,
                      lng: null,
                      placeId: null,
                      city: null,
                      state: null,
                      zip: null,
                    });
                  }}
                  onSelect={(val) => {
                    saveSelectedAddress({
                      formattedAddress: val.formattedAddress,
                      lat: val.lat,
                      lng: val.lng,
                      placeId: val.placeId ?? null,
                      city: val.city ?? null,
                      state: val.state ?? null,
                      zip: val.zip ?? null,
                    });
                    setPlaceMeta({
                      city: val.city ?? null,
                      state: val.state ?? null,
                      zip: val.zip ?? null,
                      lat: val.lat ?? null,
                      lng: val.lng ?? null,
                    });
                    void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.ADDRESS_SELECTED, {
                      city: val.city,
                      state: val.state,
                      zip: val.zip,
                      sessionId: sessionId || undefined,
                    });
                    void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.ADDRESS_SELECTED, {
                      city: val.city,
                      state: val.state,
                      zip: val.zip,
                    });
                    void runEstimate();
                  }}
                  wrapperClassName="w-full"
                  placeholder="Search for an address, city, or ZIP"
                />
                </div>
              </HomeValueSection>

              <HomeValueSection
                id="hv-section-intent"
                title="Intent"
                description="Helps tailor next steps (optional — auto-detect available)."
              >
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  I&apos;m mostly a…
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setUserIntent(null)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      userIntent === null
                        ? "border-[#0072ce] bg-[#0072ce]/10 text-[#005ca8]"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Auto (signals)
                  </button>
                  {(
                    [
                      ["seller", "Seller / owner"],
                      ["buyer", "Buyer"],
                      ["investor", "Investor"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setUserIntent(v)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        userIntent === v
                          ? "border-[#0072ce] bg-[#0072ce]/10 text-[#005ca8]"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {userIntent === null && result?.intentInference ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Inferred:{" "}
                    <span className="font-semibold capitalize">
                      {result.intentInference.likely === "unknown"
                        ? "general"
                        : result.intentInference.likely}
                    </span>{" "}
                    (seller {result.intentInference.scores.seller} · buyer{" "}
                    {result.intentInference.scores.buyer} · investor {result.intentInference.scores.investor})
                  </p>
                ) : null}
              </div>
              </HomeValueSection>

              <HomeValueSection
                id="hv-section-3"
                title="3 · Refine details"
                description="Live recalculation — rounded values reduce false precision."
              >
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-sm font-semibold text-slate-800">Refine (live recalc)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Beds</label>
                    <input
                      value={beds}
                      onChange={(e) => setBeds(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Baths</label>
                    <input
                      value={baths}
                      onChange={(e) => setBaths(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Sqft</label>
                    <input
                      value={sqft}
                      onChange={(e) => setSqft(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Lot (sqft)</label>
                    <input
                      value={lotSqft}
                      onChange={(e) => setLotSqft(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Year built</label>
                    <input
                      value={yearBuilt}
                      onChange={(e) => setYearBuilt(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Property type</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="single family">Single family</option>
                    <option value="condo">Condo / apartment</option>
                    <option value="townhouse">Townhouse</option>
                    <option value="multi-family">Multi-family</option>
                  </select>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Condition</label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as PropertyCondition)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="poor">Poor</option>
                      <option value="fair">Fair</option>
                      <option value="average">Average</option>
                      <option value="good">Good</option>
                      <option value="excellent">Excellent</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Renovations</label>
                    <select
                      value={renovation}
                      onChange={(e) => setRenovation(e.target.value as RenovationLevel)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="none">None recent</option>
                      <option value="cosmetic">Cosmetic</option>
                      <option value="major">Major</option>
                      <option value="full">Full / gut</option>
                    </select>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={loading}
                onClick={() => void runEstimate()}
              >
                {loading ? "Estimating…" : phase === "ready" ? "Recalculate now" : "Run estimate"}
              </Button>
              </HomeValueSection>
            </div>
        }
        resultContent={
          <div id="home-value-results" className="scroll-mt-4">
            {!estimate ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Select an address from suggestions or tap <strong>Run estimate</strong> after typing a full
                address. We&apos;ll pull comps when available and local median $/sqft.
              </div>
            ) : !showFullReport ? (
              <div className="space-y-6">
                <HomeValueSection
                  id="hv-section-2"
                  title="2 · Estimate preview"
                  description="Automated estimate — not an appraisal. Values rounded to the nearest $1,000."
                >
                {showSoftLeadBanner ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/90 p-3 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <p>
                      <span className="font-semibold">Save your estimate.</span> Unlock the full report for
                      adjustments, confidence detail, and next steps — name &amp; email required.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="cta" className="px-3 py-2 text-xs" onClick={openUnlock}>
                        Continue
                      </Button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={dismissSoftLeadBanner}
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                ) : null}
                {missingHint ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{missingHint}</p>
                ) : null}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Estimated value (not an appraisal)
                  </div>
                  <div className="mt-1 text-3xl font-bold text-blue-700">
                    {asCurrency(estimate.point)}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Estimated range {asCurrency(estimate.low)} – {asCurrency(estimate.high)}
                  </p>
                  {confidence ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-slate-700">
                        Confidence:{" "}
                        <span className="font-semibold capitalize">{confidence.level}</span> (
                        {confidence.score}/100) — how much we trust this band given data coverage.
                      </p>
                      <p className="text-xs text-slate-600">
                        {compSupportLabel(result?.comps?.pricedCount ?? 0, result?.comps?.totalConsidered ?? 0)}
                      </p>
                      {confidence.explanation ? (
                        <p className="text-xs text-slate-600">{confidence.explanation}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <HomeValueTrustDisclaimer />
                  </div>
                </div>
                </HomeValueSection>

                <HomeValueSection
                  id="hv-section-4"
                  title="4 · Report gate"
                  description="Full adjustment list and detail require a quick unlock."
                >
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="pointer-events-none select-none blur-sm opacity-60" aria-hidden>
                    <p className="text-sm text-slate-700">{estimate.summary}</p>
                    <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
                      {estimate.adjustments.slice(0, 6).map((a) => (
                        <li key={a.key}>
                          {a.label}: ×{a.multiplier.toFixed(3)}
                        </li>
                      ))}
                    </ul>
                    {result?.market ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Market: {result.market.city}, {result.market.state} ({result.market.trend})
                      </p>
                    ) : null}
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-white/60" />
                </div>

                <Button className="w-full" variant="cta" type="button" onClick={openUnlock}>
                  Unlock full report
                </Button>
                </HomeValueSection>
              </div>
            ) : (
              <div className="space-y-6">
                <HomeValueSection
                  id="hv-section-5"
                  title="5 · Detailed report"
                  description="Unlocked breakdown — still an estimate, not an appraisal."
                >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Estimated value (not an appraisal)
                  </div>
                  <div className="mt-1 text-3xl font-bold text-blue-700">
                    {asCurrency(estimate.point)}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Estimated range {asCurrency(estimate.low)} – {asCurrency(estimate.high)}
                  </p>
                </div>
                {confidence ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
                    <p>
                      <span className="font-semibold">Confidence</span> {confidence.level} ({confidence.score}
                      /100) — model trust given address, details, and comps.
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {compSupportLabel(result?.comps?.pricedCount ?? 0, result?.comps?.totalConsidered ?? 0)}
                    </p>
                    {confidence.explanation ? (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{confidence.explanation}</p>
                    ) : null}
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {confidence.factors.slice(0, 5).map((f) => (
                        <li key={f.key}>
                          {f.label} ({f.impact > 0 ? "+" : ""}
                          {f.impact})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <HomeValueTrustDisclaimer />
                <p className="text-xs text-slate-500">
                  Lead score:{" "}
                  <span className="font-semibold capitalize">{engagementScoreBand}</span> ({engagementScore}
                  /100)
                </p>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Adjustments</p>
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                    {estimate.adjustments.map((a) => (
                      <li key={a.key}>
                        {a.label}: ×{a.multiplier.toFixed(3)}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-slate-700">{estimate.summary}</p>
                </HomeValueSection>
                {result?.recommendations?.length ? (
                  <HomeValueSection
                    id="hv-section-6"
                    title="6 · Recommendations & next steps"
                    description="Tools matched to your intent — not a guarantee of outcomes."
                  >
                    <ul className="mt-2 space-y-2">
                      {result.recommendations.map((r) => (
                        <li key={r.href}>
                          <Link
                            href={r.href}
                            className="font-semibold text-[#0072ce] underline-offset-2 hover:underline"
                            onClick={() => {
                              const t = r.title.toLowerCase();
                              const h = r.href.toLowerCase();
                              if (h.includes("smart-cma") || t.includes("cma")) {
                                setClickedCma(true);
                                void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.CMA_CLICKED, {
                                  ...trackingMeta(),
                                  recommendationTitle: r.title,
                                  href: r.href,
                                });
                                void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.CMA_CLICKED, {
                                  href: r.href,
                                });
                              }
                              if (h.includes("/pricing") || t.includes("expert")) {
                                setClickedExpert(true);
                                void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.EXPERT_CTA_CLICKED, {
                                  ...trackingMeta(),
                                  href: r.href,
                                });
                                void trackHomeValueToolEvent(
                                  sessionId,
                                  HOME_VALUE_ANALYTICS_EVENTS.EXPERT_CTA_CLICKED,
                                  { href: r.href }
                                );
                              }
                              void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.RECOMMENDATION_CLICKED, {
                                ...trackingMeta(),
                                recommendationTitle: r.title,
                                recommendationHref: r.href,
                              });
                              void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.RECOMMENDATION_CLICKED, {
                                recommendationTitle: r.title,
                                href: r.href,
                              });
                              if (h.includes("mortgage-calculator")) markCrossToolNavigationFromHomeValue("mortgage");
                              if (h.includes("ai-property-comparison"))
                                markCrossToolNavigationFromHomeValue("comparison");
                              if (h.includes("rental-property-analyzer") || h.includes("cap-rate-calculator"))
                                markCrossToolNavigationFromHomeValue("rent_roi_cap");
                            }}
                          >
                            {r.title}
                          </Link>
                          <span className="text-slate-600"> — {r.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </HomeValueSection>
                ) : null}
                <HomeValueSection
                  id="hv-section-7"
                  title="7 · Expert help"
                  description="Optional human support — separate from the automated estimate."
                >
                  <p className="text-sm text-slate-600">
                    Want a licensed pro to review this band? Explore{" "}
                    <Link
                      href="/pricing"
                      className="font-semibold text-[#0072ce] underline-offset-2 hover:underline"
                      onClick={() => {
                        setClickedExpert(true);
                        void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.EXPERT_CTA_CLICKED, {
                          ...trackingMeta(),
                          href: "/pricing",
                        });
                        void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.EXPERT_CTA_CLICKED, {
                          href: "/pricing",
                        });
                      }}
                    >
                      expert match &amp; tools
                    </Link>
                    .
                  </p>
                </HomeValueSection>
              </div>
            )}
          </div>
        }
      />

      <LeadCaptureModal
        open={leadModalOpen}
        onOpenChange={setLeadModalOpen}
        source="home_value_estimator"
        tool="home_value_estimator"
        intent={crmIntentFromLikelyIntent(leadIntent)}
        propertyAddress={address.trim()}
        sessionId={sessionId}
        captureExtras="home_value"
        geo={{
          city: placeMeta.city,
          state: placeMeta.state,
          zip: placeMeta.zip,
        }}
        title="Unlock full report"
        subtitle="Get adjustment detail, confidence factors, and next steps. Leads use source home_value_estimator and route to CloseBoss."
        customSubmit={async ({ name, email, phone, timeline, buyingOrSelling }) => {
          const phoneTrim = phone.trim();
          const missing = result?.normalizedProperty?.missingFields ?? [];
          const eng = computeEngagementScore({
            usedTool: Boolean(result?.estimate),
            refinedDetails: missing.length === 0,
            unlockedReport: true,
            phoneProvided: Boolean(phoneTrim),
            repeatSession,
            clickedCma,
            clickedExpert,
            highValueProperty: (estimate?.point ?? 0) >= HIGH_VALUE_PROPERTY_THRESHOLD_USD,
          });
          const engBand = leadScoreBand(eng);
          try {
            const { res, data: json } = await fetchJson<{
              ok?: boolean;
              error?: string;
              leadId?: string;
              leadRecord?: LeadRecord;
            }>("/api/home-value/unlock-report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                email,
                phone: phoneTrim || undefined,
                timeline: timeline?.trim() || undefined,
                buying_or_selling: buyingOrSelling?.trim() || undefined,
                source: "home_value_estimator",
                tool: "home_value_estimator",
                intent: crmIntentFromLikelyIntent(leadIntent),
                property_address: address.trim(),
                session_id: sessionId,
                full_address: address.trim(),
                city: placeMeta.city ?? undefined,
                state: placeMeta.state ?? undefined,
                zip: placeMeta.zip ?? undefined,
                property_value: estimate?.point,
                confidence_score: confidence?.score,
                engagement_score: eng,
                estimate_low: estimate?.low,
                estimate_high: estimate?.high,
                confidence: confidence?.level,
                likely_intent: leadIntent,
                metadata: {
                  engagement: "full_report_unlock",
                  likely_intent: leadIntent,
                  inferred_intent: result?.intentInference?.likely ?? leadIntent,
                  estimate_low: estimate?.low,
                  estimate_high: estimate?.high,
                  confidence_level: confidence?.level,
                  comps_priced: result?.comps.pricedCount,
                  market_source: result?.market?.source,
                  leadsmart_ready: true,
                  lead_score_band: engBand,
                  engagement_score_band: engBand,
                },
              }),
            });
            if (!res.ok || !json.ok) {
              return { ok: false, error: json.error ?? "Failed to unlock report" };
            }
            return { ok: true as const, leadId: json.leadId };
          } catch (e) {
            return {
              ok: false,
              error: e instanceof Error ? e.message : "Failed to unlock report",
            };
          }
        }}
        onSuccess={({ phoneProvided }) => {
          persistUnlocked();
          setReportUnlocked(true);
          if (phoneProvided) setPhoneCaptured(true);
          const m = {
            city: placeMeta.city,
            state: placeMeta.state,
            zip: placeMeta.zip,
            confidence: confidence?.level ?? null,
            likelyIntent: leadIntent,
            sessionId: sessionId || undefined,
            phoneProvided,
          };
          void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.LEAD_SUBMITTED, m);
          void trackHomeValueAnalytics(HOME_VALUE_ANALYTICS_EVENTS.REPORT_UNLOCKED, m);
          void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.LEAD_SUBMITTED, m);
          void trackHomeValueToolEvent(sessionId, HOME_VALUE_ANALYTICS_EVENTS.REPORT_UNLOCKED, m);
        }}
      />
    </div>
  );
}

export default function HomeValueTool() {
  return (
    <Suspense fallback={<div className="min-h-[240px]" aria-hidden />}>
      <HomeValueToolInner />
    </Suspense>
  );
}
