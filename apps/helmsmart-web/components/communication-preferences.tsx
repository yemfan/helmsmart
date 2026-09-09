"use client";

import { useState } from "react";
import { Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { updateClientPreferences } from "@/lib/actions/communication-logs";
import {
  DEFAULT_CLIENT_COMMUNICATION_PREFERENCES,
  type ClientCommunicationPreferences,
} from "@/lib/communication-preferences";

type Preferences = ClientCommunicationPreferences;

interface Props {
  clientId: string;
  initialPreferences?: Preferences;
}

export function CommunicationPreferences({
  clientId,
  initialPreferences,
}: Props) {
  const { t } = useTranslation("clients");
  const [preferences, setPreferences] = useState<Preferences>(
    initialPreferences ?? DEFAULT_CLIENT_COMMUNICATION_PREFERENCES
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (
    key: keyof Preferences,
    value: boolean | string
  ) => {
    const previous = preferences;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    setSaved(false);

    setSaving(true);
    setError(null);

    const result = await updateClientPreferences(clientId, updated);
    setSaving(false);

    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      // The row did not change, so the control must not keep showing the new
      // value — a checkbox left flipped over a refused write tells the same lie
      // the silent save did.
      setPreferences(previous);
      setError(result.error || t("errors.preferencesFailed"));
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Bell className="w-5 h-5 text-slate-700" />
        <h3 className="text-lg font-semibold text-slate-900">
          {t("preferences.title")}
        </h3>
      </div>

      <div className="space-y-6">
        {/* Opt-outs */}
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-sm font-medium text-slate-700 mb-4">
            {t("preferences.optOuts.title")}
          </p>
          <div className="space-y-3">
            {[
              {
                key: "opted_out_sms",
                label: t("preferences.optOuts.sms.label"),
                description: t("preferences.optOuts.sms.description"),
              },
              {
                key: "opted_out_email",
                label: t("preferences.optOuts.email.label"),
                description: t("preferences.optOuts.email.description"),
              },
              {
                key: "opted_out_calls",
                label: t("preferences.optOuts.calls.label"),
                description: t("preferences.optOuts.calls.description"),
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={
                    preferences[item.key as keyof Preferences] === true
                  }
                  onChange={(e) =>
                    handleToggle(item.key as keyof Preferences, e.target.checked)
                  }
                  disabled={saving}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-50"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Contact preferences */}
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-sm font-medium text-slate-700 mb-4">
            {t("preferences.contact.title")}
          </p>
          <div className="space-y-4">
            {/* Preferred contact method */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                {t("preferences.contact.method")}
              </label>
              <select
                value={preferences.preferred_contact_method || "any"}
                onChange={(e) =>
                  handleToggle("preferred_contact_method", e.target.value)
                }
                disabled={saving}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="any">{t("preferences.contact.methods.any")}</option>
                <option value="sms">{t("preferences.contact.methods.sms")}</option>
                <option value="email">{t("preferences.contact.methods.email")}</option>
                <option value="call">{t("preferences.contact.methods.call")}</option>
              </select>
            </div>

            {/* Best time to contact */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                {t("preferences.contact.bestTime")}
              </label>
              <select
                value={preferences.best_time_to_contact || ""}
                onChange={(e) =>
                  handleToggle("best_time_to_contact", e.target.value)
                }
                disabled={saving}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">{t("preferences.contact.times.none")}</option>
                <option value="morning">{t("preferences.contact.times.morning")}</option>
                <option value="afternoon">{t("preferences.contact.times.afternoon")}</option>
                <option value="evening">{t("preferences.contact.times.evening")}</option>
                <option value="weekdays">{t("preferences.contact.times.weekdays")}</option>
                <option value="weekends">{t("preferences.contact.times.weekends")}</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                {t("preferences.contact.notes")}
              </label>
              <textarea
                value={preferences.notes || ""}
                onChange={(e) => handleToggle("notes", e.target.value)}
                disabled={saving}
                placeholder={t("preferences.contact.notesPlaceholder")}
                rows={3}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Status messages */}
        <div className="flex items-center gap-2 min-h-6">
          {saved && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              {t("preferences.saved")}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-600">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {saving && (
            <div className="text-sm text-slate-500">{t("common:status.saving")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
