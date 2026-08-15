import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { Sparkles } from "lucide-react";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listOpenSignals } from "@/lib/contacts/service";
import SphereSignalsList from "@/components/dashboard/SphereSignalsList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.sphereSignals.metaTitle", { ns: "dashboard" }),
    description: t("pages.sphereSignals.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default async function SignalsPage() {
  const t = await getServerT();
  const { agentId } = await getCurrentAgentContext();
  const signals = await listOpenSignals(agentId);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-md shadow-amber-100/40">
          <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t("pages.sphereSignals.heading", { ns: "dashboard" })}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("pages.sphereSignals.intro", { ns: "dashboard" })}
          </p>
        </div>
      </div>

      <SphereSignalsList signals={signals} />
    </div>
  );
}
