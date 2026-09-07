import { getServerLocale, getServerT } from "@/lib/i18n/server";
import type { TopPostItem } from "@/lib/leads-gen/top-posts";

type WebPostsT = (key: string, opts?: { ns?: string; [k: string]: unknown }) => string;

/**
 * "Top performers" strip on the web Posts page. Server-rendered;
 * renders up to 3 cards side-by-side at the top of the list with
 * the agent's highest-engagement posts (last 14 days). Each card
 * is a link to the live post on Meta — the History list below
 * holds the full per-row controls.
 *
 * The strip auto-hides upstream (`top.hasMetrics`) so brand-new
 * agents don't see an empty section.
 */
export default async function TopPerformersStrip({
  items,
  windowDays,
}: {
  items: TopPostItem[];
  windowDays: number;
}) {
  const t = await getServerT();
  const locale = await getServerLocale();
  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        {t("top_performers.title", { ns: "web_posts" })}
        <span className="text-xs font-normal text-slate-500">
          {t("top_performers.window", { ns: "web_posts", days: windowDays })}
        </span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => (
          <Card key={item.id} item={item} rank={idx + 1} t={t} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function Card({
  item,
  rank,
  t,
  locale,
}: {
  item: TopPostItem;
  rank: number;
  t: WebPostsT;
  locale: string;
}) {
  const platformLabel =
    item.platform === "facebook" || item.platform === "instagram" || item.platform === "linkedin"
      ? t(`platforms.${item.platform}`, { ns: "web_posts" })
      : item.platform;
  const platformAccent =
    item.platform === "facebook"
      ? "bg-blue-100 text-blue-700"
      : item.platform === "instagram"
        ? "bg-pink-100 text-pink-700"
        : "bg-sky-100 text-sky-700";
  const accountName =
    item.pageName ??
    item.igBusinessUsername ??
    item.linkedinDisplayName ??
    t("card.account_fallback", { ns: "web_posts" });
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;

  const cells: Array<{ label: string; value: number | null }> = [
    { label: t("top_performers.metrics.likes", { ns: "web_posts" }), value: item.metrics.likes },
    { label: t("top_performers.metrics.comments", { ns: "web_posts" }), value: item.metrics.comments },
    { label: t("top_performers.metrics.shares", { ns: "web_posts" }), value: item.metrics.shares },
    { label: t("top_performers.metrics.saves", { ns: "web_posts" }), value: item.metrics.saves },
  ];
  const ranked = cells
    .filter((c) => (c.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3);

  const Inner = (
    <article className="group relative h-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex gap-3">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-lg font-bold text-slate-500">
            #{rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${platformAccent}`}
            >
              {platformLabel}
            </span>
            <span className="truncate text-slate-600 dark:text-slate-400">{accountName}</span>
          </div>
          <p className="line-clamp-2 text-sm text-slate-800 dark:text-slate-200">{item.caption}</p>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {item.engagementScore.toLocaleString(locale)}
        </span>
        <span className="text-xs font-medium text-slate-500">
          {t("top_performers.total_engagement", { ns: "web_posts" })}
        </span>
      </div>

      {ranked.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {ranked.map((c) => (
            <span key={c.label}>
              <strong className="text-slate-700 dark:text-slate-300">
                {c.value!.toLocaleString(locale)}
              </strong>{" "}
              {c.label}
            </span>
          ))}
        </div>
      )}

      {publishedAt && (
        <p className="mt-2 text-[11px] text-slate-500">
          {publishedAt.toLocaleString(locale, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
    </article>
  );

  if (item.externalPostUrl) {
    return (
      <a
        href={item.externalPostUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
      >
        {Inner}
      </a>
    );
  }
  return Inner;
}
