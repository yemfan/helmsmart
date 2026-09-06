"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import Link from "next/link";
import { contentBody, slugFor, titleOf } from "@/lib/marketing-hub/contentPages";
import {
  applyFeedView,
  platformsIn,
  postedAgo,
  type FeedItem,
  type FeedOrder,
} from "@/lib/marketing-hub/feedItems";

/**
 * The agent's published work, one card per piece of content.
 *
 * ONE CARD, NOT ONE PER NETWORK. Cross-posting is a single act — something is
 * written once and goes to Threads, Facebook and Instagram. Three rows, one
 * thing said. Before grouping, this agent's 49 posted rows rendered as 49
 * cards for 31 actual pieces of content, so a reader scrolled past the same
 * paragraph three times. The networks now appear as links on one card, which
 * removes the repetition and gives the reader somewhere to go at the same time.
 *
 * The controls only appear when they would do something: the filter needs more
 * than one network, the ordering needs more than one item. A page with three
 * posts and a full filter bar looks like a product with nothing in it.
 */

const CONTROL =
  "inline-flex min-h-10 items-center rounded-full px-3.5 py-1.5 text-sm transition ring-1 ring-inset disabled:opacity-50";

export default function HubFeed({
  items,
  username,
  labels,
}: {
  items: FeedItem[];
  /** The agent's handle, for building content-page links. */
  username: string;
  labels: {
    all: string;
    newest: string;
    oldest: string;
    readOn: string;
    alsoOn: string;
    filterLabel: string;
    orderLabel: string;
    empty: string;
  };
}) {
  const [platform, setPlatform] = useState<string | null>(null);
  const [order, setOrder] = useState<FeedOrder>("newest");

  const platforms = useMemo(() => platformsIn(items), [items]);
  const shown = useMemo(
    () => applyFeedView(items, { platform, order }),
    [items, platform, order],
  );

  if (items.length === 0) {
    return <p className="mt-3 text-slate-500">{labels.empty}</p>;
  }

  return (
    <>
      {(platforms.length > 1 || items.length > 1) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {platforms.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={labels.filterLabel}>
              <button
                type="button"
                onClick={() => setPlatform(null)}
                aria-pressed={platform === null}
                className={`${CONTROL} ${
                  platform === null
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"
                }`}
              >
                {labels.all}
              </button>
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  aria-pressed={platform === p}
                  className={`${CONTROL} capitalize ${
                    platform === p
                      ? "bg-slate-900 text-white ring-slate-900"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => setOrder((o) => (o === "newest" ? "oldest" : "newest"))}
              aria-label={labels.orderLabel}
              className={`${CONTROL} ml-auto bg-white text-slate-700 ring-slate-300 hover:bg-slate-100`}
            >
              {order === "newest" ? labels.newest : labels.oldest}
            </button>
          )}
        </div>
      )}

      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {shown.map((item) => {
          // The first network with a permalink is the one the card links to;
          // the rest are listed after it. A card whose networks all failed to
          // return a URL still renders — it just is not clickable.
          const linked = item.links.filter((l) => l.url);
          const primary = linked[0] ?? null;
          const others = linked.slice(1);

          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200"
            >
              {/*
                Same column, two media types — see mediaKind. `preload
                ="metadata"` gets the first frame as the card's still without
                pulling the whole file for a feed the visitor may never play.
              */}
              {item.mediaKind === "video" && item.imageUrl ? (
                <video
                  src={item.imageUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-square w-full bg-black object-cover"
                />
              ) : item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt=""
                  width={640}
                  height={640}
                  className="aspect-square w-full object-cover"
                  unoptimized
                />
              ) : null}
              <div className="p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {postedAgo(item.postedAt)}
                </p>
                {/*
                  The title is the card's own link, and the only one that stays
                  on this site. The network links below it leave for Facebook or
                  Threads; a reader who wants to read the post rather than visit
                  a social network needs somewhere here to go.
                */}
                <h3 className="mt-1 text-base font-semibold leading-snug">
                  <Link
                    href={`/@${username}/p/${slugFor(item)}`}
                    className="text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {titleOf(item)}
                  </Link>
                </h3>

                {/*
                  A preview of the BODY, not the caption — the caption's first
                  line is the title directly above it.
                */}
                {contentBody(item) ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-700">
                    {contentBody(item)}
                  </p>
                ) : null}

                {primary ? (
                  <p className="mt-3 text-sm">
                    <a
                      href={primary.url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-900 underline underline-offset-2 hover:text-slate-600"
                    >
                      {labels.readOn} <span className="capitalize">{primary.platform}</span>
                    </a>
                    {others.length ? (
                      <span className="text-slate-500">
                        {" · "}
                        {labels.alsoOn}{" "}
                        {others.map((l, i) => (
                          <span key={l.platform}>
                            {i > 0 ? ", " : ""}
                            <a
                              href={l.url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="capitalize underline underline-offset-2 hover:text-slate-800"
                            >
                              {l.platform}
                            </a>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
