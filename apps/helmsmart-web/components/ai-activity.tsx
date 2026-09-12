import Link from "next/link";
import { Clock, Plane } from "lucide-react";
import { Avatar } from "@helm/ui";
import { intlLocale } from "@leadsmart/i18n";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { type ActivityWho } from "@/lib/ai-activity";
import { loadActivityFeed } from "@/lib/ai-activity.load";

/**
 * "What did my AI do?" — the last week of work the AI team did on the owner's
 * behalf, on the dashboard under the briefing: calls the receptionist answered
 * and booked, calls placed, missed-call and reminder texts, Auto Pilot
 * replies, posts the schedule published, and drafts waiting for approval.
 *
 * Status is text: plain rows in the page's own type, no coloured card. The one
 * exception is a line for something that should have happened and didn't.
 * Renders nothing if the feed can't load, so a failure here never takes the
 * dashboard with it. The reading itself is `lib/ai-activity.load.ts`, shared
 * with /ai-team so the two screens can never tell different stories.
 */

export async function AiActivity({ orgId }: { orgId: string }) {
  if (!orgId) return null;
  const t = await getServerT("home");
  const locale = await getServerLocale();
  const now = new Date();

  const loaded = await loadActivityFeed({ orgId, t, locale, now });
  if (!loaded) return null;
  const { rows, receptionistConnected, timeZone } = loaded;

  // Today's lines show the time; older ones the weekday — a week fits in either.
  const loc = intlLocale(locale);
  const dayFmt = new Intl.DateTimeFormat(loc, { timeZone, year: "numeric", month: "numeric", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(loc, { timeZone, hour: "numeric", minute: "2-digit" });
  const weekdayFmt = new Intl.DateTimeFormat(loc, { timeZone, weekday: "short" });
  const today = dayFmt.format(now);
  const stamp = (iso: string) => {
    const d = new Date(iso);
    return dayFmt.format(d) === today ? timeFmt.format(d) : weekdayFmt.format(d);
  };

  return (
    <section aria-labelledby="ai-activity-heading" className="mt-5 max-w-2xl">
      <div className="flex items-baseline gap-2">
        <h2 id="ai-activity-heading" className="text-sm font-semibold text-slate-800">
          {t("aiActivity.title")}
        </h2>
        <span className="text-xs text-slate-400">{t("aiActivity.window")}</span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-1.5 text-sm text-slate-600">
          {receptionistConnected ? t("aiActivity.emptyConnected") : t("aiActivity.empty")}{" "}
          <Link
            href={receptionistConnected ? "/voice" : "/settings#voice-agent"}
            className="font-medium text-indigo-600 hover:text-indigo-800"
          >
            {receptionistConnected ? t("aiActivity.openReceptionist") : t("aiActivity.setUpReceptionist")}
          </Link>
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="flex items-center gap-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900"
              >
                <WhoMark who={r.who} />
                <span className={`min-w-0 flex-1 ${r.tone === "warning" ? "text-amber-700" : ""}`}>
                  {r.text}
                  {r.detail ? <span className="text-slate-400">{" · "}{r.detail}</span> : null}
                </span>
                <time dateTime={r.at} className="shrink-0 text-xs tabular-nums text-slate-400">
                  {stamp(r.at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The WHO of a line: the employee's face, or a quiet mark for Auto Pilot and automatic sends. The name is in the sentence. */
function WhoMark({ who }: { who: ActivityWho }) {
  if (who.kind === "employee" && who.avatar) {
    return <Avatar id={who.avatar} size={20} alt="" className="shrink-0 rounded-full" />;
  }
  const Icon = who.kind === "autoPilot" ? Plane : Clock;
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      <Icon className="h-3 w-3" />
    </span>
  );
}
