"use client";

import { useEffect, useMemo, useState } from "react";
import { getHomeValueHistory, saveHomeValueHistory, type HomeValueHistoryItem } from "./history";
import type {
  AddressSelection,
  EstimateDetails,
  EstimateRequest,
  EstimateResponse,
  EstimateUiState,
  LeadForm,
  SessionResponse,
  UnlockReportResponse,
} from "./types";

function generateSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Math.random().toString(36).slice(2, 11)}`;
}

const HV_SESSION_KEY = "propertytoolsai:hv_session_id";
const LEGACY_SESSION_STORAGE_KEY = "home_value_session_id";

export function readOrCreateHomeValueSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(HV_SESSION_KEY);
    if (!id) id = localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (!id) id = generateSessionId();
    sessionStorage.setItem(HV_SESSION_KEY, id);
    localStorage.setItem(LEGACY_SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return generateSessionId();
  }
}

export function dbPropertyTypeToHomeValueUi(t: string | null | undefined): EstimateDetails["propertyType"] | undefined {
  if (!t || !String(t).trim()) return undefined;
  const x = String(t).toLowerCase();
  if (/condo|apartment|coop/.test(x)) return "condo";
  if (/town|row/.test(x)) return "townhome";
  if (/multi|duplex|triplex|fourplex/.test(x)) return "multi_family";
  return "single_family";
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  // Read as text first: a gateway timeout or a crashed function answers in
  // plain text, and `res.json()` on that surfaces the parser's complaint
  // ("Unexpected token 'A'…") as if it were the estimate's error.
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (json === null) {
    throw new Error(
      res.status === 504 || res.status === 408
        ? "The estimate took longer than expected. Please try again in a moment."
        : "We couldn't reach the estimate service. Please try again.",
    );
  }
  if (!res.ok || json?.success === false) {
    // The estimate API returns ineligible responses as
    // `{ success: false, status: "ineligible", reason, message }` —
    // the helpful copy lives in `message`, not `error`. Fall through
    // to `message` before the generic "Request failed" so users see
    // "We found this address but don't have enough property details
    // …" instead of a useless red banner.
    throw new Error(json?.error || json?.message || "Request failed");
  }
  return json as T;
}

function parseTypedAddress(input: string): AddressSelection | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    const street = parts[0];
    const city = parts[1];
    const stateZip = parts[2].split(/\s+/).filter(Boolean);

    return {
      fullAddress: trimmed,
      street,
      city,
      state: stateZip[0] || "CA",
      zip: stateZip[1] || "",
    };
  }

  return {
    fullAddress: trimmed,
    street: trimmed,
    city: "Unknown",
    state: "CA",
    zip: "",
  };
}

async function reverseGeocodeCurrentLocation(lat: number, lng: number): Promise<AddressSelection> {
  const url = new URL("/api/address/reverse", window.location.origin);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const json = await res.json();
  if (!res.ok || !json?.address) {
    throw new Error(json?.error || "Failed to reverse geocode location");
  }
  return json.address as AddressSelection;
}

export function useHomeValueEstimate() {
  const [uiState, setUiState] = useState<EstimateUiState>("idle");
  const [error, setError] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [address, setAddress] = useState<AddressSelection | null>(null);
  const [pendingAddress, setPendingAddress] = useState<AddressSelection | null>(null);
  const [details, setDetails] = useState<EstimateDetails>({
    propertyType: "single_family",
    condition: "good",
  });
  const [estimateResult, setEstimateResult] = useState<EstimateResponse | null>(null);
  const [unlockResult, setUnlockResult] = useState<UnlockReportResponse | null>(null);
  const [leadForm, setLeadForm] = useState<LeadForm>({
    name: "",
    email: "",
    phone: "",
  });
  const [history, setHistory] = useState<HomeValueHistoryItem[]>([]);

  useEffect(() => {
    setHistory(getHomeValueHistory());
    const nextSessionId = readOrCreateHomeValueSessionId();
    setSessionId(nextSessionId);

    void (async () => {
      try {
        const data = await apiRequest<SessionResponse>(
          `/api/home-value/session?sessionId=${encodeURIComponent(nextSessionId)}`,
          { method: "GET" }
        );

        if (data?.session?.address?.fullAddress) {
          setAddress(data.session.address);
          setAddressInput(data.session.address.fullAddress);
          setDetails((prev) => ({ ...prev, ...(data.session.details ?? {}) }));

          if (data.session.estimate) {
            setEstimateResult({
              success: true,
              sessionId: data.session.sessionId,
              property: {
                fullAddress: data.session.address.fullAddress,
                city: data.session.address.city,
                state: data.session.address.state,
                zip: data.session.address.zip,
                lat: data.session.address.lat ?? 0,
                lng: data.session.address.lng ?? 0,
                beds: data.session.details?.beds,
                baths: data.session.details?.baths,
                sqft: data.session.details?.sqft,
                yearBuilt: data.session.details?.yearBuilt,
                lotSize: data.session.details?.lotSize,
                propertyType: data.session.details?.propertyType,
              },
              estimate: data.session.estimate,
              supportingData: { medianPpsf: 0 },
              comps: data.comps ?? [],
              recommendations: {},
            });
            setUiState("preview_ready");
          }
        }
      } catch {
        // ignore missing session
      }
    })();
  }, []);

  async function runEstimate(nextAddress?: AddressSelection, nextDetails?: EstimateDetails) {
    try {
      setError("");
      setUnlockError(null);
      setUiState(estimateResult ? "refining" : "estimating");

      const payload: EstimateRequest = {
        sessionId,
        address: nextAddress ?? address!,
        details: nextDetails ?? details,
        source: "tool_page",
      };

      const result = await apiRequest<EstimateResponse>("/api/home-value/estimate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setEstimateResult(result);

      // Back-fill details with enriched property data from the pipeline
      // so the RefinementForm shows actual values instead of empty fields.
      // Always overwrite empty/undefined fields; preserve user-typed values.
      const p = result.property;
      setDetails((prev) => ({
        ...prev,
        beds: prev.beds ?? p.beds,
        baths: prev.baths ?? p.baths,
        sqft: prev.sqft ?? p.sqft,
        yearBuilt: prev.yearBuilt ?? p.yearBuilt,
        lotSize: prev.lotSize ?? p.lotSize,
        ...(p.propertyType != null ? { propertyType: p.propertyType as EstimateDetails["propertyType"] } : {}),
      }));

      const historyAddress = nextAddress ?? address;
      if (historyAddress) {
        const item = {
          sessionId,
          address: historyAddress,
          savedAt: new Date().toISOString(),
          estimateValue: result.estimate.value,
          rangeLow: result.estimate.rangeLow,
          rangeHigh: result.estimate.rangeHigh,
          confidence: result.estimate.confidence,
        };

        saveHomeValueHistory(item);
        setHistory(getHomeValueHistory());
      }
      setUiState("report_locked");
    } catch (err) {
      setUiState("error");
      setError(err instanceof Error ? err.message : "Failed to generate estimate");
    }
  }

  function prepareAddressSelection(selectedAddress: AddressSelection) {
    setPendingAddress({
      ...selectedAddress,
    });
    setAddressInput(selectedAddress.fullAddress);
    setUiState("address_selected");
  }

  async function confirmSelectedAddress(addressToConfirm?: AddressSelection) {
    const finalAddress = addressToConfirm ?? pendingAddress;
    if (!finalAddress) return;

    /**
     * Reset details when the address changes so the pipeline uses
     * fresh data from Rentcast/warehouse instead of stale values
     * from the previous address. Keep only user-set preferences
     * (condition) that are property-agnostic.
     */
    const isNewAddress =
      !address || address.fullAddress !== finalAddress.fullAddress;
    const freshDetails: EstimateDetails = isNewAddress
      ? { condition: details.condition }
      : details;

    if (isNewAddress) {
      setDetails(freshDetails);
    }

    setAddress(finalAddress);
    setPendingAddress(null);
    await runEstimate(finalAddress, freshDetails);
  }

  function clearPendingAddress() {
    setPendingAddress(null);
  }

  async function startEstimateFromTypedInput() {
    const parsed = parseTypedAddress(addressInput);
    if (!parsed) {
      setError("Please enter a valid address.");
      setUiState("error");
      return;
    }

    setError("");
    await confirmSelectedAddress(parsed);
  }

  async function useMyLocation() {
    try {
      setError("");

      if (!("geolocation" in navigator)) {
        throw new Error("Geolocation is not supported in this browser");
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      const selected = await reverseGeocodeCurrentLocation(lat, lng);

      setPendingAddress(selected);
      setAddressInput(selected.fullAddress);
      setUiState("address_selected");
    } catch (err) {
      setUiState("error");
      setError(err instanceof Error ? err.message : "Failed to use your location");
    }
  }

  async function unlockReport() {
    try {
      setError("");
      setUnlockError(null);
      setUiState("unlocking");

      const result = await apiRequest<UnlockReportResponse>("/api/home-value/unlock-report", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          name: leadForm.name,
          email: leadForm.email,
          phone: leadForm.phone,
          // Pass estimate data so the API doesn't need a session row
          property_address: estimateResult?.property.fullAddress ?? address?.fullAddress ?? "",
          city: estimateResult?.property.city ?? address?.city ?? "",
          zip: estimateResult?.property.zip ?? address?.zip ?? "",
          estimate_value: estimateResult?.estimate.value ?? 0,
          range_low: estimateResult?.estimate.rangeLow ?? 0,
          range_high: estimateResult?.estimate.rangeHigh ?? 0,
          confidence: estimateResult?.estimate.confidence ?? "low",
          confidence_score: estimateResult?.estimate.confidenceScore ?? 0,
          median_ppsf: estimateResult?.supportingData.medianPpsf ?? 0,
          recommendations: estimateResult?.recommendations ?? {},
        }),
      });

      setUnlockResult(result);
      setUiState("report_unlocked");
    } catch (err) {
      setUiState("report_locked");
      setUnlockError(err instanceof Error ? err.message : "Failed to unlock report");
    }
  }

  async function restoreFromHistory(sessionIdToLoad: string) {
    try {
      setError("");
      const data = await apiRequest<SessionResponse>(
        `/api/home-value/session?sessionId=${encodeURIComponent(sessionIdToLoad)}`,
        { method: "GET" }
      );

      if (data?.session?.address) {
        setAddress(data.session.address);
        setAddressInput(data.session.address.fullAddress);
        setDetails((prev) => ({ ...prev, ...(data.session.details ?? {}) }));

        if (data.session.estimate) {
          setEstimateResult({
            success: true,
            sessionId: data.session.sessionId,
            property: {
              fullAddress: data.session.address.fullAddress,
              city: data.session.address.city,
              state: data.session.address.state,
              zip: data.session.address.zip,
              lat: data.session.address.lat ?? 0,
              lng: data.session.address.lng ?? 0,
              beds: data.session.details?.beds,
              baths: data.session.details?.baths,
              sqft: data.session.details?.sqft,
              yearBuilt: data.session.details?.yearBuilt,
              lotSize: data.session.details?.lotSize,
              propertyType: data.session.details?.propertyType,
            },
            estimate: data.session.estimate,
            supportingData: { medianPpsf: 0 },
            comps: data.comps ?? [],
            recommendations: {},
          });
          setUiState("preview_ready");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore session");
      setUiState("error");
    }
  }

  function refreshHistory() {
    setHistory(getHomeValueHistory());
  }


  async function startEstimate(selectedAddress: AddressSelection) {
    prepareAddressSelection(selectedAddress);
    await confirmSelectedAddress(selectedAddress);
  }

  const busyHero = uiState === "estimating" && !estimateResult;
  const busyRefine = uiState === "estimating" || uiState === "refining";

  return {
    uiState,
    error,
    unlockError,
    addressInput,
    setAddressInput,
    address,
    pendingAddress,
    details,
    setDetails,
    estimateResult,
    unlockResult,
    leadForm,
    setLeadForm,
    startEstimate,
    prepareAddressSelection,
    confirmSelectedAddress,
    clearPendingAddress,
    startEstimateFromTypedInput,
    useMyLocation,
    runEstimate,
    unlockReport,
    restoreFromHistory,
    refreshHistory,
    busyHero,
    busyRefine,
    history,
  };
}
