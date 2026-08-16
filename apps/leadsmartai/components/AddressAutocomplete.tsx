"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type AddressAutocompleteValue = {
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  /**
   * Parsed `address_components` so callers don't have to ask for separate
   * city/state/zip inputs. State uses the 2-letter short_name. Any field
   * that Google didn't return for the chosen Place comes back null.
   */
  components: {
    streetNumber: string | null;
    streetName: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSelect?: (val: AddressAutocompleteValue) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

let loadPlacesPromise: Promise<google.maps.PlacesLibrary> | null = null;
let loadPlacesKey: string | null = null;

/**
 * Loads the Places library using the @googlemaps/js-api-loader v2
 * functional API. Cached per-key so multiple autocompletes on the same
 * page share one network round-trip.
 */
function loadPlacesLibrary(apiKey: string): Promise<google.maps.PlacesLibrary> {
  if (typeof window === "undefined") {
    return Promise.resolve({} as google.maps.PlacesLibrary);
  }
  if (loadPlacesPromise && loadPlacesKey === apiKey) return loadPlacesPromise;
  loadPlacesKey = apiKey;
  setOptions({ key: apiKey, v: "weekly", libraries: ["places"] });
  loadPlacesPromise = importLibrary("places") as Promise<google.maps.PlacesLibrary>;
  return loadPlacesPromise;
}

/**
 * Extract a value from the new Places API's `addressComponents` array
 * by component type (e.g. "locality", "postal_code"). The new API
 * exposes `longText` / `shortText` (instead of legacy `long_name` /
 * `short_name`).
 */
function pickComponent(
  components: google.maps.places.AddressComponent[],
  type: string,
  preferShort = false,
): string | null {
  const found = components.find((c) => c.types.includes(type));
  if (!found) return null;
  const value = preferShort ? found.shortText : found.longText;
  return value?.trim() || null;
}

/** Normalize for comparing Google vs React-controlled value. */
function normAddr(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

type Prediction = {
  placeId: string;
  primary: string;
  secondary: string;
  description: string;
  suggestion: google.maps.places.AutocompleteSuggestion;
};

const DEBOUNCE_MS = 180;

/**
 * Real-estate-friendly equivalent of the legacy `types: ["address"]`
 * filter. The new Places API doesn't accept `address` as a primary
 * type, so we explicitly include the address-y types.
 */
const INCLUDED_PRIMARY_TYPES = [
  "street_address",
  "subpremise",
  "route",
  "locality",
  "postal_code",
];

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "123 Main St, City, State",
  className,
  disabled,
}: Props) {
  const { t } = useTranslation("dashboard");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** When set, we just applied this normalized string from a suggestion — don't re-fetch/reopen the dropdown. Cleared when the user types. */
  const committedSelectionRef = useRef<string | null>(null);
  /** Block prediction fetch briefly after a pick (handles Strict Mode + async getDetails). */
  const suppressUntilMsRef = useRef(0);
  /** Session token for predictions+details billing pairing (Google recommendation). */
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  /** Sequence guard so an in-flight stale request can't overwrite newer predictions. */
  const requestSeqRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [placesReady, setPlacesReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const ready = useMemo(() => Boolean(apiKey), [apiKey]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setPlacesReady(false);
    setErrorMsg(null);
    (async () => {
      try {
        await loadPlacesLibrary(apiKey);
        if (!cancelled) setPlacesReady(true);
      } catch (e) {
        console.error("Failed to load Google Places:", e);
        if (!cancelled) {
          setErrorMsg("Could not load Google Maps. Check API key & Maps JavaScript API.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, ready]);

  useEffect(() => {
    if (!ready || disabled || !placesReady) return;

    const query = value.trim();
    if (query.length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }

    if (Date.now() < suppressUntilMsRef.current) {
      setPredictions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const nq = normAddr(query);
    if (committedSelectionRef.current !== null && nq === committedSelectionRef.current) {
      setPredictions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const t = setTimeout(() => {
      void fetchPredictions(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ready, disabled, placesReady]);

  async function fetchPredictions(query: string) {
    const token =
      sessionTokenRef.current ?? new google.maps.places.AutocompleteSessionToken();
    sessionTokenRef.current = token;

    const seq = ++requestSeqRef.current;
    setLoading(true);

    try {
      const { suggestions } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedPrimaryTypes: INCLUDED_PRIMARY_TYPES,
          includedRegionCodes: ["us"],
          sessionToken: token,
        });

      if (seq !== requestSeqRef.current) return;

      const items: Prediction[] = suggestions
        .filter((s) => s.placePrediction != null)
        .map((s) => {
          const p = s.placePrediction!;
          const primary = p.mainText?.text ?? p.text?.text ?? "";
          const secondary = p.secondaryText?.text ?? "";
          return {
            placeId: p.placeId,
            primary,
            secondary,
            description: p.text?.text ?? `${primary}${secondary ? ", " + secondary : ""}`,
            suggestion: s,
          };
        });

      setLoading(false);
      setPredictions(items);
      setActiveIndex(items.length > 0 ? 0 : -1);
      setOpen(items.length > 0);
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      setLoading(false);
      setPredictions([]);
      setActiveIndex(-1);
      setOpen(false);

      const message = e instanceof Error ? e.message : String(e);
      if (process.env.NODE_ENV === "development") {
        console.warn("[AddressAutocomplete] fetchAutocompleteSuggestions failed:", e);
      }
      const lower = message.toLowerCase();
      if (
        lower.includes("denied") ||
        lower.includes("api key") ||
        lower.includes("referer") ||
        lower.includes("not authorized")
      ) {
        setErrorMsg(
          "Places request denied — check that the Maps JavaScript API + Places API (New) are enabled, billing is active, and HTTP referrers include this origin.",
        );
      }
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function newSessionToken() {
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
  }

  async function selectPrediction(prediction: Prediction) {
    setOpen(false);
    setPredictions([]);
    setActiveIndex(-1);

    const optimistic = prediction.description;
    committedSelectionRef.current = normAddr(optimistic);
    suppressUntilMsRef.current = Date.now() + 2800;
    onChange(optimistic);

    const placePrediction = prediction.suggestion.placePrediction;
    if (!placePrediction) {
      newSessionToken();
      onSelect?.({
        formattedAddress: optimistic,
        lat: null,
        lng: null,
        components: {
          streetNumber: null,
          streetName: null,
          city: null,
          state: null,
          zip: null,
        },
      });
      return;
    }

    try {
      const place = placePrediction.toPlace();
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location", "addressComponents", "id"],
      });

      newSessionToken();

      const formatted = place.formattedAddress ?? optimistic;
      const lat = place.location?.lat() ?? null;
      const lng = place.location?.lng() ?? null;
      const ac = place.addressComponents ?? [];

      const components = {
        streetNumber: pickComponent(ac, "street_number"),
        streetName: pickComponent(ac, "route"),
        city:
          pickComponent(ac, "locality") ??
          pickComponent(ac, "sublocality_level_1") ??
          pickComponent(ac, "sublocality"),
        // 2-letter abbreviation for US states ("CA")
        state: pickComponent(ac, "administrative_area_level_1", true),
        zip: pickComponent(ac, "postal_code"),
      };

      committedSelectionRef.current = normAddr(formatted);
      onChange(formatted);
      onSelect?.({ formattedAddress: formatted, lat, lng, components });
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[AddressAutocomplete] place.fetchFields failed:", e);
      }
      newSessionToken();
      committedSelectionRef.current = normAddr(optimistic);
      onSelect?.({
        formattedAddress: optimistic,
        lat: null,
        lng: null,
        components: {
          streetNumber: null,
          streetName: null,
          city: null,
          state: null,
          zip: null,
        },
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % predictions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + predictions.length) % predictions.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = predictions[activeIndex] ?? predictions[0];
      if (sel) void selectPrediction(sel);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          committedSelectionRef.current = null;
          suppressUntilMsRef.current = 0;
          onChange(e.target.value);
        }}
        onFocus={() => {
          if (predictions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        aria-autocomplete="list"
        aria-expanded={open}
        role="combobox"
      />

      {errorMsg ? (
        <p className="mt-1 text-[11px] text-red-700" role="alert">
          {errorMsg}
        </p>
      ) : null}

      {open && predictions.length > 0 ? (
        <div
          className="absolute left-0 right-0 z-[9999] mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          {predictions.map((p, idx) => (
            <button
              key={p.placeId}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void selectPrediction(p)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                idx === activeIndex ? "bg-sky-50" : "hover:bg-slate-50"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900">{p.primary}</span>
                {p.secondary ? (
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {p.secondary}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
          <div className="border-t border-slate-100 px-3 py-1 text-[10px] text-slate-400">{t("pages.misc.poweredByGoogle")}</div>
        </div>
      ) : null}
    </div>
  );
}
