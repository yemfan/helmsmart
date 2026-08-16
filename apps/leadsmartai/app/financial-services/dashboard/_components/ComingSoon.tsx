import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Shared empty-state for routes that are scaffolded for the GFI pitch
 * demo IA but not yet built. Each placeholder route imports this and
 * passes its own title/description/icon + a clear "Available in pilot
 * week X" framing so execs see the roadmap baked in.
 */
export default function ComingSoon({
  icon: Icon,
  title,
  description,
  availability = "Pilot week 2",
  bulletPoints,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Free-form label e.g. "Pilot week 2", "Pilot week 4", "Phase 2". */
  availability?: string;
  /** Optional list of capabilities the feature will ship with. */
  bulletPoints?: string[];
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50">
            <Icon className="h-7 w-7 text-indigo-600" />
          </div>

          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">{t("pages.dashFragments.availableIn")} {availability}
          </span>

          <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
            {title} {t("pages.dashFragments.shipsDuringPilot")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </p>

          {bulletPoints && bulletPoints.length > 0 && (
            <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
              {bulletPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 text-sm leading-6 text-slate-700"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-xs text-slate-500">{t("pages.financialServices.cohortFeedback")}</p>
        </div>
      </section>
    </div>
  );
}
