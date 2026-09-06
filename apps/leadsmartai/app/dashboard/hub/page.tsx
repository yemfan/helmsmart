import type { Metadata } from "next";
import { Suspense } from "react";
import HubSettingsClient from "./HubSettingsClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.dashboardTitles.hub", { ns: "dashboard" }),
    description: "Set up your public marketing hub.",
    robots: { index: false },
  };
}

/**
 * Marketing hub settings — where the agent claims their @handle, writes their
 * bio, connects their own analytics, and puts the hub live.
 *
 * The public page has existed since #1436 and the tracking since #1440, but
 * both were reachable only by editing the database. This is the surface that
 * makes the feature belong to the agent rather than to whoever has SQL access.
 */
export default async function HubSettingsPage() {
  const t = await getServerT();
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-slate-600">
          {t("pages.hubSettings.title", { ns: "dashboard" })}
        </div>
      }
    >
      <HubSettingsClient />
    </Suspense>
  );
}
