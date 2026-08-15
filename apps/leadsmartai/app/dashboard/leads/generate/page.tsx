import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { getWeeklySuggestions, type Suggestion } from "@/lib/leads-gen/suggestions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("landing.metadata.title", { ns: "web_generate_leads" }),
    description: t("landing.metadata.description", { ns: "web_generate_leads" }),
    robots: { index: false },
  };
}

/**
 * Landing for the Generate Leads feature. Three sections stacked:
 *
 *   1. Two big cards (Quick Post / Run Ads — the latter Coming Soon)
 *   2. "Suggested this week" — up to 3 deep-link cards built from
 *      the agent's CRM (newest listing, upcoming open house, recent
 *      close). Each card pre-fills the wizard via query params.
 *   3. Phase roadmap footer.
 *
 * Plan-gating happens server-side in the API routes; this page is
 * accessible to any signed-in agent because we want free-plan users
 * to see what they'd get if they upgraded.
 */
export default async function GenerateLeadsPage() {
  const { agentId } = await getCurrentAgentContext();
  const t = await getServerT();
  const tg = (key: string, opts?: Record<string, unknown>): string =>
    t(key, { ns: "web_generate_leads", ...opts });

  // Suggestions are best-effort — a query failure shouldn't blank
  // the whole page. Empty array == no suggestion strip rendered.
  let suggestions: Suggestion[] = [];
  try {
    suggestions = await getWeeklySuggestions(String(agentId));
  } catch (e) {
    console.warn("[leads/generate] getWeeklySuggestions failed:", e);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{tg("landing.title")}</h1>
          <p className="text-sm text-gray-500">{tg("landing.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/leads/generate/posts"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {tg("landing.nav.posts")}
          </Link>
          <Link
            href="/dashboard/leads/generate/scheduled"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {tg("landing.nav.scheduled")}
          </Link>
          <Link
            href="/dashboard/leads/generate/recurring"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {tg("landing.nav.recurring")}
          </Link>
          <Link
            href="/dashboard/leads/generate/connect"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {tg("landing.nav.connect")}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/leads/generate/post/new"
          className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900">{tg("landing.quick_post.title")}</h2>
          <p className="mt-1 text-sm text-gray-600">{tg("landing.quick_post.body")}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:gap-1.5">
            {tg("landing.quick_post.cta")}
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5l7.5 7.5-7.5 7.5M3 12h18"
              />
            </svg>
          </span>
        </Link>

        <Link
          href="/dashboard/leads/generate/ads"
          className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312"
              />
            </svg>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{tg("landing.ads.title")}</h2>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-800">
              {tg("landing.ads.premium_badge")}
            </span>
          </div>
          <p className="text-sm text-gray-600">{tg("landing.ads.body")}</p>
          <p className="mt-3 text-xs text-gray-500">{tg("landing.ads.billing_note")}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-purple-600 group-hover:gap-1.5">
            {tg("landing.ads.cta")}
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5l7.5 7.5-7.5 7.5M3 12h18"
              />
            </svg>
          </span>
        </Link>

        {/* Video ad — lives on a listing's detail page (Video ad panel). This
            card is the discoverable entry point into it from the leads hub. */}
        <Link
          href="/dashboard/properties"
          className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{t("videoAd", { ns: "web_generate_leads" })}</h2>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800">
              New
            </span>
          </div>
          <p className="text-sm text-gray-600">
            Turn a listing&apos;s photos into a cinematic video ad — AI animates the shots, stitches them, and writes the
            caption. Then post to Facebook, Instagram, or LinkedIn.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-1.5">
            Pick a listing
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5l7.5 7.5-7.5 7.5M3 12h18" />
            </svg>
          </span>
        </Link>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{tg("landing.suggestions.heading")}</h2>
          <p className="mb-3 text-xs text-gray-500">{tg("landing.suggestions.hint")}</p>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <Link
                key={s.key}
                href={`/dashboard/leads/generate/post/new?trigger=${s.trigger}&subjectId=${encodeURIComponent(s.subjectId)}`}
                className="group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <SuggestionBadge badge={s.badge} tg={tg} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {s.title}
                    </div>
                    {s.subtitle && (
                      <div className="truncate text-xs text-gray-500">
                        {s.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-blue-600 group-hover:translate-x-0.5">
                  {tg("landing.suggestions.draft_cta")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">{tg("landing.roadmap_footer")}</p>
    </div>
  );
}

function SuggestionBadge({
  badge,
  tg,
}: {
  badge: Suggestion["badge"];
  tg: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const tone: Record<Suggestion["badge"], { bg: string; fg: string }> = {
    new: { bg: "bg-blue-100", fg: "text-blue-700" },
    this_week: { bg: "bg-emerald-100", fg: "text-emerald-700" },
    celebrate: { bg: "bg-amber-100", fg: "text-amber-800" },
  };
  const { bg, fg } = tone[badge];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${bg} ${fg}`}
    >
      {tg(`landing.suggestions.badges.${badge}`)}
    </span>
  );
}
