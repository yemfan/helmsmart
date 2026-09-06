"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Preferences = {
  transactionDigestEnabled: boolean;
  transactionDigestFrequency: "daily" | "weekly" | "off";
  wireFraudSmsEnabled: boolean;
  growthDigestEnabled: boolean;
};

/**
 * Three toggles for the Transaction Coordinator delivery preferences:
 *
 *   1. Digest on/off (kill-switch — persists across frequency changes).
 *   2. Frequency: daily / weekly / off. "off" here is redundant with (1)
 *      but kept as a UX affordance — some agents naturally reach for a
 *      "never" button rather than disabling the whole feature.
 *   3. Wire-fraud SMS on/off — opt-out for the closing-phase Twilio alert.
 *
 * Loads + saves via /api/dashboard/settings/transaction-notifications.
 */
export function TransactionNotificationsPanel() {
  const { t } = useTranslation("dashboard");
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/settings/transaction-notifications");
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          preferences?: Preferences;
          error?: string;
        };
        if (body.ok && body.preferences) setPrefs(body.preferences);
        else setMsg({ tone: "err", text: body.error ?? "Failed to load preferences." });
      } catch (e) {
        setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
      }
    })();
  }, []);

  async function save(patch: Partial<Preferences>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dashboard/settings/transaction-notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to save." });
        return;
      }
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return <div className="text-xs text-slate-500">{t("pages.transactionNotifications.loadingPreferences")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("pages.transactionNotifications.dailyDigest")}</div>
          <p className="mt-0.5 text-xs text-slate-500">
            Email summary of overdue + upcoming-72h transaction tasks. Sent at ~8am Pacific.
          </p>
        </div>
        <Toggle
          checked={prefs.transactionDigestEnabled}
          onChange={(v) => void save({ transactionDigestEnabled: v })}
          disabled={saving}
        />
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("pages.transactionNotifications.frequency")}</div>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.transactionNotifications.frequencyHint")}</p>
        </div>
        <select
          value={prefs.transactionDigestFrequency}
          onChange={(e) =>
            void save({
              transactionDigestFrequency: e.target.value as Preferences["transactionDigestFrequency"],
            })
          }
          disabled={saving || !prefs.transactionDigestEnabled}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="daily">{t("pages.transactionNotifications.daily")}</option>
          <option value="weekly">{t("pages.transactionNotifications.weeklyMonday")}</option>
          <option value="off">{t("pages.transactionNotifications.off")}</option>
        </select>
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("pages.transactionNotifications.wireFraud")}</div>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.transactionNotifications.wireFraudHint")}</p>
        </div>
        <Toggle
          checked={prefs.wireFraudSmsEnabled}
          onChange={(v) => void save({ wireFraudSmsEnabled: v })}
          disabled={saving}
        />
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("pages.transactionNotifications.growthDigest")}</div>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.transactionNotifications.growthDigestHint")}</p>
        </div>
        <Toggle
          checked={prefs.growthDigestEnabled}
          onChange={(v) => void save({ growthDigestEnabled: v })}
          disabled={saving}
        />
      </div>

      {msg ? (
        <p
          className={`text-xs ${msg.tone === "ok" ? "text-green-600" : "text-red-600"}`}
          aria-live="polite"
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-slate-900" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
