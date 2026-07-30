import type { Metadata } from "next";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import AdComposerClient from "./AdComposerClient";

export const metadata: Metadata = {
  title: "Ad Composer",
  description: "Design custom social ads from templates.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * /dashboard/ai-marketing-assistant/ad-composer — hand-build a branded ad:
 * pick a template + theme + format, edit every field with a live preview, then
 * save to the pool or schedule. Signature/Team gated (the client shows an
 * upgrade note otherwise; the save API enforces it too).
 */
export default async function AdComposerPage() {
  const { agentId } = await getCurrentAgentContext();
  const canCustomize = await agentHasSocialCustomization(String(agentId)).catch(() => false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Ad Composer</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Pick a template and theme, edit the copy, preview it live, then save to your pool or schedule.
        </p>
      </div>
      <AdComposerClient canCustomize={canCustomize} />
    </div>
  );
}
