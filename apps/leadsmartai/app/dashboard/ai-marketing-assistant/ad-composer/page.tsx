import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import AdComposerClient from "./AdComposerClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.adComposer.metaTitle", { ns: "dashboard" }),
    description: t("pages.adComposer.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export const dynamic = "force-dynamic";

/**
 * /dashboard/ai-marketing-assistant/ad-composer — hand-build a branded ad:
 * pick a template + theme + format, edit every field with a live preview, then
 * save to the pool or schedule. Signature/Team gated (the client shows an
 * upgrade note otherwise; the save API enforces it too).
 */
export default async function AdComposerPage() {
  const t = await getServerT();
  const { agentId } = await getCurrentAgentContext();
  const canCustomize = await agentHasSocialCustomization(String(agentId)).catch(() => false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">{t("pages.adComposer.heading", { ns: "dashboard" })}</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {t("pages.adComposer.intro", { ns: "dashboard" })}
        </p>
      </div>
      <AdComposerClient canCustomize={canCustomize} />
    </div>
  );
}
