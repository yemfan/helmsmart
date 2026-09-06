"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingText } from "@/components/ui/LoadingText";

/**
 * Missed Call Text-Back settings panel.
 *
 * Three blocks:
 *   1. Forwarding number (saved on agents.forwarding_phone — also
 *      used by the upcoming click-to-call feature, so this is
 *      shared infrastructure not feature-specific config).
 *   2. Toggle + ring timeout + AI personalization toggle.
 *   3. Message template editor with token cheat-sheet.
 *
 * Plus an activity log below showing recent missed calls + whether
 * the auto-text-back fired.
 *
 * Single PUT round-trip per save — fields all live in one form.
 */

type Settings = {
  agent_id: string;
  enabled: boolean;
  ring_timeout_seconds: number;
  message_template: string;
  use_ai_personalization: boolean;
};

const DEFAULT_TEMPLATE =
  "Hey {{caller_name}} — {{agent_first_name}} here. Sorry I missed your call. What's the best way I can help? Happy to text or set up a quick call back.";

export default function MissedCallSettingsPanel() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Form state. Initialized from GET on mount; controlled inputs
  // throughout. We don't dirty-track per-field — just save on
  // explicit t("common:actions.save_settings") click.
  const [enabled, setEnabled] = useState(false);
  const [forwardingPhone, setForwardingPhone] = useState("");
  const [ringTimeout, setRingTimeout] = useState(20);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [useAi, setUseAi] = useState(true);

  // Activity log.

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
          // Send empty string as null to clear; otherwise let the
          // server normalize to (xxx) xxx-xxxx.
          forwarding_phone: forwardingPhone.trim() || null,
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
  }, [enabled, ringTimeout, messageTemplate, useAi, forwardingPhone]);

  if (loading) {
    return <p className="text-sm text-slate-500"><LoadingText /></p>;
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
          id="missed-call-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="missed-call-enabled" className="flex-1 cursor-pointer">
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
              id="missed-call-ai"
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="missed-call-ai" className="flex-1 cursor-pointer text-xs text-slate-700">{t("pages.missedCall.aiHint")}</label>
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
        <p className="mt-1 text-xs text-slate-500">{t("pages.dashFragments.tokens")}{" "}
          <code className="rounded bg-slate-100 px-1">{"{{caller_name}}"}</code>,{" "}
          <code className="rounded bg-slate-100 px-1">{"{{agent_first_name}}"}</code>,{" "}
          <code className="rounded bg-slate-100 px-1">{"{{agent_brand}}"}</code>
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? t("common:status.saving") : t("common:actions.save_settings")}
        </button>
        {savedAt && !error ? (
          <span className="text-xs font-medium text-emerald-700">{t("pages.missedCall.saved")}</span>
        ) : null}
        {error ? (
          <span className="text-xs font-medium text-red-700">{error}</span>
        ) : null}
      </div>


      {/* The call log used to be rendered here. It is not a setting, and the
          Receptionist page already had a better version of it - 100 calls with
          callbacks and per-call detail, against the 20 rows shown here. Two
          lists of the same thing means one of them is always the stale one. */}
      <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
        <Link href="/dashboard/ai-receptionist" className="font-medium text-[#0072ce] underline hover:no-underline">
          {t("pages.missedCall.seeCallHistory")}
        </Link>
      </p>
    </div>
  );
}
