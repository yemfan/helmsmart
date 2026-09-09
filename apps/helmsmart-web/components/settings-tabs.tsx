"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Building2, DollarSign, Mic, Cog, Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";

type TabKey = "general" | "financial" | "marketing" | "voice" | "operations";

// Labels come from the `nav` bundle (`settingsTabs.<key>`), so the tab keys
// stay the deep-link vocabulary (`?tab=marketing`) whatever the language.
const TABS: { key: TabKey; icon: typeof Building2 }[] = [
  { key: "general", icon: Building2 },
  { key: "financial", icon: DollarSign },
  { key: "marketing", icon: Megaphone },
  { key: "voice", icon: Mic },
  { key: "operations", icon: Cog },
];

/**
 * Tabbed Settings shell. Each tab's content is server-rendered in the page and
 * passed in as a slot, so this stays a thin client component just for tab state.
 */
export function SettingsTabs({
  general,
  financial,
  marketing,
  voice,
  operations,
}: {
  general: ReactNode;
  financial: ReactNode;
  marketing: ReactNode;
  voice: ReactNode;
  operations: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("general");
  const { t } = useTranslation("nav");

  // Deep-link from other pages: ?tab=marketing (e.g. the /social autopilot
  // Settings link) opens Marketing; #voice-agent / #operations still work.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && ["general", "financial", "marketing", "voice", "operations"].includes(q)) {
      setTab(q as TabKey);
      return;
    }
    const hash = window.location.hash;
    if (hash === "#voice-agent") setTab("voice");
    else if (hash === "#operations") setTab("operations");
  }, []);

  const slots: Record<TabKey, ReactNode> = { general, financial, marketing, voice, operations };

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-8 overflow-x-auto">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(`settingsTabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="space-y-8">{slots[tab]}</div>
    </div>
  );
}
