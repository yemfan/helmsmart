import type { Metadata } from "next";
import { Suspense } from "react";
import HubEditorClient from "./HubEditorClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.dashboardTitles.hub", { ns: "dashboard" }),
    description: t("pages.hubEditor.blurb", { ns: "dashboard" }),
    robots: { index: false },
  };
}

/**
 * The Marketing Hub editor — overview, every configurable section, and the
 * switch that puts the page live. One route, sections addressed by
 * `?section=`; see HubEditorClient for why.
 */
export default async function HubEditorPage() {
  const t = await getServerT();
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-600">{t("pages.hubEditor.title", { ns: "dashboard" })}</div>}>
      <HubEditorClient />
    </Suspense>
  );
}
