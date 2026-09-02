import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { getServerT } from "@/lib/i18n/server";
import { displayUsername } from "@/lib/identity/username";
import { loadHubByUsername, type Hub } from "@/lib/marketing-hub/loadHub";
import { postedAgo, type FeedItem } from "@/lib/marketing-hub/feedItems";
import {
  contentBody,
  findBySlug,
  isContentIndexable,
  relatedItems,
  shortDate,
  slugFor,
  titleOf,
} from "@/lib/marketing-hub/contentPages";
import { hasPrivacySignal } from "@/lib/marketing-hub/tracking";
import HubTracker from "../../HubTracker";
import { HubTags } from "../../HubTags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One piece of the agent's published content — PUBLIC, unauthenticated.
 *
 * Reached as closebossai.com/@michaelye/p/<slug>. The hub feed's cards link out
 * to Facebook and Threads; this is the one link that stays on the site, and the
 * only place the writing is readable in full.
 *
 * ONE PAGE PER PIECE OF WRITING, NOT PER PUBLICATION. `buildFeed` groups the
 * cross-posts and `slugFor` hashes the same normalised caption, so every
 * network's copy of one post resolves here. Minting a URL per publication would
 * give one cross-post four near-identical pages — the duplicate-content pattern
 * `isIndexable` already exists to keep this domain clear of.
 *
 * The page adds nothing the agent did not publish: the caption they wrote, the
 * networks it reached, their own hashtags, and links to their other posts.
 * Publication is still the consent signal — nothing unpublished is reachable.
 */

type Props = {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function canonicalFor(username: string, slug: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(
    /\/+$/,
    "",
  );
  return `${base}/@${username}/p/${slug}`;
}

/** Resolve the hub and the one item the slug names, or null. */
async function load(
  username: string,
  slug: string,
  privacySignal = false,
): Promise<{ hub: Hub; item: FeedItem } | null> {
  const hub = await loadHubByUsername(username, privacySignal);
  if (hub.status !== "ready") return null;
  const item = findBySlug(hub.feed, slug);
  return item ? { hub, item } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getServerT();
  const { username, slug } = await params;
  const found = await load(username, slug);

  if (!found) {
    return {
      title: t("hub.postNotFound", { ns: "web_marketing" }),
      robots: { index: false, follow: false },
    };
  }

  const { hub, item } = found;
  const name = hub.agent?.name?.trim() || hub.brandName || displayUsername(hub.username);
  const description = item.caption.replace(/\s+/g, " ").trim().slice(0, 155);

  return {
    title: `${titleOf(item)} — ${name}`,
    description,
    // Set explicitly, never inherited: a parent's generateMetadata MERGES
    // rather than resets, and inheriting a canonical once made every child page
    // claim to be the homepage.
    alternates: { canonical: canonicalFor(hub.username, slugFor(item)) },
    // Two bars, and both must pass. The hub's says this agent has enough real
    // content to be worth indexing at all; the content's says THIS piece is
    // substantial enough to stand as its own document rather than competing
    // with the hub for the same words.
    robots:
      hub.indexable && isContentIndexable(item)
        ? { index: true, follow: true }
        : { index: false, follow: true },
    openGraph: {
      type: "article",
      title: titleOf(item),
      description,
      url: canonicalFor(hub.username, slugFor(item)),
      publishedTime: item.postedAt,
      images: item.imageUrl ? [{ url: item.imageUrl }] : undefined,
    },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-3xl px-5 py-16">{children}</div>
    </main>
  );
}

export default async function HubContentPage({ params, searchParams }: Props) {
  const t = await getServerT();
  const { username, slug } = await params;
  const query = await searchParams;
  // Read Sec-GPC before loading, exactly as the hub does: the pixel decision
  // has to be made before a script tag exists in the tree, not after it has
  // already loaded.
  const privacySignal = hasPrivacySignal(await headers());
  const found = await load(username, slug, privacySignal);

  if (!found) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">
          {t("hub.postNotFound", { ns: "web_marketing" })}
        </h1>
        <p className="mt-3">
          <Link href={`/@${username}`} className="text-blue-700 hover:underline">
            {t("hub.backToHub", { ns: "web_marketing" })}
          </Link>
        </p>
      </Shell>
    );
  }

  const { hub, item } = found;
  const name = hub.agent?.name?.trim() || hub.brandName || displayUsername(hub.username);
  const related = relatedItems(item, hub.feed);
  // The h1 already shows the caption's first line and the chips already show
  // its hashtags; printing the caption whole would repeat both.
  const body = contentBody(item);
  const linked = item.links.filter((l) => l.url);

  const utmSource = typeof query.utm_source === "string" ? query.utm_source : null;
  const utmCampaign = typeof query.utm_campaign === "string" ? query.utm_campaign : null;

  return (
    <Shell>
      <HubTags decision={hub.tracking} />
      <HubTracker username={hub.username} utmSource={utmSource} utmCampaign={utmCampaign} />

      <p className="text-sm">
        <Link href={`/@${hub.username}`} className="text-blue-700 hover:underline">
          ← {name}
        </Link>
      </p>

      <article className="mt-6">
        <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">{titleOf(item)}</h1>
        <p className="mt-2 text-sm text-slate-500">{postedAgo(item.postedAt)}</p>

        {/*
          `imageUrl` is not always an image. A reel or a rendered video ad puts
          its MP4 in the same column, and an MP4 in an <img> draws the
          broken-image icon — the post read as broken while the video was fine.
        */}
        {item.mediaKind === "video" && item.imageUrl ? (
          <video
            src={item.imageUrl}
            controls
            playsInline
            preload="metadata"
            className="mt-6 w-full rounded-xl bg-black"
          />
        ) : item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            width={1024}
            height={1024}
            className="mt-6 w-full rounded-xl object-cover"
            unoptimized
          />
        ) : null}

        {/*
          The body, unclamped — the feed shows a title and a three-line preview,
          and this page exists so the writing is readable somewhere other than
          the network it went out on. `whitespace-pre-wrap` keeps the agent's own
          line breaks; these captions are written in short paragraphs and
          reflowing them into one block loses the shape they were written in.
        */}
        {body ? (
          <div className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
            {body}
          </div>
        ) : null}
      </article>

      {linked.length > 0 ? (
        <section className="mt-10 border-t border-slate-200 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {linked.length > 1
              ? t("hub.feedAlsoOn", { ns: "web_marketing" })
              : t("hub.feedReadOn", { ns: "web_marketing" })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {linked.map((l) => (
              <li key={l.platform} className="capitalize">
                <a
                  href={l.url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  {[l.platform, shortDate(l.postedAt)].filter(Boolean).join(" · ")} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item.topics.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("hub.topics", { ns: "web_marketing" })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {item.topics.map((topic) => (
              <li
                key={topic}
                className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
              >
                #{topic}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-10 border-t border-slate-200 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t("hub.related", { ns: "web_marketing" })}
          </h2>
          <ul className="mt-3 space-y-3">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/@${hub.username}/p/${slugFor(r)}`}
                  className="text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
                >
                  {titleOf(r)}
                </Link>
                <p className="text-xs text-slate-500">{postedAgo(r.postedAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-16 border-t border-slate-200 pt-6 text-sm">
        <Link href={`/@${hub.username}`} className="text-blue-700 hover:underline">
          {t("hub.backToHub", { ns: "web_marketing" })}
        </Link>
      </footer>
    </Shell>
  );
}
