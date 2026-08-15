"use client";

import { useTranslation } from "react-i18next";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export type SettingsTabId = "voice" | "messages" | "tools" | "channels";

type Tab = {
  id: SettingsTabId;
  label: string;
  description: string;
};

/** Labels + descriptions resolve from `dashboard:settings.tabs.*` at render. */
const TABS: readonly { id: SettingsTabId }[] = [
  { id: "voice" },
  { id: "messages" },
  { id: "tools" },
  { id: "channels" },
];

const isTabId = (v: string): v is SettingsTabId =>
  TABS.some((t) => t.id === v);

export default function SettingsTabsClient({
  voice,
  messages,
  tools,
  channels,
}: {
  voice: ReactNode;
  messages: ReactNode;
  tools: ReactNode;
  channels: ReactNode;
}) {
  const { t } = useTranslation("dashboard");
  // Default tab is "messages" per handoff — returning agents are usually here
  // to tune a rule, not change their personality.
  const [activeTab, setActiveTab] = useState<SettingsTabId>("messages");

  // Honor a deep link to a specific tab — both `?tab=channels` (used by e.g. the
  // "Connect a Facebook Page" link on the transaction page) and the `#channels`
  // hash this component writes. Query param wins when both are present.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = new URLSearchParams(window.location.search).get("tab");
    const fromHash = window.location.hash.replace("#", "");
    if (fromQuery && isTabId(fromQuery)) setActiveTab(fromQuery);
    else if (isTabId(fromHash)) setActiveTab(fromHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = `#${activeTab}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [activeTab]);

  const active = TABS.find((t) => t.id === activeTab) ?? TABS[1];

  const body =
    activeTab === "voice"
      ? voice
      : activeTab === "messages"
        ? messages
        : activeTab === "tools"
          ? tools
          : channels;

  return (
    <>
      <nav
        aria-label={t("tips.settingsSections")}
        className="sticky top-0 z-10 -mx-4 mb-6 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:-mx-6"
      >
        <div
          role="tablist"
          className="mx-auto flex max-w-3xl gap-6 overflow-x-auto px-4 sm:px-6"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-brand-accent text-brand-accent-text"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                {t(`settings.tabs.${tab.id}.label`)}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">{t("settings.pageTitle")}</h1>
        <p className="mt-0.5 text-sm text-gray-500">{t(`settings.tabs.${active.id}.description`)}</p>
      </div>

      <div className="space-y-4">{body}</div>
    </>
  );
}
