import "server-only";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { loadHubByUsername, type Hub } from "@/lib/marketing-hub/loadHub";
import { availablePages, pageAvailable, type HubPageFacts, type HubPageKey } from "@/lib/marketing-hub/pages";
import { hasPrivacySignal } from "@/lib/marketing-hub/tracking";
import { HubTags } from "./HubTags";
import HubTracker from "./HubTracker";
import { hubLabels, type HubLabels } from "./labels";
import { displayNameOf, HubFooter, HubHeader } from "./sections";
import { hubTheme, type HubTheme } from "./theme";

/**
 * What every hub subpage shares: loading the hub (with the owner's draft
 * preview), the 404 rules, the header and footer, and the page title.
 *
 * A subpage exists only when its section would render something — the same
 * rule the menu uses — so a link the menu would not show is a 404 rather
 * than an empty page with a heading.
 */

export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(/\/+$/, "");
}

async function isOwner(agentId: number | null): Promise<boolean> {
  if (agentId === null) return false;
  try {
    const ctx = await getCurrentAgentContext();
    return String(ctx.agentId) === String(agentId);
  } catch {
    return false;
  }
}

export function pageFactsOf(hub: Hub): HubPageFacts {
  const p = hub.config.profile;
  return {
    config: hub.config,
    hasSavedConfig: hub.hasSavedConfig,
    areaCount: (hub.config.areas.items.length ? hub.config.areas.items : hub.serviceAreas).length,
    feedCount: hub.feed.length,
    hasAbout: Boolean(
      hub.bio ||
        hub.specialties.length ||
        p.yearsExperience ||
        p.languages.length ||
        p.credentials.length ||
        hub.workforce.length ||
        hub.testimonials.length ||
        hub.config.trust.points.length,
    ),
  };
}

export type LoadedHub = {
  hub: Hub;
  L: HubLabels;
  theme: HubTheme;
  locale: string;
  name: string;
  /** True when the owner is looking at an unpublished draft. */
  preview: boolean;
  pages: HubPageKey[];
};

/** Load a ready hub for a page, or 404. `page` additionally requires that page to exist. */
export async function loadHubPage(username: string, page?: HubPageKey): Promise<LoadedHub> {
  const t = await getServerT();
  const locale = await getServerLocale();
  const privacySignal = hasPrivacySignal(await headers());
  let hub = await loadHubByUsername(username, privacySignal);
  let preview = false;
  if (hub.status === "coming_soon" && (await isOwner(hub.agentId))) {
    hub = await loadHubByUsername(username, privacySignal, { allowUnpublished: true });
    preview = hub.status === "ready";
  }
  if (hub.status !== "ready") notFound();
  const facts = pageFactsOf(hub);
  if (page && !pageAvailable(page, facts)) notFound();
  return {
    hub,
    L: hubLabels(t),
    theme: hubTheme(hub.config.appearance.accent),
    locale,
    name: displayNameOf(hub),
    preview,
    pages: availablePages(facts),
  };
}

/** Metadata for a subpage: "<Page title> — <Agent>", canonical, robots. */
export async function hubPageMetadata(username: string, page: HubPageKey): Promise<Metadata> {
  const t = await getServerT();
  const hub = await loadHubByUsername(username);
  if (hub.status !== "ready" || !pageAvailable(page, pageFactsOf(hub))) {
    return { title: t("hub.notFoundTitle", { ns: "web_marketing" }), robots: { index: false, follow: false } };
  }
  const L = hubLabels(t);
  const name = displayNameOf(hub);
  const title = `${L.pages[page].title} — ${name}`;
  const url = `${siteBase()}/@${hub.username}/${page}`;
  return {
    title: { absolute: title },
    description: L.pages[page].blurb(name),
    alternates: { canonical: url },
    robots: hub.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description: L.pages[page].blurb(name), url, images: hub.portraitUrl ? [{ url: hub.portraitUrl }] : undefined },
  };
}

/** Header, tracking, footer, and a page heading around a subpage's body. */
export function HubPageFrame({
  loaded,
  page,
  children,
  heading = true,
}: {
  loaded: LoadedHub;
  page: HubPageKey;
  children: ReactNode;
  heading?: boolean;
}) {
  const { hub, L, theme, name } = loaded;
  const props = { hub, L, theme };
  return (
    <>
      <HubTracker username={hub.username} utmSource={null} utmCampaign={null} />
      <HubTags decision={hub.tracking} />
      <HubHeader {...props} current={page} />
      <main id="main-content">
        {heading ? (
          <div className="border-b border-slate-100 bg-white">
            <div className="mx-auto w-full max-w-6xl px-5 pb-8 pt-10 sm:px-8 sm:pb-10 sm:pt-14">
              <p className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.tint}`}>{name}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{L.pages[page].title}</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">{L.pages[page].blurb(name)}</p>
            </div>
          </div>
        ) : null}
        {children}
      </main>
      <HubFooter {...props} />
    </>
  );
}
