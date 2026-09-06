"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import type { HubConfig } from "@/lib/marketing-hub/config";
import { SECTION_KEYS, type EditorData, type SectionKey } from "./editor/types";
import { OverviewSection, AnalyticsSection } from "./editor/Overview";
import { AssistantSection, HeroSection, ProfileSection, ServicesSection, WorkforceSection } from "./editor/sections1";
import {
  AppearanceSection,
  AreasSection,
  ContentSection,
  LeadCaptureSection,
  SeoSection,
  SettingsSection,
  SocialSection,
  ToolsSection,
  TrustSection,
} from "./editor/sections2";

/**
 * The Marketing Hub editor — one page, fifteen sections, one document.
 *
 * A single route with `?section=` rather than fifteen routes: the sections
 * share one payload (the config document plus what the account can back),
 * and an agent moves between them constantly while setting up. The left rail
 * on desktop becomes a scrollable tab strip on a phone.
 *
 * Each section owns a draft of its slice and saves it alone. The response
 * carries the whole payload back, so a save in one section never leaves
 * another looking at stale data.
 */

export type SectionProps = {
  data: EditorData;
  onSaved: (data: EditorData) => void;
  goTo: (s: SectionKey) => void;
};

export default function HubEditorClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const params = useSearchParams();
  const requested = (params?.get("section") ?? null) as SectionKey | null;
  const section: SectionKey = requested && SECTION_KEYS.includes(requested) ? requested : "overview";

  const [data, setData] = useState<EditorData | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/hub/config");
      const json = (await res.json()) as EditorData & { ok?: boolean };
      if (!json?.ok) return setLoadError(true);
      setData(json);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goTo = useCallback(
    (s: SectionKey) => {
      router.replace(s === "overview" ? "/dashboard/hub" : `/dashboard/hub?section=${s}`, { scroll: false });
    },
    [router],
  );

  const nav = useMemo(
    () =>
      SECTION_KEYS.map((key) => ({
        key,
        label: t(`pages.hubEditor.sections.${key}`),
      })),
    [t],
  );

  const hubUrl = data?.identity.username ? `/@${data.identity.username}` : null;

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {t("pages.hubEditor.loadFailed")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("pages.hubEditor.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("pages.hubEditor.blurb")}</p>
        </div>
        {data ? (
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                data.identity.published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${data.identity.published ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
              {data.identity.published ? t("pages.hubEditor.statusLive") : t("pages.hubEditor.statusDraft")}
            </span>
            {hubUrl ? (
              <a
                href={hubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                {data.identity.published ? t("pages.hubEditor.viewHub") : t("pages.hubEditor.previewHub")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t("pages.hubEditor.title")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {nav.map((item) => {
              const active = item.key === section;
              return (
                <li key={item.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(item.key)}
                    aria-current={active ? "page" : undefined}
                    className={`min-h-9 w-full whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm font-medium transition ${
                      active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {!data ? (
            <div className="space-y-3" aria-busy>
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : (
            <SectionBody key={section} section={section} data={data} onSaved={setData} goTo={goTo} />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionBody({ section, ...props }: SectionProps & { section: SectionKey }) {
  switch (section) {
    case "overview":
      return <OverviewSection {...props} />;
    case "profile":
      return <ProfileSection {...props} />;
    case "hero":
      return <HeroSection {...props} />;
    case "services":
      return <ServicesSection {...props} />;
    case "assistant":
      return <AssistantSection {...props} />;
    case "workforce":
      return <WorkforceSection {...props} />;
    case "tools":
      return <ToolsSection {...props} />;
    case "areas":
      return <AreasSection {...props} />;
    case "content":
      return <ContentSection {...props} />;
    case "social":
      return <SocialSection {...props} />;
    case "leadCapture":
      return <LeadCaptureSection {...props} />;
    case "trust":
      return <TrustSection {...props} />;
    case "seo":
      return <SeoSection {...props} />;
    case "appearance":
      return <AppearanceSection {...props} />;
    case "analytics":
      return <AnalyticsSection {...props} />;
    case "settings":
      return <SettingsSection {...props} />;
    default:
      return null;
  }
}

/** Shared by sections: a draft of one slice of the document. */
export function useDraft<K extends keyof HubConfig>(data: EditorData, key: K): [HubConfig[K], (next: HubConfig[K]) => void] {
  const [draft, setDraft] = useState<HubConfig[K]>(data.config[key]);
  return [draft, setDraft];
}
