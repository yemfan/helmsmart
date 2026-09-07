import type { Metadata } from "next";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { isPaidPlanCached } from "@/lib/credits/cachedPlan";
import GalleryClient from "./GalleryClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.gallery.metaTitle", { ns: "dashboard" }),
    description: t("pages.gallery.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export const dynamic = "force-dynamic";

/**
 * /dashboard/ai-marketing-assistant/gallery — every picture and video the
 * platform holds for the agent, gathered from the places that keep them.
 * Viewing is open to every plan; uploading into the library is Pro and above,
 * and the page says so instead of failing the upload.
 */
export default async function GalleryPage() {
  const t = await getServerT();
  const ctx = await getCurrentAgentContext();
  const canUpload = await isPaidPlanCached(ctx.userId).catch(() => false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.gallery.heading", { ns: "dashboard" })}</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t("pages.gallery.intro", { ns: "dashboard" })}</p>
      </div>
      <GalleryClient canUpload={canUpload} />
    </div>
  );
}
