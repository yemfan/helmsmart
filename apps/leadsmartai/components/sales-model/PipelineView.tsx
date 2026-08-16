"use client";

import type { SalesModel } from "@/lib/sales-models";
import type { StageActivity } from "@/lib/sales-model/pipelineActivity";
import { useTranslation } from "react-i18next";

/**
 * Sales pipeline visualization — horizontal stage cards.
 *
 * Each model has a different stage list (e.g. Influencer's
 * "Audience → DM Lead → ..." vs Closer's "Prospect → Contacted → ...").
 * The component just renders whatever's in `model.pipeline` so adding
 * stages for a new model means no UI changes here.
 *
 * `activity` (when provided) shows a per-stage count under each card —
 * "412 all-time", "9 this week", etc. — so the path-to-close panel
 * doesn't feel decorative. The numbers are computed by
 * `lib/sales-model/pipelineActivity` from a snapshot of the agent's
 * contacts + transactions tables.
 */
export function PipelineView({
  model,
  activity,
}: {
  model: SalesModel;
  activity?: StageActivity[];
}) {
  const { t } = useTranslation("dashboard");
  const stages = model.pipeline;
  return (
    <section
      aria-label={t("pages.misc.pipelineAria")}
      className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.misc.pipeline")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          The path a lead takes from first touch to closed deal under the{" "}
          <span className="font-medium text-slate-800">{model.name}</span>.
        </p>
      </header>

      {/* Horizontal scroll on small screens; even-grid on wide. */}
      <ol className="flex snap-x gap-2 overflow-x-auto pb-1 md:gap-3">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1;
          const stageActivity = activity?.[idx];
          return (
            <li key={`${model.id}-stage-${idx}`} className="flex shrink-0 snap-start items-center">
              <div
                className={[
                  "flex min-w-[124px] flex-col items-start gap-1 rounded-xl border px-3 py-2.5",
                  isLast
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50",
                ].join(" ")}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 tabular-nums">
                  Step {idx + 1}
                </span>
                <span
                  className={[
                    "text-sm font-semibold",
                    isLast ? "text-emerald-800" : "text-slate-900",
                  ].join(" ")}
                >
                  {stage}
                </span>
                {stageActivity && stageActivity.count != null ? (
                  <span
                    className={[
                      "mt-0.5 inline-flex items-baseline gap-1 text-[11px] tabular-nums",
                      isLast ? "text-emerald-700" : "text-slate-600",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-sm font-semibold",
                        isLast ? "text-emerald-800" : "text-slate-900",
                      ].join(" ")}
                    >
                      {stageActivity.count}
                    </span>
                    <span>{stageActivity.label}</span>
                  </span>
                ) : null}
              </div>
              {!isLast ? (
                <span className="mx-1 text-slate-300 md:mx-2" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
