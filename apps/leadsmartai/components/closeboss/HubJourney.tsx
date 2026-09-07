"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Journey } from "@/lib/marketing-hub/visitor";

/**
 * How this person found the agent, before they ever said hello.
 *
 * The payoff of the visitor stitch: instead of another anonymous name, the
 * Realtor sees "read 3 pages across 2 visits before getting in touch — first
 * arrived via facebook". That is the sentence that changes how the call opens.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING. Most contacts arrive by phone,
 * import or open house and will never have web events. An empty block saying
 * "0 pages from unknown" reads as a fact about the person rather than a gap in
 * what we recorded, and it would sit on almost every contact in the drawer.
 * Silence is the correct output for absence.
 *
 * Fetched separately from the profile rather than folded into its payload:
 * this is a different table with a different index, most contacts have no rows
 * at all, and the drawer should not wait on it to show who someone is.
 */
export function HubJourney({ contactId }: { contactId: string | null }) {
  const { t } = useTranslation("dashboard");
  const [journey, setJourney] = useState<Journey | null>(null);

  useEffect(() => {
    setJourney(null);
    if (!contactId) return;
    let cancelled = false;
    fetch(`/api/dashboard/contacts/${encodeURIComponent(contactId)}/journey`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.ok) setJourney(j.journey as Journey);
      })
      // Silent: a missing journey is the normal case, never an error worth
      // showing someone reading a contact record.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!journey) return null;
  const { viewsBeforeConverting: views, visits, firstSource, firstCampaign, convertedAt } = journey;
  // Nothing recorded, or nothing worth a line.
  if (views === 0 && !firstSource) return null;

  const readLine = [
    t("pages.leadDrawer.journeyPages", { count: views }),
    visits > 1 ? t("pages.leadDrawer.journeyVisits", { count: visits }) : null,
    convertedAt ? t("pages.leadDrawer.journeyBefore") : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {t("pages.leadDrawer.howTheyFoundYou")}
      </p>
      {views > 0 ? (
        <p className="mt-1 text-sm leading-snug text-slate-700 dark:text-slate-300">{readLine}</p>
      ) : (
        <p className="mt-1 text-sm leading-snug text-slate-500">
          {t("pages.leadDrawer.journeyStillBrowsing")}
        </p>
      )}
      {firstSource ? (
        <p className="mt-0.5 text-xs text-slate-500">
          {t("pages.leadDrawer.journeyFirstVia", { source: firstSource })}
          {firstCampaign
            ? ` · ${t("pages.leadDrawer.journeyCampaign", { campaign: firstCampaign })}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
