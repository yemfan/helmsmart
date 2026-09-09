import { LucideIcon } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

interface ComingSoonProps {
  icon: LucideIcon;
  /** Already-translated module name, supplied by the calling screen. */
  module: string;
  /** Already-translated explainer, supplied by the calling screen. */
  description: string;
  /** Already-translated period, e.g. the localized name of a quarter. */
  eta?: string;
}

export async function ComingSoon({ icon: Icon, module, description, eta }: ComingSoonProps) {
  const t = await getServerT("home");
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-96 text-center px-8">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h2 className="text-lg font-semibold text-slate-800 mb-2">{module}</h2>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-4">
        {description}
      </p>
      {eta && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          {t("comingSoon.eta", { eta })}
        </span>
      )}
    </div>
  );
}
