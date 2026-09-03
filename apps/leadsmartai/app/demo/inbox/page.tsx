import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { DemoShell, DemoDisabledButton } from "@/components/demo/DemoShell";
import { DEMO_CONVERSATIONS } from "@/lib/demo/data";
import { localizeConversation, localizeSource } from "@/lib/demo/localize";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.demoPages.metaInboxTitle", { ns: "dashboard" }),
    description: t("pages.demoPages.metaInboxDescription", { ns: "dashboard" }),
    alternates: { canonical: "/demo/inbox" },
    robots: { index: false, follow: true },
  };
}

export default async function DemoInbox() {
  const t = await getServerT();
  const conversations = DEMO_CONVERSATIONS.map(localizeConversation.bind(null, t));
  const focused = conversations[0];

  return (
    <DemoShell active="/demo/inbox">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{t("pages.demoPages.inbox", { ns: "dashboard" })}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("pages.demoPages.inboxCount", {
              ns: "dashboard",
              total: conversations.length,
              unread: conversations.filter((c) => c.unread).length,
            })}
          </p>
        </div>
        <DemoDisabledButton label={t("pages.demoPages.compose", { ns: "dashboard" })} />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        {/* Thread list */}
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.needsReply", { ns: "dashboard" })}</p>
            <p className="text-[10px] font-medium text-slate-400">{t("pages.demoPages.autoSorted", { ns: "dashboard" })}</p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.map((conv, i) => (
              <li
                key={conv.id}
                className={`px-4 py-3 ${
                  i === 0
                    ? "border-l-2 border-l-blue-600 bg-blue-50/40 dark:border-l-blue-400 dark:bg-blue-500/5"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {conv.contactName}
                      </span>
                      <ScoreBadge score={conv.score} />
                      {conv.unread ? (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full bg-blue-500"
                        />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {conv.contactCity} · {localizeSource(t, conv.source)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {conv.preview}
                    </p>
                  </div>
                  <p className="shrink-0 text-[10px] font-medium text-slate-400">
                    {formatAgo(t, conv.ago)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Focused conversation */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <header className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {focused.contactName}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {focused.contactCity} ·{" "}
                  {t("pages.demoPages.sourceScore", {
                    ns: "dashboard",
                    source: focused.source,
                    score: focused.score,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <DemoDisabledButton label={t("pages.demoPages.call", { ns: "dashboard" })} variant="ghost" />
                <DemoDisabledButton label={t("pages.demoPages.videoEmail", { ns: "dashboard" })} variant="ghost" />
                <DemoDisabledButton label={t("pages.demoPages.addToDeal", { ns: "dashboard" })} variant="ghost" />
              </div>
            </div>
          </header>

          <div className="space-y-4 px-5 py-5">
            {focused.messages.map((m) => (
              <Message key={m.id} message={m} agoLabel={formatAgo(t, m.ago)} />
            ))}
          </div>

          <footer className="border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  {t("pages.demoPages.aiSuggestionReady", { ns: "dashboard" })}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  &ldquo;Sarah — confirmed Saturday 11am with the listing
                  agent. Calendar invite incoming. Want me to also flag the
                  two similar condos in case you want to make it a tour
                  day?&rdquo;
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <DemoDisabledButton label={t("pages.demoPages.approveSend", { ns: "dashboard" })} />
                  <DemoDisabledButton label={t("pages.demoPages.edit", { ns: "dashboard" })} variant="ghost" />
                  <DemoDisabledButton label={t("pages.demoPages.discard", { ns: "dashboard" })} variant="ghost" />
                </div>
              </div>
            </div>
          </footer>
        </section>
      </div>
    </DemoShell>
  );
}

function Message({
  message,
  agoLabel,
}: {
  message: (typeof DEMO_CONVERSATIONS)[number]["messages"][number];
  agoLabel: string;
}) {
  const isOutbound = message.direction === "outbound";
  const aligned = isOutbound ? "items-end" : "items-start";
  const bubble = isOutbound
    ? "bg-blue-600 text-white"
    : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className={`flex flex-col gap-1 ${aligned}`}>
      <div className="flex items-center gap-2">
        {message.aiGenerated ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
            <Sparkles className="h-2.5 w-2.5" aria-hidden />
            AI
          </span>
        ) : null}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {message.fromLabel} · {message.channel.toUpperCase()}
        </p>
        <p className="text-[10px] text-slate-400">{agoLabel}</p>
      </div>
      <p className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-6 ${bubble}`}>
        {message.body}
      </p>
    </div>
  );
}

function ScoreBadge({ score }: { score: "A" | "B" | "C" }) {
  const palette = {
    A: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    B: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    C: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  }[score];
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold ${palette}`}
    >
      {score}
    </span>
  );
}

/**
 * Relative age. The m/h/d suffixes are the app talking, not a fixture, so they
 * are keys: "38m" is not how a Chinese-speaking reader writes 38 minutes.
 */
function formatAgo(
  t: (key: string, opts?: Record<string, unknown>) => string,
  min: number,
): string {
  if (min < 60) return t("pages.demoPages.agoMinutes", { ns: "dashboard", n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("pages.demoPages.agoHours", { ns: "dashboard", n: hr });
  const day = Math.floor(hr / 24);
  return t("pages.demoPages.agoDays", { ns: "dashboard", n: day });
}
