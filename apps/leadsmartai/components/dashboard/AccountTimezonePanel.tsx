"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  COMMON_TIMEZONES,
  COMMON_TIMEZONE_VALUES,
  OTHER_TIMEZONE,
  isValidTimezone,
} from "@/lib/agent/timezone";

/**
 * The account's timezone, in General settings.
 *
 * It used to live inside the briefing schedule card. One value decides when
 * briefings fire, when the overnight run starts, what "tomorrow at 3" means to
 * the receptionist, and which times a caller is offered — so editing it under
 * "Briefing schedule" both hid it and implied it only governed briefings. That
 * naming is why two other places grew their own copy.
 */
export default function AccountTimezonePanel() {
  const { t } = useTranslation("dashboard");
  const [timezone, setTimezone] = useState<string>("");
  const [otherTz, setOtherTz] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = useMemo(
    () => (timezone && !COMMON_TIMEZONE_VALUES.has(timezone) ? "other" : "common"),
    [timezone],
  );

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/account-timezone")
      .then((r) => r.json())
      .then((json: { ok?: boolean; timezone?: string }) => {
        if (!active || !json?.ok || !json.timezone) return;
        setTimezone(json.timezone);
        if (!COMMON_TIMEZONE_VALUES.has(json.timezone)) setOtherTz(json.timezone);
      })
      .catch(() => {})
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(
    async (value: string) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/account-timezone", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: value }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          // The reason, not "failed" — the usual cause is an abbreviation like
          // EST, and the message says what to type instead.
          setError(json.error || t("pages.accountTimezone.saveFailed"));
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setError(t("pages.accountTimezone.saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [t],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{t("pages.accountTimezone.title")}</h2>
      <p className="mt-1 text-xs text-gray-500">{t("pages.accountTimezone.blurb")}</p>

      <div className="mt-3 max-w-sm">
        <select
          value={mode === "other" ? OTHER_TIMEZONE : timezone}
          disabled={!loaded || saving}
          onChange={(e) => {
            const v = e.target.value;
            if (v === OTHER_TIMEZONE) {
              // Switching to "Other" must not save yet — there is nothing typed
              // to save, and writing the current value back would be a no-op
              // that still reported success.
              setTimezone(otherTz || timezone);
              return;
            }
            setTimezone(v);
            void save(v);
          }}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
          <option value={OTHER_TIMEZONE}>{t("pages.accountTimezone.other")}</option>
        </select>

        {mode === "other" ? (
          <input
            type="text"
            value={otherTz}
            placeholder="America/Los_Angeles"
            disabled={saving}
            onChange={(e) => setOtherTz(e.target.value)}
            onBlur={() => {
              const v = otherTz.trim();
              // Validate before sending: the server rejects it anyway, but a
              // half-typed zone shouldn't produce an error banner on every
              // keystroke's worth of blur.
              if (v && isValidTimezone(v)) {
                setTimezone(v);
                void save(v);
              } else if (v) {
                setError(t("pages.accountTimezone.invalid"));
              }
            }}
            className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : null}

        <p className="mt-2 h-4 text-xs">
          {error ? (
            <span className="text-rose-600" role="alert">
              {error}
            </span>
          ) : saved ? (
            <span className="text-emerald-600">{t("pages.accountTimezone.saved")}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
