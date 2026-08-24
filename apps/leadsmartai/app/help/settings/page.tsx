import type { Metadata } from "next";
import Link from "next/link";

import { cardsByTab } from "@/lib/help/settings-cards";
import { getGuide } from "@/lib/help/guides";

export const metadata: Metadata = {
  title: "Settings, card by card — Help | CloseBoss AI",
  description:
    "Every card on the CloseBoss Settings page, in the order you see it, with a screenshot and a guide for each one.",
  alternates: { canonical: "/help/settings" },
  openGraph: {
    title: "Settings, card by card",
    description: "Every card on the Settings page, with a screenshot and a guide for each.",
    url: "/help/settings",
    type: "website",
  },
};

/**
 * The Settings reference: one entry per card, grouped by the tab it lives on,
 * in the same order the product shows them.
 *
 * This page exists because "here are 60 guides" is not an answer to "how do I
 * set this up". An agent looking at a card in the product should be able to find
 * that exact card here by its heading, see it, and read only what applies to it.
 */
export default function SettingsHelpIndexPage() {
  const groups = cardsByTab();
  const total = groups.reduce((n, g) => n + g.cards.length, 0);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <nav className="text-sm text-slate-500">
          <Link href="/help" className="hover:text-slate-900 hover:underline">
            Help center
          </Link>
          <span aria-hidden> / </span>
          <span className="text-slate-700">Settings</span>
        </nav>

        <header className="mt-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Settings, card by card
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            All {total} cards on your Settings page, in the order you see them. Find the card you are
            looking at, then read only the guide for that card.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Settings saves per card — there is no global Save button, and no card silently changes
            another.
          </p>
        </header>

        {groups.map((group) => (
          <section key={group.tab} className="mt-14">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              {group.tab}
            </h2>

            <ul className="mt-5 space-y-8">
              {group.cards.map((c) => {
                const guide = getGuide(c.guide);
                return (
                  <li
                    key={c.card}
                    className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
                  >
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h3 className="text-base font-semibold text-slate-900">{c.card}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{c.summary}</p>
                      {guide ? (
                        <Link
                          href={`/help/guides/${c.guide}`}
                          className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline"
                        >
                          {guide.title} <span aria-hidden>→</span>
                        </Link>
                      ) : null}
                    </div>
                    {/* Plain <img>: prerendered screenshots at a fixed size, so
                        next/image buys nothing here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.image}
                      alt={`The ${c.card} card in Settings → ${c.tab}`}
                      loading="lazy"
                      className="w-full border-t border-slate-100"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="mt-16 border-t border-slate-200 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Where to start
          </h2>
          <ul className="mt-3 space-y-2 text-base">
            <li>
              <Link href="/help/guides/review-policy" className="text-blue-700 hover:underline">
                Review Policy — decide what sends without you
              </Link>
            </li>
            <li>
              <Link href="/help/guides/message-timing" className="text-blue-700 hover:underline">
                Quiet hours and daily message limits
              </Link>
            </li>
            <li>
              <Link
                href="/help/guides/compliance-guardrails"
                className="text-blue-700 hover:underline"
              >
                The compliance rules you cannot turn off
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
