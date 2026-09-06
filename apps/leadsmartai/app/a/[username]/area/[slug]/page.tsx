import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Home, MapPin, MessageCircle, Search } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";
import { areaPlaceName, areaSlug, findArea, postsForArea, type AreaRef } from "@/lib/marketing-hub/areas";
import { contentBody, slugFor, titleOf } from "@/lib/marketing-hub/contentPages";
import { postedAgo } from "@/lib/marketing-hub/feedItems";
import { loadHubByUsername, type Hub } from "@/lib/marketing-hub/loadHub";
import { hasPrivacySignal } from "@/lib/marketing-hub/tracking";
import { HubTags } from "../../HubTags";
import HubTracker from "../../HubTracker";
import { hubLabels } from "../../labels";
import { displayNameOf, HubFooter, HubHeader } from "../../sections";
import { BTN, hubTheme } from "../../theme";
import TrackedLink from "../../TrackedLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /@handle/area/<slug> — one of the agent's market areas, as its own page.
 *
 * The local-SEO surface: "<Area> real estate" with this agent's name on it,
 * their posts that mention the area, and the same three ways to act as the
 * hub. Nothing is invented about the area — the page says what the agent
 * wrote (the area's note) and shows what they published; the market facts
 * are one question to the assistant away.
 *
 * Indexable only when the hub is, and only for areas the agent lists.
 */

type Props = { params: Promise<{ username: string; slug: string }> };

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(/\/+$/, "");
}

function areasOf(hub: Hub): AreaRef[] {
  return hub.config.areas.items.length
    ? hub.config.areas.items
    : hub.serviceAreas.map((name) => ({ name, note: null }));
}

async function load(username: string, slug: string, privacySignal = false) {
  const hub = await loadHubByUsername(username, privacySignal);
  if (hub.status !== "ready" || !hub.config.areas.enabled) return null;
  const area = findArea(areasOf(hub), slug);
  return area ? { hub, area } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getServerT();
  const { username, slug } = await params;
  const found = await load(username, slug);
  if (!found) {
    return { title: t("hub.notFoundTitle", { ns: "web_marketing" }), robots: { index: false, follow: false } };
  }
  const { hub, area } = found;
  const L = hubLabels(t);
  const name = displayNameOf(hub);
  const place = areaPlaceName(area.name);
  const title = `${L.area.title(place)} — ${name}`;
  const description = L.area.metaDescription(name, place);
  const url = `${siteBase()}/@${hub.username}/area/${areaSlug(area.name)}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: hub.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url, images: hub.portraitUrl ? [{ url: hub.portraitUrl }] : undefined },
  };
}

export default async function HubAreaPage({ params }: Props) {
  const t = await getServerT();
  const { username, slug } = await params;
  const found = await load(username, slug, hasPrivacySignal(await headers()));
  if (!found) notFound();

  const { hub, area } = found;
  const L = hubLabels(t);
  const theme = hubTheme(hub.config.appearance.accent);
  const name = displayNameOf(hub);
  const place = areaPlaceName(area.name);
  const posts = postsForArea(hub.feed, area.name);
  const others = areasOf(hub).filter((a) => a.name !== area.name);
  const props = { hub, L, theme };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${L.area.title(place)} — ${name}`,
    url: `${siteBase()}/@${hub.username}/area/${areaSlug(area.name)}`,
    about: { "@type": "Place", name: area.name },
    author: { "@type": "RealEstateAgent", name, url: `${siteBase()}/@${hub.username}` },
  };

  return (
    <>
      <HubTracker username={hub.username} utmSource={null} utmCampaign={null} />
      <HubTags decision={hub.tracking} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HubHeader {...props} />
      <main id="main-content">
        <section className="bg-white py-10 sm:py-16">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Link href={`/@${hub.username}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {L.area.back}
            </Link>
            <p className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.tint}`}>
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {L.area.kicker}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">{L.area.title(place)}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-700">{area.note?.trim() || L.area.intro(name, place)}</p>
            {area.note ? <p className="mt-2 max-w-2xl text-base text-slate-600">{L.area.intro(name, place)}</p> : null}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <TrackedLink
                username={hub.username}
                href={`/@${hub.username}/home-value`}
                event="home_value_started"
                meta={{ label: `area:${areaSlug(area.name)}` }}
                className={`${BTN} ${theme.primary} ${theme.ring} w-full sm:w-auto`}
              >
                <Home className="h-4 w-4" aria-hidden />
                {L.cta.home_value}
              </TrackedLink>
              <TrackedLink
                username={hub.username}
                href={`/homes/search?agent=${encodeURIComponent(hub.username)}&q=${encodeURIComponent(`homes for sale in ${area.name}`)}`}
                event="home_search_started"
                meta={{ label: `area:${areaSlug(area.name)}` }}
                className={`${BTN} ${theme.secondary} ${theme.ring} w-full sm:w-auto`}
              >
                <Search className="h-4 w-4" aria-hidden />
                {L.area.searchIn(place)}
              </TrackedLink>
              {hub.assistantAvailable ? (
                <TrackedLink
                  username={hub.username}
                  href={`/@${hub.username}#assistant`}
                  event="hero_cta_click"
                  meta={{ action: "ai_chat", label: `area:${areaSlug(area.name)}` }}
                  className={`${BTN} ${theme.secondary} ${theme.ring} w-full sm:w-auto`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  {L.area.askAbout(place)}
                </TrackedLink>
              ) : null}
            </div>
          </div>
        </section>

        <section className="bg-slate-50 py-12 sm:py-16">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{L.area.posts(place)}</h2>
            {posts.length ? (
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((item) => (
                  <li key={item.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition hover:shadow-[var(--shadow-raised)]">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{postedAgo(item.postedAt)}</p>
                    <h3 className="mt-1 text-base font-semibold leading-snug text-slate-900">
                      <TrackedLink
                        username={hub.username}
                        href={`/@${hub.username}/p/${slugFor(item)}`}
                        event="content_opened"
                        meta={{ slug: slugFor(item) }}
                        className="hover:underline"
                      >
                        {titleOf(item)}
                      </TrackedLink>
                    </h3>
                    {contentBody(item) ? <p className="mt-2 line-clamp-3 text-sm text-slate-600">{contentBody(item)}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-slate-600">{L.area.noPosts}</p>
            )}
          </div>
        </section>

        {others.length ? (
          <section className="bg-white py-12 sm:py-16">
            <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
              <h2 className="text-lg font-semibold text-slate-900">{L.area.otherAreas}</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {others.map((a) => (
                  <li key={a.name}>
                    <Link
                      href={`/@${hub.username}/area/${areaSlug(a.name)}`}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme.ring}`}
                    >
                      {a.name}
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </main>
      <HubFooter {...props} />
    </>
  );
}
