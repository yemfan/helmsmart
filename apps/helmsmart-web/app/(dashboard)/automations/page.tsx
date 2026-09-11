import type { Metadata } from "next";
import { Zap } from "lucide-react";
import { listAutomationRules } from "@/lib/actions/automations";
import { getServerT } from "@/lib/i18n/server";
import { AutomationsList } from "./automations-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("workflows");
  // The root layout's template appends the brand; adding it here as well
  // rendered "Automations · HelmSmart | HelmSmart".
  return { title: t("meta.automations") };
}

export default async function AutomationsPage() {
  const t = await getServerT("workflows");
  const rules = await listAutomationRules();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Zap className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t("automations.title")}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{t("automations.subtitle")}</p>
          </div>
        </div>
      </div>

      <AutomationsList initialRules={rules} />
    </div>
  );
}
