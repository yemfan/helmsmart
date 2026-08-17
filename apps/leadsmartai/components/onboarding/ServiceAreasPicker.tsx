"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  countiesForState,
  US_STATES,
} from "@/lib/geo/usStatesCounties";
import {
  serviceAreaKey,
  serviceAreaLabel,
  type AgentServiceArea,
} from "@/lib/geo/serviceArea";

/**
 * Cascading State → County → City picker with an "all cities in this county"
 * escape hatch. Renders a controlled tag list and a single-row Add form.
 *
 * City is free-text rather than a dropdown: a bundled 19k-city dataset would
 * bloat the JS payload, and agents routinely serve cities too small to be in
 * any national list. The matcher downstream does case-insensitive comparison,
 * so typed names like "alhambra" / "Alhambra" / "ALHAMBRA" all match.
 */
export function ServiceAreasPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: readonly AgentServiceArea[];
  onChange: (next: AgentServiceArea[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [state, setState] = useState<string>("");
  const [county, setCounty] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [allCities, setAllCities] = useState(false);

  const counties = useMemo(() => (state ? countiesForState(state) : []), [state]);

  const canAdd =
    Boolean(state) && Boolean(county) && (allCities || city.trim().length > 0);

  function handleStateChange(next: string) {
    setState(next);
    setCounty("");
    setCity("");
    setAllCities(false);
  }

  function handleAllCitiesToggle(next: boolean) {
    setAllCities(next);
    if (next) setCity("");
  }

  function add() {
    if (!canAdd) return;
    const entry: AgentServiceArea = {
      state,
      county,
      city: allCities ? null : city.trim(),
    };
    const key = serviceAreaKey(entry);
    if (value.some((v) => serviceAreaKey(v) === key)) {
      // Already in list — just reset without dupe.
      resetForm();
      return;
    }
    onChange([...value, entry]);
    resetForm();
  }

  function resetForm() {
    setCity("");
    setAllCities(false);
    // Keep state + county selected so the agent can add adjacent cities fast.
  }

  function remove(key: string) {
    onChange(value.filter((v) => serviceAreaKey(v) !== key));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
          <span>{t("pages.serviceAreas.state")}</span>
          <select
            value={state}
            onChange={(e) => handleStateChange(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-gray-50"
          >
            <option value="">Select state…</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
          <span>{t("pages.serviceAreas.county")}</span>
          <select
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            disabled={disabled || !state}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">{state ? "Select county…" : "Pick a state first"}</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={allCities}
            onChange={(e) => handleAllCitiesToggle(e.target.checked)}
            disabled={disabled || !county}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className={county ? "" : "text-gray-400"}>{t("pages.serviceAreas.allCities")}</span>
        </label>

        {!allCities ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            <span>{t("pages.serviceAreas.city")}</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              disabled={disabled || !county}
              placeholder={county ? "e.g. Alhambra" : "Pick a county first"}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-gray-50"
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={add}
          disabled={!canAdd || disabled}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >{t("pages.serviceAreas.add")}</button>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((a) => {
            const key = serviceAreaKey(a);
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {serviceAreaLabel(a)}
                <button
                  type="button"
                  onClick={() => remove(key)}
                  disabled={disabled}
                  className="ml-1 text-blue-400 hover:text-blue-600 disabled:opacity-50"
                  aria-label={`Remove ${serviceAreaLabel(a)}`}
                >
                  &times;
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t("pages.serviceAreas.hint")}</p>
      )}
    </div>
  );
}
