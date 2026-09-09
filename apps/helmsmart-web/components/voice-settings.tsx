"use client";

import { useState, useTransition } from "react";
import { Mic, Save, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReceptionistNumberSimple } from "@/components/receptionist-number-simple";
import { saveVoiceSettings } from "@/lib/actions/social";

// Generic small-business example, shown when the active pack doesn't supply its own.
//
// This is PROMPT content: "Use this template" writes it into the text the
// receptionist is briefed with, and the receptionist speaks the caller's
// language at call time. It stays in English in every UI language, the same way
// the opening greeting does.
const DEFAULT_CONTEXT_EXAMPLE = `## BUSINESS
Name: Acme Plumbing
Services: residential plumbing, drain cleaning, water heater installation
Pricing: free estimates, $95 service call fee

## APPOINTMENTS & CONTACT
Availability: same-day most days; book at least 2 hours ahead
Owner: Mike Johnson — available for callbacks between 9am-5pm`;

interface Props {
  enabled: boolean;
  agentName: string;
  businessName: string;
  orgName: string;
  greeting: string;
  prompt: string;
  twilioNumber: string | null;
  /** Vertical-tailored example for the Business-context field (placeholder + "Use this template"). */
  contextExample?: string;
  /** How many OTHER accounts claim this same number. */
  sharedWith?: number;
  /** Whether calls to it are actually answered as this account. */
  answersThisOrg?: boolean;
  /** Where to text the owner when the receptionist books. Blank = don't. */
  bookingAlertPhone?: string;
}

export function VoiceSettings({ enabled, agentName, businessName, orgName, greeting, prompt, twilioNumber, contextExample, sharedWith = 0, answersThisOrg = true, bookingAlertPhone = "" }: Props) {
  const { t } = useTranslation("voice");
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [agentNameText, setAgentName] = useState(agentName ?? "");
  const [businessNameText, setBusinessName] = useState(businessName ?? "");
  const [greetingText, setGreeting] = useState(greeting);
  const [promptText, setPrompt] = useState(prompt ?? "");
  const [alertPhone, setAlertPhone] = useState(bookingAlertPhone);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, start] = useTransition();
  const example = contextExample || DEFAULT_CONTEXT_EXAMPLE;

  function handleSave() {
    start(async () => {
      try {
        await saveVoiceSettings({
          enabled: isEnabled,
          agentName: agentNameText,
          businessName: businessNameText,
          greeting: greetingText,
          prompt: promptText,
          bookingAlertPhone: alertPhone,
        });
      } catch (e) {
        // A refused save has to say so. The button used to read "Saved!" over a
        // rejected write, which is the same lie as a toggle that saves nothing.
        console.error("save voice settings", e);
        setSaveError(t("settings.saveFailed"));
        return;
      }
      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Mic className="w-4 h-4 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{t("settings.title")}</h2>
          <p className="text-xs text-slate-500">{t("settings.subtitle")}</p>
        </div>
        {/*
          Disabled without a number. It was switchable either way, so the screen
          could show a confident blue "on" beside a warning that the agent
          cannot answer — a control asserting a state the system does not hold.
        */}
        <button
          onClick={() => setIsEnabled((v) => !v)}
          disabled={!twilioNumber}
          title={twilioNumber ? undefined : t("settings.toggleNeedsNumber")}
          aria-label={t("settings.title")}
          className={`ml-auto relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isEnabled ? "bg-indigo-600" : "bg-slate-200"}`}
        >
          <span className={`inline-block w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isEnabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {/*
        Phone number check.

        This used to say "Set your Twilio number in Reception → Settings" —
        pointing at a tab that does not exist. The settings tabs are General,
        Financial, Marketing, Voice AI and Operations; the number field lives
        under Operations. Rather than correct the directions, put the field
        here: this is where the need is discovered, and sending someone to
        another tab to unblock the screen they are already on is a detour, not
        an instruction.
      */}
      {!twilioNumber ? (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700">
            ⚠ {t("settings.needsNumber")}
          </div>
          <ReceptionistNumberSimple current={null} />
        </div>
      ) : (
        <div className="space-y-2">
          {/*
            "Connected" only earns the green when calls to this number are
            actually answered as this account. A number can be claimed by
            several accounts, and the receptionist serves exactly one of them —
            so a confident green tick over someone else's receptionist is the
            same lie as a toggle that saves nothing.
          */}
          {answersThisOrg ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-sm text-emerald-700">{t("settings.connected", { number: twilioNumber })}</span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                {t("settings.notAnswered", { number: twilioNumber })}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {t("settings.sharedWarning", { count: sharedWith })}
              </p>
            </div>
          )}

          {answersThisOrg && sharedWith > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2">
              {t("settings.sharedNotice", { count: sharedWith })}
            </p>
          )}
        </div>
      )}

      {/* Agent name */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          {t("settings.agentName.label")} <span className="text-slate-400">{t("settings.agentName.hint")}</span>
        </label>
        <input
          type="text"
          value={agentNameText}
          onChange={(e) => setAgentName(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={t("settings.agentName.placeholder")}
        />
        <p className="text-xs text-slate-400 mt-1">{t("settings.agentName.help")}</p>
      </div>

      {/* DBA name — trade name the agent announces; falls back to the account name */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          {t("settings.dba.label")} <span className="text-slate-400">{t("settings.dba.hint")}</span>
        </label>
        <input
          type="text"
          value={businessNameText}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={orgName || t("settings.dba.placeholder")}
        />
        <p className="text-xs text-slate-400 mt-1">
          {orgName ? t("settings.dba.helpWithName", { name: orgName }) : t("settings.dba.help")}
        </p>
      </div>

      {/* Greeting */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("settings.greeting.label")}</label>
        <input
          type="text"
          value={greetingText}
          onChange={(e) => setGreeting(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={t("settings.greeting.placeholder")}
        />
        <p className="text-xs text-slate-400 mt-1">
          {t("settings.greeting.help", { agentToken: "{{agent_name}}", businessToken: "{{business_name}}" })}
        </p>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          {t("settings.context.label")} <span className="text-slate-400">{t("settings.context.hint")}</span>
        </label>
        <textarea
          value={promptText}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
          placeholder={example}
        />
        <div className="flex items-center justify-between gap-3 mt-1">
          <p className="text-xs text-slate-400">{t("settings.context.help")}</p>
          {!promptText.trim() && (
            <button
              type="button"
              onClick={() => setPrompt(example)}
              className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {t("settings.context.useTemplate")}
            </button>
          )}
        </div>
      </div>

      {/* Text me when a booking happens */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          {t("settings.bookingAlert.label")} <span className="text-slate-400">{t("settings.bookingAlert.hint")}</span>
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={alertPhone}
          onChange={(e) => setAlertPhone(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="+1 626 555 0147"
        />
        <p className="text-xs text-slate-400 mt-1">
          {t("settings.bookingAlert.help")}
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        {isPending ? t("common:status.saving") : saved ? t("settings.saved") : t("settings.save")}
      </button>

      {saveError ? (
        <p className="text-xs text-rose-600" role="alert">{saveError}</p>
      ) : null}
    </div>
  );
}
