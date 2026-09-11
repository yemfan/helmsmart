"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { Toggle } from "@/components/ui/toggle";
import { updateClientPreferences } from "@/lib/actions/communication-logs";
import {
  DEFAULT_CLIENT_COMMUNICATION_PREFERENCES,
  type ClientCommunicationPreferences,
} from "@/lib/communication-preferences";
import type { ChannelOptOut } from "@/lib/consent";

type Preferences = ClientCommunicationPreferences;
type Field = keyof Preferences;
type OptOutKey = "opted_out_sms" | "opted_out_email" | "opted_out_calls";

/** How long "Saved!" stays before the label goes back to rest. */
const SAVED_FOR_MS = 2500;

interface Props {
  clientId: string;
  initialPreferences?: Preferences;
  /**
   * How each opt-out came about, from every source the send paths check (the
   * switch, a STOP reply, a campaign unsubscribe). Drives the "Replied STOP on
   * Sep 3" line under a switch.
   */
  optOuts?: { sms: ChannelOptOut; email: ChannelOptOut; call: ChannelOptOut };
}

export function CommunicationPreferences({
  clientId,
  initialPreferences,
  optOuts,
}: Props) {
  const { t, i18n } = useTranslation("clients");
  const [preferences, setPreferences] = useState<Preferences>(
    initialPreferences ?? DEFAULT_CLIENT_COMMUNICATION_PREFERENCES
  );
  // The notes as the database holds them, so a blur with nothing new writes nothing.
  const savedNotes = useRef(preferences.notes ?? "");
  const [savingField, setSavingField] = useState<Field | null>(null);
  const [savedField, setSavedField] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Switches the owner has changed here: their "since" line describes the
  // state the page loaded with, so it stops applying once they are touched.
  const [touched, setTouched] = useState<Set<OptOutKey>>(new Set());

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  async function save(field: Field, updated: Preferences, undo: () => void) {
    setSavingField(field);
    setSavedField(null);
    setError(null);

    let result: { ok: boolean; error?: string };
    try {
      result = await updateClientPreferences(clientId, updated);
    } catch (e) {
      console.error("saving communication preferences", e);
      result = { ok: false };
    }
    setSavingField(null);

    if (!result.ok) {
      undo();
      setError(result.error || t("errors.preferencesFailed"));
      return;
    }
    savedNotes.current = updated.notes ?? "";
    if (field === "opted_out_sms" || field === "opted_out_email" || field === "opted_out_calls") {
      setTouched((prev) => new Set(prev).add(field));
    }
    setSavedField(field);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedField(null), SAVED_FOR_MS);
  }

  /** A switch or a choice: saved at once. */
  const handleChange = (key: Exclude<Field, "notes">, value: boolean | string) => {
    const previous = preferences[key];
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    // The row did not change, so the control must not keep showing the new
    // value — a switch left flipped over a refused write tells the same lie
    // the silent save did.
    void save(key, updated, () => setPreferences((cur) => ({ ...cur, [key]: previous })));
  };

  /**
   * The notes save when the box loses focus. They used to save on every
   * keystroke — a write per letter, each one flashing the status line.
   */
  const saveNotes = () => {
    const notes = preferences.notes ?? "";
    if (notes === savedNotes.current || savingField === "notes") return;
    // A refused note keeps its text: losing what was typed is worse than an
    // unsaved box, and the error below says it did not save. The next blur
    // tries again.
    void save("notes", preferences, () => {});
  };

  const statusLabel = (saving: boolean, saved: boolean) =>
    saving ? (
      <span className="text-xs text-slate-500" aria-live="polite">{t("common:status.saving")}</span>
    ) : saved ? (
      <span className="text-xs text-emerald-600" aria-live="polite">{t("preferences.saved")}</span>
    ) : null;

  const busy = savingField !== null && savingField !== "notes";

  const sinceLine = (key: OptOutKey, info: ChannelOptOut | undefined): string | null => {
    if (!info?.optedOut || !info.since || info.via === "marked") return null;
    if (touched.has(key) || !preferences[key]) return null;
    const d = new Date(info.since);
    if (Number.isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString(intlLocale(i18n.language), { month: "short", day: "numeric" });
    if (info.via === "stop_reply") return t("preferences.optOuts.since.stopReply", { date });
    if (info.via === "carrier") return t("preferences.optOuts.since.carrier", { date });
    return t("preferences.optOuts.since.unsubscribed", { date });
  };

  const optOutItems: Array<{ key: OptOutKey; label: string; description: string; since: string | null }> = [
    {
      key: "opted_out_sms",
      label: t("preferences.optOuts.sms.label"),
      description: t("preferences.optOuts.sms.description"),
      since: sinceLine("opted_out_sms", optOuts?.sms),
    },
    {
      key: "opted_out_email",
      label: t("preferences.optOuts.email.label"),
      description: t("preferences.optOuts.email.description"),
      since: sinceLine("opted_out_email", optOuts?.email),
    },
    {
      key: "opted_out_calls",
      label: t("preferences.optOuts.calls.label"),
      description: t("preferences.optOuts.calls.description"),
      since: sinceLine("opted_out_calls", optOuts?.call),
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Bell className="w-5 h-5 text-slate-700" />
        <h3 className="text-lg font-semibold text-slate-900">
          {t("preferences.title")}
        </h3>
        {/* A switch or a choice reports its save here, beside the heading, not in a line that appears under it. */}
        {statusLabel(busy, savedField !== null && savedField !== "notes")}
      </div>

      <div className="space-y-6">
        {/* Opt-outs — read by every send path (lib/outbound-send.ts). */}
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-sm font-medium text-slate-700 mb-4">
            {t("preferences.optOuts.title")}
          </p>
          <div className="space-y-4">
            {optOutItems.map((item) => (
              <div key={item.key} className="flex items-start gap-3">
                <div className="pt-0.5">
                  <Toggle
                    checked={preferences[item.key] === true}
                    onChange={(next) => handleChange(item.key, next)}
                    disabled={busy}
                    label={item.label}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                  {item.since && <p className="mt-0.5 text-xs text-slate-600">{item.since}</p>}
                </div>
              </div>
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
                  handleChange("preferred_contact_method", e.target.value)
                }
                disabled={busy}
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
                  handleChange("best_time_to_contact", e.target.value)
                }
                disabled={busy}
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

            {/* Notes — saved when the box loses focus; the label says so. */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor={`comm-notes-${clientId}`} className="block text-xs font-medium text-slate-700">
                  {t("preferences.contact.notes")}
                </label>
                {statusLabel(savingField === "notes", savedField === "notes")}
              </div>
              <textarea
                id={`comm-notes-${clientId}`}
                value={preferences.notes || ""}
                onChange={(e) => setPreferences((cur) => ({ ...cur, notes: e.target.value }))}
                onBlur={saveNotes}
                placeholder={t("preferences.contact.notesPlaceholder")}
                rows={3}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-600" role="alert">{error}</p>
        )}
      </div>
    </div>
  );
}
