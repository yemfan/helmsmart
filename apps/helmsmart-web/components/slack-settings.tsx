"use client";

import { useState, useTransition } from "react";
import { Send, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveSlackWebhook, saveSlackNotifyToggle, testSlackWebhook } from "@/lib/actions/slack-settings";
import { Toggle } from "@/components/ui/toggle";

interface Props {
  webhookUrl: string | null;
  notifyNewLead: boolean;
  notifyApproval: boolean;
  notifyMissedCall: boolean;
  notifyFormSubmission: boolean;
}

/**
 * Column names the server writes; the label and the one-line description each
 * live at `slack.toggles.<key>.…` in the bundle.
 */
const NOTIFY_TOGGLES = [
  "slack_notify_new_lead",
  "slack_notify_form_submission",
  "slack_notify_missed_call",
  "slack_notify_approval",
] as const;

export function SlackSettings({
  webhookUrl: initialUrl,
  notifyNewLead,
  notifyApproval,
  notifyMissedCall,
  notifyFormSubmission,
}: Props) {
  const { t } = useTranslation("settings");
  const [webhookUrl, setWebhookUrl] = useState(initialUrl ?? "");
  const [toggles, setToggles] = useState({
    slack_notify_new_lead: notifyNewLead,
    slack_notify_approval: notifyApproval,
    slack_notify_missed_call: notifyMissedCall,
    slack_notify_form_submission: notifyFormSubmission,
  });

  const [saved, setSaved] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConnected = !!webhookUrl;

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSlackWebhook(webhookUrl);
      if (!result.ok) {
        setError(result.error ?? t("slack.errors.saveFailed"));
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  };

  const handleTest = () => {
    setTestSent(false);
    setError(null);
    startTransition(async () => {
      const result = await testSlackWebhook();
      if (!result.ok) {
        setError(result.error ?? t("slack.errors.testFailed"));
      } else {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 3000);
      }
    });
  };

  // Flips at once, and flips back — with the reason — if the column did not
  // change. It used to stay flipped whatever the server said.
  const handleToggle = (key: keyof typeof toggles, value: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: value }));
    setToggleError(null);
    startTransition(async () => {
      let message: string | null = null;
      try {
        const result = await saveSlackNotifyToggle(key, value);
        if (!result.ok) message = result.error ?? t("slack.errors.saveFailed");
      } catch (e) {
        console.error("saving a Slack alert switch", e);
        message = t("slack.errors.saveFailed");
      }
      if (message) {
        setToggles((prev) => ({ ...prev, [key]: !value }));
        setToggleError(message);
      }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
        {/* Slack logo */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#4A154B] flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Slack</h3>
            {isConnected && (
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                {t("slack.connected")}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{t("slack.description")}</p>
        </div>
        <a
          href="https://api.slack.com/apps/new"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          {t("slack.createApp")}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-6 space-y-5">
        {/* Webhook URL */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("slack.webhookLabel")}
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={isPending}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 font-mono"
            />
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isPending ? t("actions.saving") : saved ? t("actions.saved") : t("slack.save")}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">{t("slack.webhookHelp")}</p>
        </div>

        {/* Test button */}
        {isConnected && (
          <button
            onClick={handleTest}
            disabled={isPending}
            className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {testSent ? t("slack.testSent") : t("slack.sendTest")}
          </button>
        )}

        {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}

        {/* Notification toggles */}
        {isConnected && (
          <div>
            <p className="text-xs font-medium text-slate-600 mb-3 uppercase tracking-wide">
              {t("slack.notifyHeading")}
            </p>
            <div className="space-y-3">
              {NOTIFY_TOGGLES.map((key) => (
                <div key={key} className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <Toggle
                      checked={toggles[key]}
                      onChange={(next) => handleToggle(key, next)}
                      disabled={isPending}
                      label={t(`slack.toggles.${key}.label`)}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t(`slack.toggles.${key}.label`)}</p>
                    <p className="text-xs text-slate-500">{t(`slack.toggles.${key}.description`)}</p>
                  </div>
                </div>
              ))}
            </div>
            {toggleError && <p className="mt-3 text-xs text-rose-600" role="alert">{toggleError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
