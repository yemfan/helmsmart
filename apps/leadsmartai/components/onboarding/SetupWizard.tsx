"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServiceAreasPicker } from "@/components/onboarding/ServiceAreasPicker";
import {
  serviceAreasToLegacyStrings,
  type AgentServiceArea,
} from "@/lib/geo/serviceArea";

/** Step ids — titles resolve from `dashboard:pages.setupWizard.steps.*` at render. */
const STEPS = ["serviceAreas", "branding", "aiAssistant", "notifications"] as const;

type StepIndex = 0 | 1 | 2 | 3;

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("dashboard");
  const [step, setStep] = useState<StepIndex>(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Service areas — structured picks via state/county/city cascade.
  const [areas, setAreas] = useState<AgentServiceArea[]>([]);
  const [autoSuggested, setAutoSuggested] = useState(false);

  // Pre-fill the market: load existing areas, or an AI suggestion auto-detected
  // from the agent's location — so they confirm instead of typing from scratch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/onboarding");
        const data = await res.json();
        if (cancelled || !data?.ok) return;
        const existing: AgentServiceArea[] = Array.isArray(data.serviceAreasV2) ? data.serviceAreasV2 : [];
        const suggested: AgentServiceArea[] = Array.isArray(data.suggestedServiceAreas) ? data.suggestedServiceAreas : [];
        if (existing.length > 0) {
          setAreas(existing);
        } else if (suggested.length > 0) {
          setAreas(suggested);
          setAutoSuggested(true);
        }
      } catch {
        /* ignore — the agent can pick manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 2: Branding
  const [brandName, setBrandName] = useState("");

  // Step 3: AI
  const [personality, setPersonality] = useState("friendly");
  const [language, setLanguage] = useState("en");

  // Step 4: Notifications
  const [pushHotLead, setPushHotLead] = useState(true);
  const [pushReminder, setPushReminder] = useState(true);
  const [pushMissedCall, setPushMissedCall] = useState(true);

  async function saveAndNext() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};

      if (step === 0) {
        // Dual-write: structured v2 for the new matcher path + flattened
        // legacy strings so anything still reading service_areas keeps
        // working until fully migrated.
        payload.service_areas_v2 = areas;
        payload.service_areas = serviceAreasToLegacyStrings(areas);
      } else if (step === 1) {
        if (brandName.trim()) payload.brand_name = brandName.trim();
      } else if (step === 2) {
        payload.ai_personality = personality;
        payload.ai_language = language;
      } else if (step === 3) {
        payload.push_hot_lead = pushHotLead;
        payload.push_reminder = pushReminder;
        payload.push_missed_call = pushMissedCall;
        payload.onboarding_completed = true;
      }

      await fetch("/api/dashboard/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (step < 3) {
        setStep((step + 1) as StepIndex);
      } else {
        onComplete();
      }
    } catch {
      // Allow progression even if save fails
      if (step < 3) setStep((step + 1) as StepIndex);
      else onComplete();
    } finally {
      setSaving(false);
    }
  }

  /**
   * "Do this later" — the wizard used to have no exit except stepping through
   * every screen. Everything here is reachable again from Settings, and Max
   * proposes the unfinished pieces over the first week, so leaving is safe.
   */
  async function finishLater() {
    setSaving(true);
    await fetch("/api/dashboard/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    }).catch(() => {});
    setSaving(false);
    onComplete();
  }

  async function skip() {
    if (step < 3) {
      setStep((step + 1) as StepIndex);
    } else {
      setSaving(true);
      await fetch("/api/dashboard/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_completed: true }),
      }).catch(() => {});
      setSaving(false);
      onComplete();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title" className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => void finishLater()}
          disabled={saving}
          className="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50"
        >
          {t("pages.setupWizard.doLater")}
        </button>
        {/* Progress bar */}
        <div className="flex gap-1 p-4 pb-0">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-blue-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="p-6">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">{t("pages.setupWizard.stepOfFour", { step: step + 1 })}
          </p>
          <h2 id="setup-wizard-title" className="text-xl font-bold text-gray-900 mb-1">
            {t(`pages.setupWizard.steps.${STEPS[step]}`)}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {step === 0 && t("pages.setupWizard.pickYourArea")}
            {step === 1 && t("pages.setupWizard.setYourBrandName")}
            {step === 2 && t("pages.setupWizard.configureHowYourAi")}
            {step === 3 && t("pages.setupWizard.chooseWhichMobilePush")}
          </p>

          {/* Step 1: Service Areas */}
          {step === 0 && (
            <>
              {autoSuggested ? (
                <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{t("pages.setupWizard.prefilledMarket")}</p>
              ) : null}
              <ServiceAreasPicker value={areas} onChange={setAreas} disabled={saving} />
            </>
          )}

          {/* Step 2: Branding */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.setupWizard.brandName")}</label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={t("pages.setupWizard.brandPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-gray-400">{t("pages.setupWizard.logoLater")}</p>
            </div>
          )}

          {/* Step 3: AI Assistant */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.setupWizard.commStyle")}</label>
                <select
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="friendly">{t("pages.setupWizard.styleFriendly")}</option>
                  <option value="professional">{t("pages.setupWizard.styleProfessional")}</option>
                  <option value="casual">{t("pages.setupWizard.styleCasual")}</option>
                  <option value="concise">{t("pages.setupWizard.styleShort")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.setupWizard.primaryLanguage")}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="en">{t("pages.setupWizard.langEnglish")}</option>
                  <option value="es">{t("pages.setupWizard.langSpanish")}</option>
                  <option value="zh">{t("pages.setupWizard.langChinese")}</option>
                  <option value="ko">{t("pages.setupWizard.langKorean")}</option>
                  <option value="vi">{t("pages.setupWizard.langVietnamese")}</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 4: Notifications */}
          {step === 3 && (
            <div className="space-y-3">
              {[
                { label: t("pages.setupWizard.notifHotLead"), desc: t("pages.setupWizard.notifHotLeadDesc"), value: pushHotLead, set: setPushHotLead },
                { label: t("pages.setupWizard.notifReminder"), desc: t("pages.setupWizard.notifReminderDesc"), value: pushReminder, set: setPushReminder },
                { label: t("pages.setupWizard.notifMissedCall"), desc: t("pages.setupWizard.notifMissedCallDesc"), value: pushMissedCall, set: setPushMissedCall },
              ].map((item) => (
                <label key={item.label} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={item.value}
                    onChange={(e) => item.set(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50">
          <button
            onClick={skip}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {step === 3 ? t("pages.setupWizard.skipFinish") : t("pages.setupWizard.skip")}
          </button>
          <button
            onClick={saveAndNext}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? t("common:status.saving") : step === 3 ? t("pages.setupWizard.finishSetup") : t("common:actions.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
