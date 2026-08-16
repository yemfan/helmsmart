"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Form-only variant of the missed-call text-back configuration —
 * forwarding number, enable toggle, ring timeout, AI personalization,
 * and message template. Saves to the same PUT
 * /api/dashboard/missed-call/settings endpoint as the legacy
 * MissedCallSettingsPanel; intentionally does NOT render an activity
 * log so the form can be embedded inside a collapsible panel on the
 * activity-first dashboard page without duplicating data the
 * surrounding page already shows.
 *
 * The legacy MissedCallSettingsPanel remains in place for the Voice
 * tab on /dashboard/settings, which still wants the form + activity
 * combo.
 */

type Settings = {
  agent_id: string;
  enabled: boolean;
  ring_timeout_seconds: number;
  message_template: string;
  use_ai_personalization: boolean;
  callback_enabled: boolean;
  callback_interval_minutes: number;
  callback_max_per_day: number;
  callback_max_days: number;
};

const clampInt = (v: number, lo: number, hi: number, fallback: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : fallback)));

const DEFAULT_TEMPLATE =
  "Hey {{caller_name}} — {{agent_first_name}} here. Sorry I missed your call. What's the best way I can help? Happy to text or set up a quick call back.";

export default function MissedCallSettingsForm() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [forwardingPhone, setForwardingPhone] = useState("");
  const [ringTimeout, setRingTimeout] = useState(20);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [useAi, setUseAi] = useState(true);
  const [callbackEnabled, setCallbackEnabled] = useState(true);
  const [callbackInterval, setCallbackInterval] = useState(30);
  const [callbackPerDay, setCallbackPerDay] = useState(3);
  const [callbackDays, setCallbackDays] = useState(1);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/missed-call/settings", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: Settings;
        forwarding_phone?: string | null;
      } | null;
      if (json?.ok && json.settings) {
        setEnabled(json.settings.enabled);
        setRingTimeout(json.settings.ring_timeout_seconds);
        setMessageTemplate(json.settings.message_template);
        setUseAi(json.settings.use_ai_personalization);
        setCallbackEnabled(json.settings.callback_enabled ?? true);
        setCallbackInterval(json.settings.callback_interval_minutes ?? 30);
        setCallbackPerDay(json.settings.callback_max_per_day ?? 3);
        setCallbackDays(json.settings.callback_max_days ?? 1);
        setForwardingPhone(json.forwarding_phone ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/dashboard/missed-call/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled,
          ring_timeout_seconds: ringTimeout,
          message_template: messageTemplate,
          use_ai_personalization: useAi,
          forwarding_phone: forwardingPhone.trim() || null,
          callback_enabled: callbackEnabled,
          callback_interval_minutes: callbackInterval,
          callback_max_per_day: callbackPerDay,
          callback_max_days: callbackDays,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: Settings;
        forwarding_phone?: string | null;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        if (json.settings) {
          setEnabled(json.settings.enabled);
          setRingTimeout(json.settings.ring_timeout_seconds);
          setMessageTemplate(json.settings.message_template);
          setUseAi(json.settings.use_ai_personalization);
          setCallbackEnabled(json.settings.callback_enabled ?? true);
          setCallbackInterval(json.settings.callback_interval_minutes ?? 30);
          setCallbackPerDay(json.settings.callback_max_per_day ?? 3);
          setCallbackDays(json.settings.callback_max_days ?? 1);
        }
        setForwardingPhone(json.forwarding_phone ?? "");
        setSavedAt(Date.now());
        return;
      }
      setError(json?.error ?? `Save failed (HTTP ${res.status}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }, [
    enabled,
    ringTimeout,
    messageTemplate,
    useAi,
    forwardingPhone,
    callbackEnabled,
    callbackInterval,
    callbackPerDay,
    callbackDays,
  ]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Forwarding phone */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.mobileNumber")}</label>
        <p className="mt-1 text-xs text-slate-500">{t("pages.missedCall.mobileHint")}</p>
        <input
          type="tel"
          value={forwardingPhone}
          onChange={(e) => setForwardingPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Enable toggle */}
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <input
          id="missed-call-form-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="missed-call-form-enabled" className="flex-1 cursor-pointer">
          <span className="text-sm font-semibold text-slate-900">{t("pages.missedCall.enableTextBack")}</span>
          <p className="mt-0.5 text-xs text-slate-600">{t("pages.missedCall.textBackHint")}</p>
        </label>
      </div>

      {/* Ring timeout + AI toggle */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.ringTimeout")}</label>
          <input
            type="number"
            min={5}
            max={60}
            value={ringTimeout}
            onChange={(e) =>
              setRingTimeout(Math.max(5, Math.min(60, Number(e.target.value) || 20)))
            }
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="mt-1 text-xs text-slate-500">{t("pages.missedCall.ringTimeoutHint")}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.aiPersonalization")}</label>
          <div className="mt-1 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
            <input
              id="missed-call-form-ai"
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="missed-call-form-ai"
              className="flex-1 cursor-pointer text-xs text-slate-700"
            >{t("pages.missedCall.aiHint")}</label>
          </div>
        </div>
      </div>

      {/* Template */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.templateLabel")}</label>
        <textarea
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="mt-1 text-xs text-slate-500">
          Tokens:{" "}
          <code className="rounded bg-slate-100 px-1">{"{{caller_name}}"}</code>,{" "}
          <code className="rounded bg-slate-100 px-1">{"{{agent_first_name}}"}</code>,{" "}
          <code className="rounded bg-slate-100 px-1">{"{{agent_brand}}"}</code>
        </p>
      </div>

      {/* Call Back ladder */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <div className="flex items-start gap-3">
          <input
            id="missed-call-form-callback"
            type="checkbox"
            checked={callbackEnabled}
            onChange={(e) => setCallbackEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="missed-call-form-callback" className="flex-1 cursor-pointer">
            <span className="text-sm font-semibold text-slate-900">{t("pages.missedCall.callBack")}</span>
            <p className="mt-0.5 text-xs text-slate-600">{t("pages.missedCall.callBackHint")}</p>
          </label>
        </div>

        {callbackEnabled && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.retryEvery")}</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={callbackInterval}
                  onChange={(e) =>
                    setCallbackInterval(clampInt(Number(e.target.value), 5, 240, 30))
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.timesPerDay")}</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={callbackPerDay}
                  onChange={(e) =>
                    setCallbackPerDay(clampInt(Number(e.target.value), 1, 10, 3))
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.missedCall.forHowManyDays")}</label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={callbackDays}
                  onChange={(e) =>
                    setCallbackDays(clampInt(Number(e.target.value), 1, 7, 1))
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Up to{" "}
              <span className="font-semibold text-slate-700">
                {callbackPerDay * callbackDays}
              </span>{" "}
              call-back{callbackPerDay * callbackDays === 1 ? "" : "s"} total
              ({callbackPerDay}/day × {callbackDays} day
              {callbackDays === 1 ? "" : "s"}), {callbackInterval} minutes apart.
              The ladder stops the moment the caller is reached.
            </p>
          </>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {savedAt && !error ? (
          <span className="text-xs font-medium text-emerald-700">{t("pages.missedCall.saved")}</span>
        ) : null}
        {error ? (
          <span className="text-xs font-medium text-red-700">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
